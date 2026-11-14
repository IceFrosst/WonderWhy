import {useCallback, useEffect, useRef, useState} from 'react';
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
import {BridgeClient, bridgeUrl} from './bridge';
import type {BridgeMsg} from './bridge';
import {emitNav, onNav} from './bus';
import {OBJECTS, findObject} from './content';
import Explainer from './Explainer';

type View =
  | {k: 'home'}
  | {k: 'blank'}
  | {k: 'detecting'; reqId: string}
  | {
      k: 'explain';
      key: number;
      objectId: string;
      label?: string;
      reqId?: string;
      answer?: string;
      question?: string;
    };

const HOME_ROWS = [OBJECTS.slice(0, 2), OBJECTS.slice(2, 4), OBJECTS.slice(4)];

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

export default function App() {
  const [view, setView] = useState<View>({k: 'home'});
  const [connected, setConnected] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [doffed, setDoffed] = useState(false);
  const keyRef = useRef(0);
  const viewRef = useRef<View>(view);
  viewRef.current = view;
  const bridgeRef = useRef<BridgeClient | null>(null);
  const cardTimer = useRef<number | undefined>(undefined);
  const detectTimer = useRef<number | undefined>(undefined);
  const paintFrame = useRef<number | undefined>(undefined);

  const flashCard = useCallback((c: Card | null, ms?: number) => {
    window.clearTimeout(cardTimer.current);
    setCard(c);
    if (c && ms) cardTimer.current = window.setTimeout(() => setCard(null), ms);
  }, []);

  const openObject = useCallback((objectId: string, extra?: Partial<View & {k: 'explain'}>) => {
    keyRef.current += 1;
    setView({k: 'explain', key: keyRef.current, objectId, ...extra} as View);
  }, []);

  const clearDetectTimer = useCallback(() => {
    window.clearTimeout(detectTimer.current);
    detectTimer.current = undefined;
  }, []);

  // Bridge connection.
  useEffect(() => {
    const onMessage = (m: BridgeMsg): void => {
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
          openObject(m.objectId, {
            label: m.label,
            reqId: m.replay ? undefined : m.reqId,
            answer: m.answer,
            question: m.question,
          });
          break;
        case 'ping':
          break;
        case 'nav':
          emitNav(m.action);
          break;
        case 'clear':
          clearDetectTimer();
          setView({k: 'blank'});
          break;
        case 'device':
          if (m.state === 'doffed') setDoffed(true);
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
      bridgeRef.current = null;
      window.clearTimeout(cardTimer.current);
      clearDetectTimer();
      window.cancelAnimationFrame(paintFrame.current ?? 0);
    };
  }, [openObject, flashCard, clearDetectTimer]);

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

  useBackNavigation(() => {
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

  const reqId = view.k === 'explain' ? view.reqId : undefined;
  const onRendered = useCallback(() => {
    if (reqId) bridgeRef.current?.send({type: 'rendered', reqId, t_rendered: Date.now()});
  }, [reqId]);
  const objectId = view.k === 'explain' ? view.objectId : undefined;
  const onState = useCallback(
    (step: number, param: number | undefined) => {
      if (objectId) bridgeRef.current?.send({type: 'state', objectId, step, param});
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
          Looking…
        </TextView>
      </div>
    );
  } else if (view.k === 'explain') {
    body = (
      <Page showHeader={false} enableSystemBarInset={false}>
        <Explainer
          key={view.key}
          objectId={view.objectId}
          label={view.label ?? findObject(view.objectId).label}
          answer={view.answer}
          question={view.question}
          onRendered={onRendered}
          onState={onState}
        />
      </Page>
    );
  } else {
    body = (
      <Page
        headerText="Physics Lens"
        headerMetadata={connected ? 'Bridge connected' : 'Bridge offline (demo)'}
        enableSystemBarInset={false}
      >
        <div className="action-page-shell">
          <ScrollView insetForHeader ariaLabel="Physics Lens" tabIndex={0}>
            <Panel width="100%">
              <div className="content-inset">
                <TextView as="p" textStyle={TextStyle.BODY2}>
                  Choose an object to see the physics inside it. Or look at one with the phone app.
                </TextView>
              </div>
            </Panel>
          </ScrollView>
          <div className="action-dock">
            {HOME_ROWS.map((row, i) => (
              <ButtonRail key={i}>
                {row.map(o => (
                  <Button key={o.id} title={o.label} onClick={() => openObject(o.id)} />
                ))}
              </ButtonRail>
            ))}
          </div>
        </div>
      </Page>
    );
  }

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
