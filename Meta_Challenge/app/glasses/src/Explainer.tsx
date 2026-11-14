import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {TextColor, TextStyle, TextView} from '@wearables-ui-toolkit/mrbd';
import {emitNav, onNav} from './bus';
import type {NavAction} from './bus';
import type {Chapter, ObjectInfo} from './content';
import ExploreView from './ExploreView';
import {fallbackExploreMedia, isExploreChapter, parseExploreSpec} from './explore';
import type {ExploreMedia} from './explore';
import {createScene} from './scenes';
import type {Readout, Scene} from './scenes';

interface Props {
  info: ObjectInfo;
  /** Streamed media for the Explore lens; optional fallbacks for the live renderer. */
  explore?: ExploreMedia | null;
  label?: string;
  /** Unknown view only: a sketch is being drawn, or none came. */
  sketchState?: 'pending' | 'failed';
  lang?: string;
  standIn?: boolean;
  answer?: string;
  question?: string;
  initialLens?: number;
  initialStep?: number;
  followUpLens?: number;
  followUpStep?: number;
  demo?: boolean;
  paused?: boolean;
  /** Turn it is open on the film (App owns it: Back closes it first). */
  turning: boolean;
  onTurn: () => void;
  onExitTurn: () => void;
  /** Take a new photo; undefined without a bridge. */
  onNewPhoto?: () => void;
  onRendered: () => void;
  onMotion: () => void;
  filmMs?: number;
  onState: (
    step: number,
    param: number | undefined,
    lens: string | undefined,
    lensIndex: number,
    steps: number,
  ) => void;
}

interface Position {
  info: ObjectInfo;
  lens: number;
  step: number;
}

const FRAME_GAP_MS = 1000 / 30;
const FOCUS_DELAY_MS = 50;

const LENS_NAMES: Record<string, string> = {
  explore: 'Explore',
  motion: 'Motion',
  inside: 'Inside',
  cutaway: 'Cutaway',
  flow: 'Flow',
  zoom: 'Zoom',
  whatif: 'What if',
  compare: 'Compare',
  number: 'The number',
};

function lensName(chapter: Chapter | undefined): string {
  if (!chapter) return '';
  return (chapter.lens && LENS_NAMES[chapter.lens]) || chapter.title;
}

declare global {
  interface Window {
    __glassesFps?: number;
  }
}

