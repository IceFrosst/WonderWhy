import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  App as WearablesApp,
  Button,
  ButtonRail,
  Page,
  Panel,
  ScrollView,
  TextStyle,
  TextView,
  useBackNavigation,
} from '@wearables-ui-toolkit/mrbd';
import type {ButtonHandle} from '@wearables-ui-toolkit/mrbd';
import {BridgeClient, bridgeUrl} from './bridge';
import type {BridgeMsg, ShowMsg} from './bridge';
import {emitNav, onNav} from './bus';
import {OBJECTS, findObject, sketchToObject} from './content';
import type {ObjectInfo} from './content';
import Explainer from './Explainer';

type View =
  | {k: 'home'}
  | {k: 'blank'}
  | {k: 'detecting'; reqId: string}
  | {
      k: 'explain';
      key: number;
      objectId: string;
      info: ObjectInfo;
      label?: string;
      /** Ack target for `rendered`; undefined for replays. */
      reqId?: string;
      /** True when `rendered` was already sent for this request (sketch opened from the unknown view). */
      acked?: boolean;
      /** Request that a later `sketch` frame is matched against (unknown view only). */
      sketchReq?: string;
      sketchState?: 'pending' | 'failed';
      answer?: string;
      question?: string;
      lang?: string;
      standIn?: boolean;
      initialLens?: number;
      initialStep?: number;
      followUpLens?: number;
      followUpStep?: number;
    };

type DeferredBridgeMsg = Extract<BridgeMsg, {type: 'show' | 'detecting'}>;

interface DemoRun {
  active: boolean;
  stepMs: number;
  objectIndex: number;
  lensIndex: number;
  stepIndex: number;
  phase: 'step' | 'gap';
  timer?: number;
  due: number;
  remaining: number;
}

const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

/** Translated copy of a library object from a `show` (never mutates the library). */
function localise(base: ObjectInfo, m: ShowMsg): ObjectInfo {
  const lenses = m.lenses;
  if (base.id === 'unknown' || !Array.isArray(lenses)) return base;
  return {
    ...base,
    label: typeof m.label === 'string' && m.label ? m.label : base.label,
    answer: typeof m.summary === 'string' && m.summary ? m.summary : base.answer,
    chapters: base.chapters.map(c => {
      const t = c.lens ? lenses.find(l => l && l.id === `${base.id}.${c.lens}`) : undefined;
      if (!t) return c;
      return {
        ...c,
        title: typeof t.title === 'string' && t.title ? t.title : c.title,
        lead: typeof t.lead === 'string' && t.lead ? t.lead : c.lead,
        captions:
          Array.isArray(t.steps) && t.steps.length === c.captions.length && t.steps.every(x => typeof x === 'string' && x)
            ? t.steps
            : c.captions,
      };
    }),
  };
}

const CARD_MS = 6000;
const ERROR_MS = 4000; // error cards auto-dismiss after 4 s (PROTOCOL.md)

interface Card {
  title: string;
  body: string;
}

const DEVICE_CARDS: Record<string, Card> = {
  battery_low: {title: 'Battery low', body: 'Charge the glasses soon.'},
  thermal_hot: {title: 'Glasses are hot', body: 'Let them cool down for a moment.'},
  offline: {title: 'Offline', body: 'No connection. Built-in demos still work.'},
  camera_denied: {title: 'Camera blocked', body: 'Allow camera access on the phone.'},
};

interface HomeScreenProps {
  connected: boolean;
  openObject: (objectId: string) => void;
  startDemo: () => void;
}

function clampHomeIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

