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
import {OBJECTS, findObject, mergeSpecText, sketchToObject} from './content';
import type {ObjectInfo} from './content';
import Explainer from './Explainer';
import {arrangeExplore, bridgeHttpOrigin, exploreMediaFromShow, isExploreChapter, probeExploreMedia} from './explore';
import type {ExploreMedia} from './explore';
import kettleManifest from '../../bridge/media/kettle/manifest.json';
import phoneManifest from '../../bridge/media/phone/manifest.json';

type View =
  | {k: 'home'}
  | {k: 'ask'}
  | {k: 'blank'}
  | {k: 'capturing'}
  | {k: 'detecting'; reqId: string}
  | {
      k: 'explain';
      key: number;
      objectId: string;
      info: ObjectInfo;
      /** Streamed media for the Explore lens (first chapter of `info` when set). */
      explore?: ExploreMedia | null;
      label?: string;
      /** Ack target for `rendered`; undefined for replays. */
      reqId?: string;
      /** True when `rendered` was already sent for this request (sketch opened from the unknown view). */
      acked?: boolean;
      /** Request that a later `sketch` frame is matched against (unknown view only). */
      sketchReq?: string;
      /** Original request id, retained so replayed sketches can be deduplicated. */
      sourceReq?: string;
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

interface VoiceToolHost {
  registerTool(tool: {
    name: string;
    description: string;
    inputSchema: {
      type: 'object';
      properties: Record<string, {type: 'string'; description: string}>;
      required?: string[];
    };
    annotations?: {readOnlyHint: boolean};
    execute(args: {object?: unknown} | null | undefined): string;
  }, options: {signal: AbortSignal}): unknown;
}

function spokenObject(text: unknown): 'phone' | 'kettle' | null {
  if (typeof text !== 'string') return null;
  const phone = /\b(?:smart\s*phone|phone)s?\b/i.test(text);
  const kettle = /\bkettles?\b/i.test(text);
  if (phone === kettle) return null;
  return phone ? 'phone' : 'kettle';
}

const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

declare global {
  interface Window {
    __lensDebug?: {
      mergeSpecText: typeof mergeSpecText;
      /** Test-only: add or replace a library object (the state check's Explore fixture). */
      registerObject: (object: ObjectInfo) => void;
      /** Test-only: open a library object the way the home buttons do. */
      open?: (objectId: string) => void;
    };
  }
}

if (navigator.webdriver) {
  window.__lensDebug = {
    mergeSpecText,
    registerObject: object => {
      const index = OBJECTS.findIndex(item => item.id === object.id);
      if (index >= 0) OBJECTS[index] = object;
      else OBJECTS.push(object);
    },
  };
}

function exploreBeats(info: ObjectInfo): number {
  return info.chapters.find(isExploreChapter)?.captions.length ?? 0;
}

/** A sketch's Explore chapter plays only when its rendered media came with it (`sketch.media`). */
function arrangeSketch(info: ObjectInfo, raw: unknown, showMedia?: unknown): {info: ObjectInfo; explore: ExploreMedia | null} {
  const own = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as {media?: unknown}).media : undefined;
  const origin = bridgeHttpOrigin();
  const beats = exploreBeats(info);
  return arrangeExplore(info, exploreMediaFromShow(own, beats, origin) ?? exploreMediaFromShow(showMedia, beats, origin));
}

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
      const translatedKnobs = Array.isArray(c.knobs) && Array.isArray(t.knobLabels) && t.knobLabels.length === c.knobs.length
        ? c.knobs.map((knob, index) => {
            const label = t.knobLabels?.[index];
            return knob && typeof label === 'string' ? {...knob, label} : knob;
          })
        : c.knobs;
      return {
        ...c,
        title: typeof t.title === 'string' && t.title ? t.title : c.title,
        lead: typeof t.lead === 'string' && t.lead ? t.lead : c.lead,
        captions:
          Array.isArray(t.steps) && t.steps.length === c.captions.length && t.steps.every(x => typeof x === 'string' && x)
            ? t.steps
            : c.captions,
        knobs: translatedKnobs,
        spec: Object.hasOwn(t, 'specText') ? mergeSpecText(c.spec, t.specText) : c.spec,
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
  /** Ask the phone app (camera-only mode) to take a photo; the result comes back as a normal `show`. */
  takePhoto: () => void;
  openAsk: () => void;
}

