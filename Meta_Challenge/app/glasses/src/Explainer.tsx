import {useCallback, useEffect, useRef, useState} from 'react';
import {Button, ButtonRail, TextColor, TextStyle, TextView} from '@wearables-ui-toolkit/mrbd';
import type {ButtonHandle} from '@wearables-ui-toolkit/mrbd';
import {emitNav, onNav} from './bus';
import type {NavAction} from './bus';
import {findObject} from './content';
import type {Step} from './content';
import {createScene} from './scenes';
import type {Readout, Scene} from './scenes';

interface Props {
  objectId: string;
  label?: string;
  answer?: string;
  question?: string;
  onRendered: () => void;
  onState: (step: number, param: number | undefined) => void;
}

const FRAME_GAP_MS = 24; // ~30 fps cap on a 60 Hz callback
const FOCUS_DELAY_MS = 50;

declare global {
  interface Window {
    __glassesFps?: number;
  }
}

export default function Explainer({objectId, label, answer, question, onRendered, onState}: Props) {
  const info = findObject(objectId);
  const known = info.id !== 'unknown';
  const [step, setStep] = useState<Step>(1);
  const [readouts, setReadouts] = useState<Readout[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const stepRef = useRef<Step>(1);
  const btnRef = useRef<ButtonHandle>(null);
  const cb = useRef({onRendered, onState});
  cb.current = {onRendered, onState};

  const reportState = useCallback(() => {
    cb.current.onState(stepRef.current, sceneRef.current?.param());
  }, []);

  const goStep = useCallback(
    (s: Step) => {
      stepRef.current = s;
      setStep(s);
      sceneRef.current?.setStep(s);
      reportState();
    },
    [reportState],
  );

  // Scene lifecycle and 30 fps loop.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!known || !stage || !canvas) {
      // No scene: tell the bridge the text is on screen after the next paint.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => cb.current.onRendered());
      });
      reportState();
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    const ctx = canvas.getContext('2d');
    const scene = createScene(objectId);
    if (!ctx || !scene) return;
    sceneRef.current = scene;
    const fit = (): void => {
      const w = Math.max(64, Math.round(stage.clientWidth));
      const h = Math.max(64, Math.round(stage.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        scene.resize(w, h);
      }
    };
    fit();
    scene.init(ctx, canvas.width, canvas.height);
    scene.setStep(stepRef.current);
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    let raf = 0;
    let last = performance.now();
    let firstDone = false;
    let lastKey = '';
    let lastSet = 0;
    let fpsFrames = 0;
    let fpsT = last;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const el = now - last;
      if (el < FRAME_GAP_MS) return;
      last = now;
      const out = scene.frame(Math.min(el / 1000, 0.1));
      fpsFrames++;
      if (now - fpsT >= 1000) {
        window.__glassesFps = (fpsFrames * 1000) / (now - fpsT);
        fpsFrames = 0;
        fpsT = now;
      }
      const key = out.map(r => r.label + r.value).join('|');
      if (key !== lastKey && now - lastSet > 110) {
        lastKey = key;
        lastSet = now;
        setReadouts(out);
      }
      if (!firstDone) {
        firstDone = true;
        setReadouts(out);
        // after the browser has painted this first frame
        requestAnimationFrame(() => cb.current.onRendered());
      }
    };
    const onVis = (): void => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);
    reportState();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [objectId, known, reportState]);

  // Arrow keys and bridge `nav` messages share one bus.
  useEffect(() => {
    const off = onNav((a: NavAction) => {
      const s = stepRef.current;
      if (a === 'next') goStep(s === 3 ? 1 : ((s + 1) as Step));
      else if (a === 'deeper') goStep(s === 3 ? 3 : ((s + 1) as Step));
      else if (a === 'prev') goStep(s === 1 ? 1 : ((s - 1) as Step));
      else if (a === 'left' || a === 'right' || a === 'up' || a === 'down') {
        const scene = sceneRef.current;
        if (!scene) return;
        if (a === 'left') scene.setParam('x', -1);
        else if (a === 'right') scene.setParam('x', 1);
        else if (a === 'up') scene.setParam('y', 1);
        else scene.setParam('y', -1);
        reportState();
      }
    });
    const keys: Record<string, NavAction> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const onKey = (e: KeyboardEvent): void => {
      const a = keys[e.key];
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        emitNav(a);
      } else if (e.key === 'Enter') {
        // Pinch normally arrives as a click on the focused button; this covers lost focus.
        const el = btnRef.current?.getElement();
        if (!el || !el.contains(document.activeElement)) {
          e.preventDefault();
          emitNav('next');
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      off();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [goStep, reportState]);

  // Keep a focus target so pinch (Enter) always lands on the step button.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = btnRef.current?.getElement();
      if (el && !el.contains(document.activeElement)) el.focus();
    }, FOCUS_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [step, objectId]);

  const title = known ? info.label : 'Not in the library yet';
  const oneLine = known ? info.answer : label ? `Looks like: ${label}` : '';
  const hasBridgeAnswer = Boolean(answer);

  return (
    <div className="ex">
      <div className="ex-head">
        <TextView as="h1" textStyle={TextStyle.BODY2_EMPHASIZED}>
          {title}
        </TextView>
        {oneLine ? (
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            {oneLine}
          </TextView>
        ) : null}
      </div>

      {known ? (
        <div className="ex-stage" ref={stageRef} aria-hidden="true">
          <canvas ref={canvasRef} className="ex-canvas" />
        </div>
      ) : (
        <div className="ex-unknown">
          <TextView as="p" textStyle={TextStyle.BODY2}>
            {answer || 'Try pointing at a ball, a guitar, a bike, a kettle or something that swings.'}
          </TextView>
        </div>
      )}

      {known ? (
        <>
          <div className="ex-read" role="status" aria-label="Live values">
            {readouts.map(r => (
              <span className="ex-chip" key={r.label}>
                <TextView textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
                  {r.label}
                </TextView>{' '}
                <TextView textStyle={TextStyle.META2_EMPHASIZED}>{r.value}</TextView>
              </span>
            ))}
          </div>
          {hasBridgeAnswer ? (
            <TextView as="p" textStyle={TextStyle.META1_EMPHASIZED} className="ex-answer">
              {question ? `Q: ${question} → ` : ''}
              {answer}
            </TextView>
          ) : null}
          <TextView as="p" textStyle={TextStyle.META1} className="ex-caption" aria-live="polite">
            {`Step ${step}/3. ${info.captions[step - 1]}`}
          </TextView>
          <TextView as="p" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY} className="ex-hint">
            {info.hint}
          </TextView>
        </>
      ) : null}

      <div className="ex-dock">
        <ButtonRail>
          <Button
            ref={btnRef}
            title={known ? (step === 3 ? 'Back to step 1' : `Next step (${step}/3)`) : 'Done'}
            onClick={() => emitNav(known ? 'next' : 'done')}
          />
        </ButtonRail>
      </div>
    </div>
  );
}