function HomeScreen({connected, openObject, startDemo}: HomeScreenProps) {
  const columns = OBJECTS.length > 6 ? 3 : 2;
  const choices = useMemo(
    () => [
      ...OBJECTS.map(object => ({id: object.id, label: object.label, short: object.short, onClick: () => openObject(object.id)})),
      {id: 'demo', label: 'Demo', short: 'Demo', onClick: startDemo},
    ],
    [openObject, startDemo],
  );
  const rows: typeof choices[] = [];
  for (let index = 0; index < choices.length; index += columns) rows.push(choices.slice(index, index + columns));
  const buttonRefs = useRef<Array<ButtonHandle | null>>([]);
  const [shortLabels, setShortLabels] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => buttonRefs.current[0]?.getElement()?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const shortened = new Set<string>();
      choices.forEach((choice, index) => {
        const root = buttonRefs.current[index]?.getElement();
        const title = root?.querySelector<HTMLElement>('[class*="titleLabel"]');
        if (title && title.scrollWidth > title.clientWidth + 1) shortened.add(choice.id);
      });
      setShortLabels(previous => {
        if (previous.size === shortened.size && [...shortened].every(id => previous.has(id))) return previous;
        return shortened;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [columns, choices]);

  useEffect(() => {
    const moveFocus = (action: 'left' | 'right' | 'up' | 'down'): void => {
      const current = buttonRefs.current.findIndex(handle => {
        const element = handle?.getElement();
        return Boolean(element && element.contains(document.activeElement));
      });
      const start = current < 0 ? 0 : current;
      const delta = action === 'left' ? -1 : action === 'right' ? 1 : action === 'up' ? -columns : columns;
      const next = clampHomeIndex(start + delta, choices.length);
      buttonRefs.current[next]?.getElement()?.focus({preventScroll: true});
    };
    const off = onNav(action => {
      if (action === 'left' || action === 'right' || action === 'up' || action === 'down') moveFocus(action);
    });
    const onKey = (event: KeyboardEvent): void => {
      const actions: Record<string, 'left' | 'right' | 'up' | 'down'> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      moveFocus(action);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      off();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [choices.length, columns]);

  let flatIndex = 0;
  return (
    <Page
      headerText="Physics Lens"
      headerMetadata={connected ? 'Bridge connected' : 'Bridge offline (demo)'}
      enableSystemBarInset={false}
    >
      <div className={`action-page-shell home-page home-page--${columns === 3 ? 'three' : 'two'}`}>
        <ScrollView insetForHeader ariaLabel="Physics Lens">
          <Panel width="100%">
            <div className="content-inset home-intro">
              <TextView as="p" textStyle={TextStyle.BODY2}>
                Look at something, or pick one.
              </TextView>
            </div>
          </Panel>
        </ScrollView>
        <div className="action-dock home-dock">
          {rows.map((row, rowIndex) => (
            <ButtonRail className="home-rail" key={rowIndex} centerContentWhenSmallerThanWidth={false}>
              {row.map(choice => {
                const index = flatIndex++;
                const shorten = shortLabels.has(choice.id) || (columns === 3 && choice.label.length > 14);
                // Three to a row: always the one-word name, so no label is cut and the row reads evenly.
                const title = columns === 3 || shorten ? (choice.short ?? choice.label.trim().split(/\s+/)[0]) : choice.label;
                return (
                  <Button
                    className="home-object-button"
                    enforceMaxWidth
                    key={choice.id}
                    ref={handle => { buttonRefs.current[index] = handle; }}
                    title={title}
                    aria-label={choice.label}
                    onClick={choice.onClick}
                  />
                );
              })}
            </ButtonRail>
          ))}
        </div>
      </div>
    </Page>
  );
}

interface ConsentScreenProps {
  onAccept: () => void;
}

function ConsentScreen({onAccept}: ConsentScreenProps) {
  const buttonRef = useRef<ButtonHandle>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => buttonRef.current?.getElement()?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="consent-screen" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <Panel width="100%">
        <div className="consent-card">
          <TextView as="h1" textStyle={TextStyle.BODY2_EMPHASIZED} id="consent-title">
            Before you start
          </TextView>
          <TextView as="p" textStyle={TextStyle.META1}>
            The camera is used only when you pinch. One photo goes to our server to name the object. It is not stored.
          </TextView>
          <ButtonRail>
            <Button ref={buttonRef} title="OK, start" onClick={onAccept} />
          </ButtonRail>
        </div>
      </Panel>
    </div>
  );
}

function consentNeeded(): boolean {
  try {
    const forceConsent = new URLSearchParams(window.location.search).get('consent') === '1';
    if (navigator.webdriver && !forceConsent) return false;
    return localStorage.getItem('lens.consent') === null;
  } catch {
    return true;
  }
}

function urlDemoSeconds(): number | null {
  try {
    const value = new URLSearchParams(window.location.search).get('demo');
    if (value === null) return null;
    if (value === '1' || value === '') return 5;
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return 5;
    return Math.min(20, Math.max(2, seconds));
  } catch {
    return null;
  }
}

export default function App() {
  const [view, setView] = useState<View>({k: 'home'});
  const [connected, setConnected] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [doffed, setDoffed] = useState(false);
  const [consentRequired, setConsentRequired] = useState(consentNeeded);
  const [demoActive, setDemoActive] = useState(false);
  const keyRef = useRef(0);
  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const consentRef = useRef(consentRequired);
  consentRef.current = consentRequired;
  const bridgeRef = useRef<BridgeClient | null>(null);
  const cardTimer = useRef<number | undefined>(undefined);
  const detectTimer = useRef<number | undefined>(undefined);
  const paintFrame = useRef<number | undefined>(undefined);
  const deferredBridge = useRef<DeferredBridgeMsg | null>(null);
  const bridgeHandler = useRef<((message: BridgeMsg) => void) | null>(null);
  const demoAdvance = useRef<(() => void) | null>(null);
  const demoUrlSeconds = useRef(urlDemoSeconds());
  const demoUrlStarted = useRef(false);
  const demoRun = useRef<DemoRun>({
    active: false,
    stepMs: 5000,
    objectIndex: 0,
    lensIndex: 0,
    stepIndex: 0,
    phase: 'step',
    due: 0,
    remaining: 0,
  });

  const flashCard = useCallback((c: Card | null, ms?: number) => {
    window.clearTimeout(cardTimer.current);
    setCard(c);
    if (c && ms) cardTimer.current = window.setTimeout(() => setCard(null), ms);
  }, []);

  const openObject = useCallback((objectId: string, extra?: Partial<View & {k: 'explain'}>) => {
    keyRef.current += 1;
    setView({k: 'explain', key: keyRef.current, objectId, info: findObject(objectId), ...extra} as View);
  }, []);

  const clearDetectTimer = useCallback(() => {
    window.clearTimeout(detectTimer.current);
    detectTimer.current = undefined;
  }, []);

  const clearDemoTimer = useCallback(() => {
    window.clearTimeout(demoRun.current.timer);
    demoRun.current.timer = undefined;
  }, []);

  const scheduleDemo = useCallback((delay: number) => {
    clearDemoTimer();
    const run = demoRun.current;
    run.remaining = delay;
    run.due = performance.now() + delay;
    if (document.hidden || !run.active) return;
    run.timer = window.setTimeout(() => demoAdvance.current?.(), delay);
  }, [clearDemoTimer]);

  const stopDemo = useCallback(() => {
    const run = demoRun.current;
    if (!run.active) return;
    run.active = false;
    clearDemoTimer();
    setDemoActive(false);
  }, [clearDemoTimer]);

  const startDemo = useCallback((seconds = 5) => {
    clearDemoTimer();
    const run = demoRun.current;
    run.active = true;
    run.stepMs = Math.min(20, Math.max(2, seconds)) * 1000;
    run.objectIndex = 0;
    run.lensIndex = 0;
    run.stepIndex = 0;
    run.phase = 'step';
    setDemoActive(true);
    openObject(OBJECTS[0].id, {initialLens: 0, initialStep: 0});
    scheduleDemo(run.stepMs);
  }, [clearDemoTimer, openObject, scheduleDemo]);

  const advanceDemo = useCallback(() => {
    const run = demoRun.current;
    if (!run.active) return;
    if (run.phase === 'gap') {
      run.objectIndex = (run.objectIndex + 1) % OBJECTS.length;
      run.lensIndex = 0;
      run.stepIndex = 0;
      run.phase = 'step';
      openObject(OBJECTS[run.objectIndex].id, {initialLens: 0, initialStep: 0});
      scheduleDemo(run.stepMs);
      return;
    }

    const object = OBJECTS[run.objectIndex];
    const chapter = object.chapters[run.lensIndex];
    if (run.stepIndex + 1 < chapter.captions.length) {
      run.stepIndex += 1;
      emitNav('next');
      scheduleDemo(run.stepMs);
      return;
    }
    if (run.lensIndex + 1 < object.chapters.length) {
      run.lensIndex += 1;
      run.stepIndex = 0;
      emitNav('next');
      scheduleDemo(run.stepMs);
      return;
    }

    run.phase = 'gap';
    setView({k: 'home'});
    scheduleDemo(1500);
  }, [openObject, scheduleDemo]);
  demoAdvance.current = advanceDemo;

  useEffect(() => {
    const onVisibility = (): void => {
      const run = demoRun.current;
      if (!run.active) return;
      if (document.hidden) {
        run.remaining = Math.max(0, run.due - performance.now());
        clearDemoTimer();
      } else {
        scheduleDemo(run.remaining);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      demoRun.current.active = false;
      clearDemoTimer();
    };
  }, [clearDemoTimer, scheduleDemo]);

  useEffect(() => {
    if (consentRequired || demoUrlStarted.current || demoUrlSeconds.current === null) return;
    demoUrlStarted.current = true;
    startDemo(demoUrlSeconds.current);
  }, [consentRequired, startDemo]);

  // Bridge connection.
  useEffect(() => {
    const onMessage = (m: BridgeMsg): void => {
      if (m.type === 'show' || m.type === 'detecting') {
        stopDemo();
        if (consentRef.current) {
          deferredBridge.current = m;
          return;
        }
      }
      switch (m.type) {
        case 'detecting':
          clearDetectTimer();
          setView({k: 'detecting', reqId: m.reqId});
          detectTimer.current = window.setTimeout(() => {
            if (viewRef.current.k === 'detecting' && viewRef.current.reqId === m.reqId) {
              setView({k: 'home'});
              flashCard({title: 'Took too long', body: 'Try again.'}, ERROR_MS);
            }
            detectTimer.current = undefined;
          }, m.timeoutMs ?? 12000);
          break;
        case 'show':
          clearDetectTimer();
          if (m.lowConfidence) {
            setView({k: 'home'});
            flashCard(
              {title: 'Not sure', body: `Maybe: ${m.label ?? 'that object'}. Look again, a bit closer.`},
              CARD_MS,
            );
            if (!m.replay) {
              window.cancelAnimationFrame(paintFrame.current ?? 0);
              paintFrame.current = window.requestAnimationFrame(() => {
                paintFrame.current = window.requestAnimationFrame(() => {
                  bridgeRef.current?.send({type: 'rendered', reqId: m.reqId, t_rendered: Date.now()});
                });
              });
            }
            break;
          }
          {
            const lang = typeof m.lang === 'string' && LANG_RE.test(m.lang) ? m.lang : undefined;
            const common = {reqId: m.replay ? undefined : m.reqId, standIn: m.standIn === true};
            if (m.objectId === 'unknown') {
              const sk = m.sketch !== undefined && m.sketch !== null ? sketchToObject(m.sketch) : null;
              if (sk) {
                openObject('sketch', {...common, info: sk, label: sk.label, lang});
              } else {
                openObject('unknown', {
                  ...common,
                  label: m.label,
                  answer: m.answer,
                  question: m.question,
                  sketchReq: m.reqId,
                  sketchState: m.sketchPending === true ? 'pending' : undefined,
                  lang,
                });
              }
              break;
            }
            const base = findObject(m.objectId);
            const translated = lang !== undefined && lang !== 'en' && Array.isArray(m.lenses);
            const hintLens =
              m.lensHint && typeof m.lensHint.id === 'string'
                ? base.chapters.findIndex(chapter => `${base.id}.${chapter.lens ?? ''}` === m.lensHint?.id)
                : -1;
            const validHint = hintLens >= 0;
            const hintStep = validHint
              ? Math.min(
                  Math.max(Number.isFinite(m.lensHint?.step) ? Math.trunc(m.lensHint?.step ?? 1) : 1, 1),
                  base.chapters[hintLens].captions.length,
                ) - 1
              : 0;
            openObject(m.objectId, {
              ...common,
              info: translated ? localise(base, m) : base,
              label: m.label,
              answer: m.answer,
              question: m.question,
              lang: translated ? lang : undefined,
              initialLens: validHint ? hintLens : 0,
              initialStep: hintStep,
              followUpLens: validHint && m.question && m.answer ? hintLens : undefined,
              followUpStep: validHint && m.question && m.answer ? hintStep : undefined,
            });
          }
          break;
        case 'sketch': {
          const v = viewRef.current;
          if (v.k !== 'explain' || v.info.id !== 'unknown' || v.sketchReq === undefined || v.sketchReq !== m.reqId) break;
          const sk =
            m.error === undefined && m.sketch !== undefined && m.sketch !== null ? sketchToObject(m.sketch) : null;
          if (sk) {
            openObject('sketch', {info: sk, label: sk.label, reqId: v.reqId, acked: true, lang: v.lang, standIn: v.standIn});
          } else {
            setView({...v, sketchState: 'failed'});
          }
          break;
        }
        case 'ping':
          break;
        case 'nav':
          if (m.action === 'demo') {
            if (demoRun.current.active) stopDemo();
            else if (!consentRef.current) startDemo();
          } else {
            stopDemo();
            emitNav(m.action);
          }
          break;
        case 'clear':
          clearDetectTimer();
          setView({k: 'blank'});
          break;
        case 'device':
          if (m.state === 'first_run') {
            stopDemo();
            flashCard(null);
            consentRef.current = true;
            setConsentRequired(true);
          } else if (m.state === 'doffed') setDoffed(true);
          else if (m.state === 'donned') {
            setDoffed(false);
            flashCard(null);
          } else if (m.state === 'online') flashCard(null);
          else {
            const c = DEVICE_CARDS[m.state];
            if (c) flashCard(c, m.state === 'offline' ? undefined : CARD_MS);
          }
          break;
        case 'error':
          clearDetectTimer();
          if (viewRef.current.k === 'detecting') setView({k: 'home'});
          flashCard({title: 'Something went wrong', body: m.message || m.code}, ERROR_MS);
          break;
      }
    };
    bridgeHandler.current = onMessage;
    const url = bridgeUrl();
    if (!url) return;
    const onStatus = (isConnected: boolean, closeCode?: number): void => {
      setConnected(isConnected);
      if (isConnected) return;
      if (viewRef.current.k === 'detecting') {
        clearDetectTimer();
        setView({k: 'home'});
        flashCard({title: 'Bridge offline', body: 'Built-in demos still work.'}, ERROR_MS);
      }
      if (closeCode === 4401) {
        flashCard({title: 'Bridge locked', body: 'Open the link with the key.'});
      }
    };
    const client = new BridgeClient(url, onMessage, onStatus);
    bridgeRef.current = client;
    client.start();
    return () => {
      client.stop();
      bridgeHandler.current = null;
      bridgeRef.current = null;
      window.clearTimeout(cardTimer.current);
      clearDetectTimer();
      window.cancelAnimationFrame(paintFrame.current ?? 0);
    };
  }, [openObject, flashCard, clearDetectTimer, startDemo, stopDemo]);

  const acceptConsent = useCallback(() => {
    try {
      localStorage.setItem('lens.consent', new Date().toISOString());
    } catch {
      /* Continue for displays where storage is unavailable. */
    }
    consentRef.current = false;
    setConsentRequired(false);
  }, []);

  useEffect(() => {
    if (consentRequired || !deferredBridge.current) return;
    const message = deferredBridge.current;
    deferredBridge.current = null;
    bridgeHandler.current?.(message);
  }, [consentRequired]);

  // `done` from the bridge or Back on the glasses returns home; any key wakes a blank screen.
  useEffect(() => {
    const off = onNav(a => {
      if (a === 'done' && viewRef.current.k !== 'home') setView({k: 'home'});
    });
    const wake = (e: KeyboardEvent): void => {
      if (viewRef.current.k === 'blank' && (e.key === 'Enter' || e.key.startsWith('Arrow'))) {
        e.preventDefault();
        setView({k: 'home'});
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => {
      off();
      window.removeEventListener('keydown', wake, true);
    };
  }, []);

  // A wearer key press stops hands-free playback without also moving the current step.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!demoRun.current.active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      stopDemo();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [stopDemo]);

  useBackNavigation(() => {
    if (consentRequired) return true;
    if (card) {
      flashCard(null);
      return true;
    }
    if (viewRef.current.k !== 'home') {
      setView({k: 'home'});
      return true;
    }
    return false;
  });

  const reqId = view.k === 'explain' && !view.acked ? view.reqId : undefined;
  const onRendered = useCallback(() => {
    if (reqId && !demoRun.current.active) {
      bridgeRef.current?.send({type: 'rendered', reqId, t_rendered: Date.now()});
    }
  }, [reqId]);
  const objectId = view.k === 'explain' ? view.objectId : undefined;
  const onState = useCallback(
    (step: number, param: number | undefined, lens: string | undefined, lensIndex: number, steps: number) => {
      if (objectId) {
        bridgeRef.current?.send({
          type: 'state',
          objectId,
          step,
          param,
          lens,
          lensIndex,
          steps,
          ...(demoRun.current.active ? {demo: true} : {}),
        });
      }
    },
    [objectId],
  );

  let body;
  if (view.k === 'blank') {
    body = <div className="blank" aria-hidden="true" />;
  } else if (view.k === 'detecting') {
    body = (
      <div className="center" role="status" aria-live="polite">
        <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
          {'Looking\u2026'}
        </TextView>
      </div>
    );
  } else if (view.k === 'explain') {
    body = (
      <Page showHeader={false} enableSystemBarInset={false}>
        <Explainer
          key={view.key}
          info={view.info}
          label={view.label ?? view.info.label}
          answer={view.answer}
          question={view.question}
          sketchState={view.sketchState}
          lang={view.lang}
          standIn={view.standIn}
          initialLens={view.initialLens}
          initialStep={view.initialStep}
          followUpLens={view.followUpLens}
          followUpStep={view.followUpStep}
          demo={demoActive}
          onRendered={onRendered}
          onState={onState}
        />
      </Page>
    );
  } else {
    body = <HomeScreen connected={connected} openObject={openObject} startDemo={startDemo} />;
  }

  if (consentRequired) body = <ConsentScreen onAccept={acceptConsent} />;

  return (
    <WearablesApp>
      <div className="fill" hidden={doffed}>
        {body}
      </div>
      {card && !doffed ? (
        <div className="overlay" role="alert">
          <Panel width="100%">
            <div className="card">
              <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
                {card.title}
              </TextView>
              <TextView as="p" textStyle={TextStyle.META1}>
                {card.body}
              </TextView>
            </div>
          </Panel>
        </div>
      ) : null}
    </WearablesApp>
  );
}