function clampHomeIndex(index: number, count: number): number {
  return Math.max(0, Math.min(count - 1, index));
}

function HomeScreen({connected, openObject, startDemo, takePhoto, openAsk}: HomeScreenProps) {
  const columns = OBJECTS.length > 6 ? 3 : 2;
  const choices = useMemo(
    () => [
      ...(connected ? [{id: 'photo', label: 'Take photo', short: 'Photo', onClick: () => takePhoto()}] : []),
      ...OBJECTS.map(object => ({id: object.id, label: object.label, short: object.short, onClick: () => openObject(object.id)})),
      {id: 'demo', label: 'Demo', short: 'Demo', onClick: () => startDemo()},
      {id: 'ask', label: 'Ask', short: 'Ask', onClick: openAsk},
    ],
    [connected, openObject, startDemo, takePhoto, openAsk],
  );
  const rows: typeof choices[] = [];
  for (let index = 0; index < choices.length; index += columns) rows.push(choices.slice(index, index + columns));
  const buttonRefs = useRef<Array<ButtonHandle | null>>([]);
  const [shortLabels, setShortLabels] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => buttonRefs.current[0]?.getElement()?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [connected]);

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

function AskScreen({onAsk, onBack, voiceStatus}: {
  onAsk: (text: string) => boolean;
  onBack: () => void;
  voiceStatus: string;
}) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <Page headerText="Ask Physics Lens" enableSystemBarInset={false}>
      <form className="ask-form" onSubmit={event => {
        event.preventDefault();
        setInvalid(!onAsk(text));
      }}>
        <label htmlFor="lens-question">What should I explain?</label>
        <input id="lens-question" type="text" autoFocus value={text} maxLength={160}
          placeholder="How does a phone work?" onChange={event => {
            setText(event.target.value);
            setInvalid(false);
          }} />
        {invalid && <p role="alert">Ask about a smartphone or an electric kettle.</p>}
        <div className="ask-actions">
          <button type="submit">Show visual</button>
          <button type="button" onClick={onBack}>Back</button>
        </div>
        <small role="status">{voiceStatus}</small>
      </form>
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter') return;
      const element = buttonRef.current?.getElement();
      if (element?.contains(document.activeElement)) return;
      event.preventDefault();
      onAccept();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onAccept]);

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
  const [voiceStatus, setVoiceStatus] = useState('Hey Meta · checking availability');
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const librarySeq = useRef(0);
  const [card, setCard] = useState<Card | null>(null);
  const [doffed, setDoffed] = useState(false);
  const [consentRequired, setConsentRequired] = useState(consentNeeded);
  const [demoActive, setDemoActive] = useState(false);
  const keyRef = useRef(0);
  const viewRef = useRef<View>(view);
  const consentRef = useRef(consentRequired);
  consentRef.current = consentRequired;
  const bridgeRef = useRef<BridgeClient | null>(null);
  const cardTimer = useRef<number | undefined>(undefined);
  const detectTimer = useRef<number | undefined>(undefined);
  const captureTimer = useRef<number | undefined>(undefined);
  const paintFrame = useRef<number | undefined>(undefined);
  const sketchTimer = useRef<number | undefined>(undefined);
  const earlySketch = useRef<{message: Extract<BridgeMsg, {type: 'sketch'}>; received: number} | null>(null);
  const deferredBridge = useRef<DeferredBridgeMsg | null>(null);
  const bridgeHandler = useRef<((message: BridgeMsg) => void) | null>(null);
  const demoAdvance = useRef<(() => void) | null>(null);
  const demoUrlSeconds = useRef(urlDemoSeconds());
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

  const [inspectionKey, setInspectionKey] = useState<number>();
  const kettleSelectedAt = useRef<number | undefined>(undefined);
  const [kettleMotionMs, setKettleMotionMs] = useState<number>();
  const setViewNow = useCallback((next: View | ((current: View) => View)) => {
    const resolved = typeof next === 'function' ? next(viewRef.current) : next;
    if (resolved.k !== 'capturing') window.clearTimeout(captureTimer.current);
    viewRef.current = resolved;
    setView(resolved);
  }, []);
  const openAsk = useCallback(() => setViewNow({k: 'ask'}), [setViewNow]);

  const openObject = useCallback((objectId: string, extra?: Partial<View & {k: 'explain'}>) => {
    keyRef.current += 1;
    setViewNow({k: 'explain', key: keyRef.current, objectId, info: findObject(objectId), ...extra} as View);
  }, [setViewNow]);

  // A library object opened on the glasses (home, demo): the bridge's media folder says whether
  // its Explore beats exist. Without them the object opens on its next lens.
  // Camera-only mode: the phone app keeps no Display, so this Web App stays in front. The bridge relays
  // `capture` to the phone app, which takes the photo; its result arrives here as `detecting` then `show`.
  const takePhoto = useCallback(() => {
    if (!connectedRef.current || viewRef.current.k === 'capturing' || viewRef.current.k === 'detecting') return;
    flashCard(null);
    setViewNow({k: 'capturing'});
    bridgeRef.current?.send({type: 'capture', t_sent: Date.now()});
    captureTimer.current = window.setTimeout(() => {
      if (viewRef.current.k !== 'capturing') return;
      setViewNow({k: 'home'});
      flashCard({
        title: 'No photo arrived',
        body: 'Open Physics Lens on your phone and check that the glasses are connected. Then try again.',
      }, CARD_MS);
    }, 35000);
  }, [flashCard, setViewNow]);

  useEffect(() => () => window.clearTimeout(captureTimer.current), []);

  const openLibrary = useCallback((objectId: string, extra?: Partial<View & {k: 'explain'}>) => {
    const base = findObject(objectId);
    const beats = exploreBeats(base);
    const seq = ++librarySeq.current;
    if (objectId === 'kettle' || objectId === 'phone') {
      const manifest = objectId === 'kettle' ? kettleManifest : phoneManifest;
      const media = exploreMediaFromShow({base: `/media/${objectId}`, lenses: manifest.lenses}, beats, bridgeHttpOrigin());
      if (media) {
        if (objectId === 'kettle') {
          kettleSelectedAt.current = performance.now();
          setKettleMotionMs(undefined);
        }
        openObject(objectId, {...extra, ...arrangeExplore(base, media)});
        return;
      }
    }
    if (!beats || !bridgeHttpOrigin()) {
      openObject(objectId, {...extra, ...arrangeExplore(base, null)});
      return;
    }
    const before = viewRef.current;
    void probeExploreMedia(objectId, beats).then(media => {
      if (seq !== librarySeq.current || viewRef.current !== before) return;
      openObject(objectId, {...extra, ...arrangeExplore(base, media)});
    });
  }, [openObject]);

  const openSpokenObject = useCallback((objectId: 'phone' | 'kettle') => {
    flashCard(null);
    openLibrary(objectId, {initialLens: 0, initialStep: 0});
  }, [flashCard, openLibrary]);

  useEffect(() => {
    const host = (document as Document & {modelContext?: VoiceToolHost}).modelContext;
    if (!host?.registerTool) {
      setVoiceStatus('Hey Meta · WebMCP unavailable on this device');
      return;
    }
    const lifetime = new AbortController();
    void Promise.resolve().then(async () => {
      if (lifetime.signal.aborted) return;
      try {
        await host.registerTool({
          name: 'physics_lens_get_state',
          description: 'Read the visual currently shown in Physics Lens and the topics you can open.',
          annotations: {readOnlyHint: true},
          inputSchema: {type: 'object', properties: {}},
          execute: () => {
            const current = viewRef.current;
            return JSON.stringify({screen: current.k, visual: current.k === 'explain' ? current.info.label : null,
              topics: ['smartphone', 'electric kettle']});
          },
        }, {signal: lifetime.signal});
      } catch (error) {
        console.warn('Physics Lens voice state registration failed', error);
      }
      if (lifetime.signal.aborted) return;
      try {
        await host.registerTool({
          name: 'physics_lens_show_explanation',
          description: 'Open the animated visual explanation on the glasses when asked how a smartphone or electric kettle works.',
          inputSchema: {
            type: 'object',
            properties: {object: {type: 'string', description: 'The requested object. Use phone for a smartphone or mobile phone, and kettle for an electric kettle.'}},
            required: ['object'],
          },
          execute: args => {
            setVoiceStatus('Hey Meta · command received');
            const objectId = spokenObject(args?.object);
            if (!objectId) return JSON.stringify({error: true, message: 'Ask about a smartphone or an electric kettle.'});
            openSpokenObject(objectId);
            const label = objectId === 'phone' ? 'smartphone' : 'electric kettle';
            return JSON.stringify({visual: label, next_action: 'Confirm the visual opened in one short sentence.'});
          },
        }, {signal: lifetime.signal});
        if (!lifetime.signal.aborted) setVoiceStatus(current => current.endsWith('command received') ? current : 'Hey Meta · registered, waiting for a command');
      } catch (error) {
        if (!lifetime.signal.aborted) setVoiceStatus('Hey Meta · registration failed');
        console.warn('Physics Lens voice tool registration failed', error);
      }
    });
    return () => lifetime.abort();
  }, [openSpokenObject]);

  const clearDetectTimer = useCallback(() => {
    window.clearTimeout(detectTimer.current);
    detectTimer.current = undefined;
  }, []);

  const clearSketchTimer = useCallback(() => {
    window.clearTimeout(sketchTimer.current);
    sketchTimer.current = undefined;
  }, []);

  const armSketchTimer = useCallback((reqId: string) => {
    clearSketchTimer();
    sketchTimer.current = window.setTimeout(() => {
      const current = viewRef.current;
      if (current.k === 'explain' && current.info.id === 'unknown' && current.sketchReq === reqId && current.sketchState === 'pending') {
        setViewNow({...current, sketchState: 'failed'});
      }
      sketchTimer.current = undefined;
    }, 25000);
  }, [clearSketchTimer, setViewNow]);

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
    const safeSeconds = Number.isFinite(seconds) ? seconds : 5;
    run.stepMs = Math.min(20, Math.max(2, safeSeconds)) * 1000;
    run.objectIndex = 0;
    run.lensIndex = 0;
    run.stepIndex = 0;
    run.phase = 'step';
    setDemoActive(true);
    openLibrary(OBJECTS[0].id, {initialLens: 0, initialStep: 0});
    scheduleDemo(run.stepMs);
  }, [clearDemoTimer, openLibrary, scheduleDemo]);

  const advanceDemo = useCallback(() => {
    const run = demoRun.current;
    if (!run.active) return;
    if (run.phase === 'gap') {
      run.objectIndex = (run.objectIndex + 1) % OBJECTS.length;
      run.lensIndex = 0;
      run.stepIndex = 0;
      run.phase = 'step';
      openLibrary(OBJECTS[run.objectIndex].id, {initialLens: 0, initialStep: 0});
      scheduleDemo(run.stepMs);
      return;
    }

    // Count the lenses the wearer actually sees (Explore only when its media is there).
    const shown = viewRef.current;
    const object = shown.k === 'explain' && shown.objectId === OBJECTS[run.objectIndex].id ? shown.info : OBJECTS[run.objectIndex];
    const chapter = object.chapters[run.lensIndex];
    if (!chapter) {
      run.phase = 'gap';
      setViewNow({k: 'home'});
      scheduleDemo(1500);
      return;
    }
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
    setViewNow({k: 'home'});
    scheduleDemo(1500);
  }, [openLibrary, scheduleDemo, setViewNow]);
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
    if (consentRequired || demoUrlSeconds.current === null || demoRun.current.active) return;
    const timer = window.setTimeout(() => {
      if (!demoRun.current.active && demoUrlSeconds.current !== null) startDemo(demoUrlSeconds.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [consentRequired, startDemo]);

  // Bridge connection.
  useEffect(() => {
    const applySketch = (m: Extract<BridgeMsg, {type: 'sketch'}>, v: View): boolean => {
      if (v.k !== 'explain' || v.info.id !== 'unknown' || v.sketchReq === undefined || v.sketchReq !== m.reqId) return false;
      clearSketchTimer();
      const sk = m.error === undefined && m.sketch !== undefined && m.sketch !== null ? sketchToObject(m.sketch) : null;
      if (sk) {
        openObject('sketch', {
          ...arrangeSketch(sk, m.sketch),
          label: sk.label,
          reqId: v.reqId,
          acked: v.acked,
          sourceReq: m.reqId,
          lang: v.lang,
          standIn: v.standIn,
        });
      } else {
        setViewNow({...v, sketchState: 'failed'});
      }
      return true;
    };

    const onMessage = (m: BridgeMsg): void => {
      const current = viewRef.current;
      if (m.type === 'show' && !m.replay && current.k === 'detecting' && current.reqId !== m.reqId) return;
      if (m.type === 'error' && current.k === 'detecting' && m.reqId !== undefined && current.reqId !== m.reqId) return;
      if (m.type === 'show' && m.replay && current.k === 'explain') {
        if (m.objectId !== 'unknown' && current.objectId === m.objectId) return;
        if (m.objectId === 'unknown' && current.info.id === 'unknown') return;
        if (m.objectId === 'unknown' && current.info.provenance === 'sketch' && current.sourceReq === m.reqId) return;
      }
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
          clearSketchTimer();
          setViewNow({k: 'detecting', reqId: m.reqId});
          {
            const timeoutMs = m.timeoutMs === undefined ? 12000 : Math.min(120000, Math.max(2000, m.timeoutMs));
          detectTimer.current = window.setTimeout(() => {
            if (viewRef.current.k === 'detecting' && viewRef.current.reqId === m.reqId) {
              setViewNow({k: 'home'});
              flashCard({title: 'Took too long', body: 'Try again.'}, ERROR_MS);
            }
            detectTimer.current = undefined;
          }, timeoutMs);
          }
          break;
        case 'show':
          clearDetectTimer();
          clearSketchTimer();
          if (m.lowConfidence) {
            setViewNow({k: 'home'});
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
            const common = {reqId: m.replay ? undefined : m.reqId, sourceReq: m.reqId, standIn: m.standIn === true};
            if (m.objectId === 'unknown') {
              const queued = earlySketch.current;
              const early = queued?.message.reqId === m.reqId && Date.now() - queued.received <= 2000 ? queued.message : null;
              if (early) earlySketch.current = null;
              const sketchValue = m.sketch !== undefined && m.sketch !== null ? m.sketch : early?.sketch;
              const sketchFailed = m.sketch === undefined && early?.error !== undefined;
              const sk = sketchValue !== undefined && sketchValue !== null && !sketchFailed
                ? sketchToObject(sketchValue)
                : null;
              if (sk) {
                openObject('sketch', {...common, ...arrangeSketch(sk, sketchValue, m.media), label: sk.label, lang});
              } else {
                const sketchState = early
                  ? 'failed'
                  : m.sketchPending === true
                    ? 'pending'
                    : undefined;
                openObject('unknown', {
                  ...common,
                  label: m.label,
                  answer: m.answer,
                  question: m.question,
                  sketchReq: m.reqId,
                  sketchState,
                  lang,
                });
                if (sketchState === 'pending') armSketchTimer(m.reqId);
              }
              break;
            }
            const library = findObject(m.objectId);
            const translated = lang !== undefined && lang !== 'en' && Array.isArray(m.lenses);
            const arranged = arrangeExplore(
              translated ? localise(library, m) : library,
              exploreMediaFromShow(m.media, exploreBeats(library), bridgeHttpOrigin()),
            );
            // For a new capture, open the rendered film. Keep follow-up links to their exact explanation.
            const base = arranged.explore && !m.question && m.objectId !== 'phone'
              ? {...arranged.info, chapters: arranged.info.chapters.slice(0, 1)}
              : arranged.info;
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
              info: base,
              explore: arranged.explore,
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
          if (!applySketch(m, v)) earlySketch.current = {message: m, received: Date.now()};
          break;
        }
        case 'ping':
          break;
        case 'nav':
          setDoffed(false);
          if (m.action === 'demo') {
            if (demoRun.current.active) stopDemo();
            else if (!consentRef.current) startDemo();
          } else {
            stopDemo();
            emitNav(m.action);
          }
          break;
        case 'clear':
          stopDemo();
          clearDetectTimer();
          clearSketchTimer();
          setViewNow({k: 'blank'});
          break;
        case 'device':
          if (m.state === 'first_run') {
            stopDemo();
            flashCard(null);
            consentRef.current = true;
            setConsentRequired(true);
          } else if (m.state === 'doffed') {
            stopDemo();
            setDoffed(true);
          }
          else if (m.state === 'donned') {
            setDoffed(false);
            flashCard(null);
          } else if (m.state === 'online') flashCard(null);
          else {
            const c = Object.hasOwn(DEVICE_CARDS, m.state) ? DEVICE_CARDS[m.state] : undefined;
            if (c) flashCard(c, m.state === 'offline' ? 60000 : CARD_MS);
          }
          break;
        case 'error':
          clearDetectTimer();
          if (viewRef.current.k === 'detecting') setViewNow({k: 'home'});
          flashCard({title: 'Something went wrong', body: m.message || m.code || 'Try again.'}, ERROR_MS);
          break;
      }
    };
    bridgeHandler.current = onMessage;
    const url = bridgeUrl();
    if (!url) return;
    const onStatus = (isConnected: boolean, closeCode?: number): void => {
      connectedRef.current = isConnected;
      setConnected(isConnected);
      if (isConnected) {
        setDoffed(false);
        flashCard(null);
        return;
      }
      if (viewRef.current.k === 'detecting') {
        clearDetectTimer();
        setViewNow({k: 'home'});
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
      clearSketchTimer();
      window.cancelAnimationFrame(paintFrame.current ?? 0);
    };
  }, [openObject, flashCard, clearDetectTimer, clearSketchTimer, armSketchTimer, setViewNow, startDemo, stopDemo]);

  useEffect(() => {
    const debug = window.__lensDebug;
    if (!debug) return;
    debug.open = (objectId: string) => openLibrary(objectId);
    return () => {
      delete debug.open;
    };
  }, [openLibrary]);

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
      setDoffed(false);
      if (a === 'done' && viewRef.current.k !== 'home') setViewNow({k: 'home'});
    });
    const wake = (e: KeyboardEvent): void => {
      setDoffed(false);
      if (viewRef.current.k === 'blank' && (e.key === 'Enter' || e.key.startsWith('Arrow'))) {
        e.preventDefault();
        setViewNow({k: 'home'});
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => {
      off();
      window.removeEventListener('keydown', wake, true);
    };
  }, [setViewNow]);

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
    if (viewRef.current.k === 'explain' && inspectionKey === viewRef.current.key) {
      setInspectionKey(undefined);
      return true;
    }
    if (viewRef.current.k !== 'home') {
      setViewNow({k: 'home'});
      return true;
    }
    return false;
  });

  const reqId = view.k === 'explain' && !view.acked ? view.reqId : undefined;
  const onRendered = useCallback(() => {
    if (reqId && !demoRun.current.active) {
      if (window.parent !== window) {
        window.parent.postMessage({type: 'lens:paint', reqId}, window.location.origin);
      }
      bridgeRef.current?.send({type: 'rendered', reqId, t_rendered: Date.now()});
      const current = viewRef.current;
      if (current.k === 'explain' && current.reqId === reqId && !current.acked) setViewNow({...current, acked: true});
    }
  }, [reqId, setViewNow]);
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
  } else if (view.k === 'detecting' || view.k === 'capturing') {
    body = (
      <div className="center" role="status" aria-live="polite">
        <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
          {view.k === 'capturing' ? 'Taking the photo…' : 'Looking…'}
        </TextView>
      </div>
    );
  } else if (view.k === 'explain') {
    body = (
      <Page showHeader={false} enableSystemBarInset={false}>
        <Explainer
          key={view.key}
          info={view.info}
          explore={view.explore ?? null}
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
          paused={doffed}
          inspecting={inspectionKey === view.key}
          onInspect={() => setInspectionKey(view.key)}
          onExitInspect={() => setInspectionKey(undefined)}
          onNewCapture={connected ? takePhoto : () => setViewNow({k: 'home'})}
          onRendered={onRendered}
          onMotion={() => {
            if (view.objectId === 'kettle' && kettleSelectedAt.current !== undefined) {
              setKettleMotionMs(Math.round(performance.now() - kettleSelectedAt.current));
              kettleSelectedAt.current = undefined;
            }
            if (view.reqId && window.parent !== window) {
              window.parent.postMessage({type: 'lens:motion', reqId: view.reqId}, window.location.origin);
            }
          }}
          motionMs={view.objectId === 'kettle' ? kettleMotionMs : undefined}
          onState={onState}
        />
      </Page>
    );
  } else if (view.k === 'ask') {
    body = <AskScreen voiceStatus={voiceStatus} onBack={() => setViewNow({k: 'home'})} onAsk={text => {
      const objectId = spokenObject(text);
      if (!objectId) return false;
      openSpokenObject(objectId);
      return true;
    }} />;
  } else {
    body = <HomeScreen connected={connected} openObject={openLibrary} startDemo={startDemo} takePhoto={takePhoto} openAsk={openAsk} />;
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