export default function Explainer({
  info,
  explore = null,
  label,
  sketchState,
  lang,
  standIn,
  answer,
  question,
  initialLens = 0,
  initialStep = 0,
  followUpLens,
  followUpStep,
  demo = false,
  paused = false,
  turning,
  onTurn,
  onExitTurn,
  onNewPhoto,
  onRendered,
  onMotion,
  filmMs,
  onState,
}: Props) {
  const objectId = info.id;
  const known = info.id !== 'unknown' && info.chapters.length > 0;
  const startingLens = Math.min(Math.max(initialLens, 0), Math.max(0, info.chapters.length - 1));
  const startingChapter = info.chapters[startingLens];
  const startingStep = Math.min(Math.max(initialStep, 0), Math.max(0, (startingChapter?.captions.length ?? 1) - 1));
  const [lens, setLens] = useState(startingLens);
  const [step, setStep] = useState(startingStep);
  const chapter = info.chapters[lens];
  const sceneId = chapter?.scene ?? '';
  const stepsInLens = Math.max(1, chapter?.captions.length ?? 0);
  const exploreSpec = useMemo(
    () => (isExploreChapter(chapter) ? parseExploreSpec(chapter?.spec, chapter?.captions.length ?? 0) : null),
    [chapter],
  );
  const media = useMemo(() => explore ?? fallbackExploreMedia(objectId, stepsInLens), [explore, objectId, stepsInLens]);
  const isExplore = known && exploreSpec !== null;
  const isExploreRef = useRef(isExplore);
  isExploreRef.current = isExplore;
  const [replay, setReplay] = useState(0);
  const [sceneInstance, setSceneInstance] = useState<Scene | null | undefined>(undefined);
  const [readouts, setReadouts] = useState<Readout[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const loopControlRef = useRef<{pause: () => void; resume: () => void} | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const forceReadoutsRef = useRef(false);
  const positionRef = useRef<Position>({info, lens: startingLens, step: startingStep});
  positionRef.current = {info, lens, step};
  const btnRef = useRef<HTMLButtonElement>(null);
  const homeRef = useRef<HTMLButtonElement>(null);
  const cb = useRef({onRendered, onState});
  cb.current = {onRendered, onState};

  const reportState = useCallback(() => {
    const current = positionRef.current;
    const currentChapter = current.info.chapters[current.lens];
    cb.current.onState(
      current.step + 1,
      sceneRef.current?.param(),
      currentChapter?.lens,
      current.lens,
      Math.max(1, currentChapter?.captions.length ?? 0),
    );
  }, []);

  const goPosition = useCallback(
    (nextLens: number, nextStep: number) => {
      const current = positionRef.current;
      const nextChapter = current.info.chapters[nextLens];
      if (!nextChapter) return;
      const boundedStep = Math.min(Math.max(nextStep, 0), Math.max(0, nextChapter.captions.length - 1));
      const changesLens = nextLens !== current.lens;
      positionRef.current = {...current, lens: nextLens, step: boundedStep};
      if (changesLens) sceneRef.current = null;
      else {
        sceneRef.current?.setStep(boundedStep + 1);
        forceReadoutsRef.current = true;
      }
      setLens(nextLens);
      setStep(boundedStep);
      reportState();
    },
    [reportState],
  );

  // Explore auto-play: one beat forward, never past the last beat and never into another lens.
  const autoAdvance = useCallback(() => {
    const current = positionRef.current;
    const currentChapter = current.info.chapters[current.lens];
    if (!currentChapter || !isExploreChapter(currentChapter)) return;
    if (current.step < currentChapter.captions.length - 1) goPosition(current.lens, current.step + 1);
  }, [goPosition]);
  const exploreRendered = useCallback(() => cb.current.onRendered(), []);

  // New object: start at the requested answer position, or the first step of the first lens.
  useEffect(() => {
    positionRef.current = {info, lens: startingLens, step: startingStep};
    setLens(startingLens);
    setStep(startingStep);
  }, [info, objectId, startingLens, startingStep]);

  // One scene instance belongs to one (object, lens). A layout effect prevents an old lens
  // from painting under the new title while React swaps the canvas lifecycle below.
  useLayoutEffect(() => {
    setReadouts([]);
    const next = known && chapter ? createScene(sceneId, chapter.spec) : null;
    sceneRef.current = next;
    setSceneInstance(next);
    return () => {
      if (sceneRef.current === next) sceneRef.current = null;
      next?.dispose();
    };
  }, [objectId, lens, known, sceneId, chapter?.spec]);

  // Canvas setup, 30 fps loop, first-paint notification, and readout throttling.
  useEffect(() => {
    if (sceneInstance === undefined) return;
    if (sceneInstance !== sceneRef.current) return;
    if (known && isExploreRef.current) {
      // The Explore player acknowledges the first frame itself.
      reportState();
      return;
    }
    if (!known || sceneInstance === null) {
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

    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!stage || !canvas || !ctx) return;
    const scene = sceneInstance;
    sceneRef.current = scene;
    const fit = (): void => {
      const w = Math.round(stage.clientWidth);
      const h = Math.round(stage.clientHeight);
      if (w < 64 || h < 64) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        scene.resize(w, h);
      }
    };
    fit();
    scene.init(ctx, canvas.width, canvas.height);
    scene.setStep(positionRef.current.step + 1);
    const ro = new ResizeObserver(fit);
    ro.observe(stage);

    let raf = 0;
    let last = performance.now();
    let firstDone = false;
    let lastKey = '';
    let lastSet = 0;
    let fpsFrames = 0;
    let fpsT = last;
    let running = !pausedRef.current && !document.hidden;
    const tick = (now: number): void => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const el = now - last;
      if (el < FRAME_GAP_MS) return;
      // Keep the cap at 30 fps even when requestAnimationFrame is not running at 60 Hz.
      last = now - (el % FRAME_GAP_MS);
      const out = scene.frame(Math.min(el / 1000, 0.1));
      fpsFrames++;
      if (now - fpsT >= 1000) {
        window.__glassesFps = (fpsFrames * 1000) / (now - fpsT);
        fpsFrames = 0;
        fpsT = now;
      }
      const key = out.map(r => r.label + r.value).join('|');
      const immediate = forceReadoutsRef.current;
      if (key !== lastKey && (immediate || now - lastSet >= 500)) {
        lastKey = key;
        lastSet = now;
        setReadouts(out);
      }
      if (immediate) forceReadoutsRef.current = false;
      if (!firstDone) {
        firstDone = true;
        setReadouts(out);
        // after the browser has painted this first frame
        requestAnimationFrame(() => cb.current.onRendered());
      }
    };
    const pauseLoop = (): void => {
      running = false;
      cancelAnimationFrame(raf);
    };
    const resumeLoop = (): void => {
      if (running || document.hidden || pausedRef.current) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const onVis = (): void => {
      if (document.hidden) pauseLoop();
      else resumeLoop();
    };
    loopControlRef.current = {pause: pauseLoop, resume: resumeLoop};
    document.addEventListener('visibilitychange', onVis);
    if (running) raf = requestAnimationFrame(tick);
    reportState();
    return () => {
      if (loopControlRef.current?.pause === pauseLoop) loopControlRef.current = null;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
    };
  }, [objectId, lens, known, reportState, sceneInstance]);

  useEffect(() => {
    if (paused) loopControlRef.current?.pause();
    else loopControlRef.current?.resume();
  }, [paused]);

  // 2D lenses: arrow keys and bridge `nav` messages share one bus. The 3D film has its own
  // control map (ExploreView + stageControls.ts).
  useEffect(() => {
    if (isExplore) return;
    const off = onNav((a: NavAction) => {
      const current = positionRef.current;
      const chapters = current.info.chapters;
      const currentChapter = chapters[current.lens];
      if (!currentChapter) return;
      const lastStep = Math.max(0, currentChapter.captions.length - 1);

      if (a === 'left' || a === 'right') {
        if (chapters.length < 2) return;
        const delta = a === 'left' ? -1 : 1;
        goPosition((current.lens + delta + chapters.length) % chapters.length, 0);
      } else if (a === 'up' || a === 'down') {
        const knob = currentChapter.knobs === undefined ? {axis: 'x' as const} : currentChapter.knobs[current.step];
        const scene = sceneRef.current;
        if (!knob || !scene) return;
        scene.setParam(knob.axis, a === 'up' ? 1 : -1);
        forceReadoutsRef.current = true;
        reportState();
      } else if (a === 'next') {
        if (current.step < lastStep) goPosition(current.lens, current.step + 1);
        else goPosition((current.lens + 1) % chapters.length, 0);
      } else if (a === 'deeper') {
        if (current.step < lastStep) goPosition(current.lens, current.step + 1);
      } else if (a === 'prev') {
        if (current.step > 0) goPosition(current.lens, current.step - 1);
        else if (current.lens > 0) {
          const previousLens = current.lens - 1;
          goPosition(previousLens, Math.max(0, chapters[previousLens].captions.length - 1));
        }
      }
    });
    // The pill row holds the focus (pinch presses the focused button). Left/Right move along the
    // row (Right reaches Home, Left the step button), Up/Down change the scene's value.
    const onKey = (e: KeyboardEvent): void => {
      const row = Array.from(document.querySelectorAll<HTMLButtonElement>('.ex .xp-actions button'));
      const index = row.findIndex(button => button === document.activeElement);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const target = index < 0
          ? (e.key === 'ArrowRight' ? homeRef.current : btnRef.current)
          : row[Math.min(row.length - 1, Math.max(0, index + (e.key === 'ArrowLeft' ? -1 : 1)))];
        target?.focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        emitNav(e.key === 'ArrowUp' ? 'up' : 'down');
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (index >= 0) row[index].click();
        else emitNav('next');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      off();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [goPosition, reportState, isExplore]);

  // Keep a focus target so pinch (Enter) always lands on the step button.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = btnRef.current ?? homeRef.current;
      if (el && !document.activeElement?.closest('.ex .xp-actions')) el.focus();
    }, FOCUS_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [lens, step, objectId]);

  const multi = info.chapters.length > 1;
  const isSketch = known && info.provenance === 'sketch';
  const name = lang && lang !== 'en' ? info.label : (info.short ?? info.label);
  const showFollowUp = Boolean(question && answer) && lens === followUpLens && step === followUpStep;
  const knob = chapter?.knobs?.[step];
  const hint = chapter?.knobs === undefined ? (chapter?.hint ?? '') : knob ? `Up/down: ${knob.label}.` : '';
  const onLastStep = step >= stepsInLens - 1;
  const nextLensName = lensName(info.chapters[(lens + 1) % Math.max(1, info.chapters.length)]);
  const buttonTitle = onLastStep
    ? multi
      ? `Next: ${nextLensName}`
      : 'Back to step 1'
    : `Next step (${step + 1}/${stepsInLens})`;

  if (isExplore && chapter && exploreSpec) {
    return (
      <ExploreView
        key={`${objectId}.${lens}`}
        name={name}
        captions={chapter.captions}
        spec={exploreSpec}
        modelSpec={chapter.spec}
        media={media}
        step={step}
        replay={replay}
        isSketch={isSketch}
        autoPlay={!demo}
        paused={paused}
        turning={turning}
        onBeat={next => goPosition(lens, next)}
        onReplay={() => setReplay(value => value + 1)}
        onWatchAgain={() => {
          goPosition(lens, 0);
          setReplay(value => value + 1);
        }}
        onTurn={onTurn}
        onExitTurn={onExitTurn}
        onHome={() => emitNav('done')}
        onNewPhoto={onNewPhoto}
        standIn={standIn}
        demo={demo}
        lang={lang}
        onAuto={autoAdvance}
        onRendered={exploreRendered}
        onMotion={onMotion}
        followUp={showFollowUp && question && answer ? {question, answer} : null}
        filmMs={filmMs}
      />
    );
  }

  // 2D lenses (objects without an Explore film): the same top line and pill row as the 3D screen.
  return (
    <div className="ex" lang={lang}>
      <div className="xp-top ex-top">
        <h1 className="xp-name ex-title">
          {known ? (
            <>
              {name}
              {chapter && !isSketch ? <>{' · '}<span className="xp-mode">{chapter.title}</span></> : null}
            </>
          ) : 'Not in the library yet'}
        </h1>
        {isSketch ? (
          <span
            className="ex-tag ex-tag--hot xp-tag"
            title="Generated explanation, not checked"
            aria-label="Generated explanation, not checked"
          >
            {'Sketch · unverified'}
          </span>
        ) : null}
        {standIn ? <span className="ex-tag ex-tag--soft xp-tag">Stand-in model</span> : null}
        {demo ? <span className="ex-tag ex-tag--soft xp-tag">Demo</span> : null}
        {known && stepsInLens > 1 ? (
          <div className="xp-beats" aria-label={`Step ${step + 1} of ${stepsInLens}${multi ? `, lens ${lens + 1} of ${info.chapters.length}` : ''}`}>
            <div className="xp-dots" aria-hidden="true">
              {Array.from({length: stepsInLens}, (_, index) => (
                <span key={index} className={`xp-dot${index === step ? ' xp-dot--current' : index < step ? ' xp-dot--past' : ''}`} />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {known ? (
        <div className="ex-stage" ref={stageRef} aria-hidden="true">
          {sceneInstance ? <canvas ref={canvasRef} className="ex-canvas" /> : null}
        </div>
      ) : (
        <div className="ex-unknown">
          {label ? <p className="ex-lead">{`Looks like: ${label}`}</p> : null}
          <TextView as="p" textStyle={TextStyle.BODY2}>
            {answer || 'Try pointing at a ball, a guitar, a bike, a kettle or something that swings.'}
          </TextView>
          {sketchState ? (
            <div role="status" className="ex-sketch-line">
              {sketchState === 'pending' ? 'Drawing a sketch…' : 'No sketch for this one.'}
            </div>
          ) : null}
        </div>
      )}

      {known ? (
        <div className="ex-bottom">
          {/* Always present (aria-live off); hidden by CSS when a scene has no live values. */}
          <div className="ex-read" aria-live="off" aria-label="Live values">
            {readouts.map(r => (
              <span className="ex-chip" key={r.label}>
                <TextView textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
                  {r.label}
                </TextView>{' '}
                <TextView textStyle={TextStyle.META2_EMPHASIZED}>{r.value}</TextView>
              </span>
            ))}
          </div>
          {showFollowUp ? (
            <div className="ex-follow-up" aria-label={`Q: ${question} ${answer}`}>
              <span className="ex-follow-up-question">Q: {question}</span>{' '}
              <span className="ex-follow-up-answer">{answer}</span>
            </div>
          ) : null}
          <p className="ex-caption" aria-label={`Step ${step + 1}/${stepsInLens}. ${chapter?.captions[step] ?? ''}`}>
            {chapter?.captions[step] ?? ''}
          </p>
          {hint ? <p className="ex-hint">{hint}</p> : null}
        </div>
      ) : null}

      <div className="xp-actions ex-actions" aria-label="Controls">
        {known ? (
          <button type="button" ref={btnRef} onClick={() => emitNav('next')}>{buttonTitle}</button>
        ) : null}
        <button type="button" ref={homeRef} className="xp-home" onClick={() => emitNav('done')}>Home</button>
      </div>
    </div>
  );
}
