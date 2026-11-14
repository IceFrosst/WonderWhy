import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {anchorAt, loadTracks} from './explore';
import type {ExploreMedia, ExploreSpec, Tracks} from './explore';
import {C} from './scenes/palette';
import {focusPicture, pictureClickIsPinch, rowButtons, useStageControls} from './stageControls';
import TurnLayer from './TurnLayer';
import type {Explore, BeatPlan, LiveLabel, View} from '@r3d/scene.js';
import type {TurnHandle} from './TurnLayer';

// One live Explore instance and canvas for the explanation and Turn it. The two video
// elements and clean still are retained as fallbacks. Controls live in stageControls.ts.

interface Props {
  name: string;
  captions: string[];
  spec: ExploreSpec;
  /** The chapter's raw model3d spec, shared by playback and Turn it. */
  modelSpec: unknown;
  media: ExploreMedia;
  /** 0-based beat. */
  step: number;
  /** Increments when the wearer asks to replay the current beat. */
  replay: number;
  isSketch: boolean;
  autoPlay: boolean;
  /** Glasses off: everything stops. */
  paused: boolean;
  /** Turn it is open (App owns it: Back leaves Turn it before it leaves the film). */
  turning: boolean;
  onBeat: (step: number) => void;
  onReplay: () => void;
  onWatchAgain: () => void;
  onTurn?: () => void;
  onExitTurn: () => void;
  onHome: () => void;
  /** Take a new photo; undefined when no bridge is connected. */
  onNewPhoto?: () => void;
  standIn?: boolean;
  demo?: boolean;
  lang?: string;
  onAuto: () => void;
  onRendered: () => void;
  onMotion: () => void;
  /** A follow-up question answered on this beat (shown above the caption). */
  followUp?: {question: string; answer: string} | null;
  /** Test hook: ms from opening the object to the first moving frame. */
  filmMs?: number;
}

interface RowButton {
  id: string;
  label: string;
  onClick: () => void;
  /** Focused when this state opens. */
  primary?: boolean;
  home?: boolean;
}

function canExplode(spec: unknown): boolean {
  const parts = typeof spec === 'object' && spec !== null ? (spec as {parts?: unknown}).parts : null;
  return Array.isArray(parts) && parts.some(part => {
    const explode = typeof part === 'object' && part !== null ? (part as {explode?: unknown}).explode : null;
    return Array.isArray(explode) && explode.some(value => typeof value === 'number' && Math.abs(value) > 1e-6);
  });
}

interface DebugLabel {
  part: string;
  text: string;
  alpha: number;
  side: 'l' | 'r';
  focus: boolean;
  x: number;
  y: number;
  w: number;
  ax: number;
  ay: number;
}

interface ExploreDebug {
  beat: number;
  mode: Mode;
  started: boolean;
  videoTime: number;
  frameMs: number;
  meanFrameMs: number;
  renderedFrames: number;
  activeSrc: string;
  nextSrc: string;
  nextReady: number;
  autoPausedMs: number;
  loops: number;
  stillSrc: string;
  labels: DebugLabel[];
  dims: Array<{text: string; x: number; y: number; alpha: number}>;
}

declare global {
  interface Window {
    __exploreDebug?: ExploreDebug;
  }
}

type Mode = 'loading' | 'live' | 'video' | 'still' | 'none';

const FALLBACK_MS = 4500;
const INPUT_PAUSE_MS = 20000;
const FADE_MS = 300;
const FRAME_GAP_MS = 1000 / 30;
const LABEL_FONT = 17;
const LABEL_GAP = 26;
const MARGIN = 16;
const LABEL_MAX_W = 134;
const TURN_IDLE_MS = 15000;
const FOCUS_DELAY_MS = 50;

/** Owns live beat timing, plus the two fallback videos and still; knows nothing about React. */
class BeatPlayer {
  mode: Mode = 'loading';
  beat = -1;
  started = false;
  startedAt = 0;
  loops = 0;
  private renderer: Explore | null = null;
  private livePending = true;
  private liveCanvas: HTMLCanvasElement | null = null;
  private status: ((status: 'live' | 'failed') => void) | null = null;
  private elapsed = 0;
  private time = 0;
  private lastTick = 0;
  labels: LiveLabel[] = [];
  frameMs = 0;
  totalFrameMs = 0;
  renderedFrames = 0;
  private token = 0;
  private current: HTMLVideoElement | null = null;
  private fallbackTimer: number | undefined;
  private frames: number[] = [];
  private paused = false;
  private pausedAt = 0;
  private loopFrom = 0;
  private disposed = false;
  private lastVideoTime = 0;
  private lastMotionAt = 0;

  constructor(
    private videos: [HTMLVideoElement, HTMLVideoElement],
    private still: HTMLImageElement,
    private media: ExploreMedia,
    private onShown: () => void,
  ) {
    for (const video of videos) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.addEventListener('ended', this.onEnded);
      video.addEventListener('error', this.onError);
    }
  }

  initLive(canvas: HTMLCanvasElement, spec: unknown, status: (status: 'live' | 'failed') => void): void {
    this.liveCanvas = canvas;
    this.status = status;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    const pending = new URLSearchParams(location.search).get('live3d') === '0'
      ? Promise.reject(new Error('live3d=0')) : import('@r3d/scene.js');
    pending.then(module => {
      if (this.disposed) return;
      this.renderer = new module.Explore(canvas, {live: true});
      this.renderer.load(spec);
      this.livePending = false;
      if (this.beat >= 0) this.show(this.beat, true);
      if (this.renderer) status('live');
    }).catch(() => this.failLive());
  }

  updateMedia(media: ExploreMedia): void {
    this.media = media;
    if (!this.renderer && !this.livePending && this.beat >= 0) this.show(this.beat, false);
  }

  plan(): BeatPlan | null {
    return this.renderer && this.beat >= 0 ? this.renderer.plan(this.beat) : null;
  }

  drawView(view: View): void {
    if (!this.renderer || this.beat < 0) return;
    this.renderer.setView(view);
    this.drawLive();
  }

  resetView(): void {
    if (!this.renderer) return;
    this.renderer.setView({yaw: 0, pitch: 0, explode: null});
    this.drawLive();
  }

  private drawLive(): void {
    const renderer = this.renderer;
    if (!renderer || this.beat < 0) return;
    try {
      const start = performance.now();
      renderer.renderAt(this.beat, this.time);
      this.labels = renderer.labelsAt(this.beat, this.time);
      this.frameMs = performance.now() - start;
      this.totalFrameMs += this.frameMs;
      this.renderedFrames++;
    } catch {
      this.failLive();
    }
  }

  private releaseRenderer(): void {
    if (!this.renderer) return;
    this.renderer.clear();
    this.renderer.envMap?.dispose();
    this.renderer.renderer.dispose();
    this.renderer = null;
  }

  private failLive(): void {
    if (this.disposed) return;
    this.livePending = false;
    this.liveCanvas?.classList.remove('is-on');
    this.releaseRenderer();
    this.status?.('failed');
    if (this.beat >= 0) this.show(this.beat, true);
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.failLive();
  };

  get active(): HTMLVideoElement | null {
    return this.mode === 'video' ? this.current : null;
  }

  get other(): HTMLVideoElement {
    return this.current === this.videos[0] ? this.videos[1] : this.videos[0];
  }

  videoTime(): number {
    return this.mode === 'live' ? this.time : this.current && this.mode === 'video' ? this.current.currentTime : 0;
  }

  setLoopFrom(seconds: number): void {
    this.loopFrom = seconds;
  }

  show(beat: number, restart: boolean): void {
    if (this.disposed) return;
    const token = ++this.token;
    window.clearTimeout(this.fallbackTimer);
    const url = this.livePending ? null : this.media.videos[beat] ?? null;
    this.beat = beat;
    this.started = false;
    this.startedAt = 0;
    if (this.paused) this.pausedAt = performance.now();
    this.loops = 0;
    this.lastVideoTime = 0;
    this.lastMotionAt = 0;
    this.labels = [];
    if (this.renderer) {
      this.elapsed = this.time = 0;
      this.lastTick = 0;
      this.started = true;
      this.startedAt = performance.now();
      this.mode = 'live';
      for (const video of this.videos) {
        video.pause();
        video.classList.remove('is-on');
      }
      this.still.classList.remove('is-on');
      this.drawLive();
      if (this.mode === 'live') {
        this.liveCanvas?.classList.add('is-on');
        this.onShown();
      }
      return;
    }
    if (!url) {
      this.showStill(beat, token);
      return;
    }
    const visible = this.mode === 'video' ? this.current : null;
    let target: HTMLVideoElement;
    if (visible && visible.dataset.url === url) target = visible;
    else if (this.other.dataset.url === url) target = this.other;
    else target = visible === this.videos[0] ? this.videos[1] : visible === this.videos[1] ? this.videos[0] : this.other;
    if (target.dataset.url !== url) {
      target.dataset.url = url;
      target.src = url;
      target.load();
    } else if (target.currentTime !== 0 || restart) {
      try {
        target.currentTime = 0;
      } catch {
        /* not seekable yet: it starts at 0 anyway */
      }
    }
    this.current = target;
    this.mode = target === visible ? 'video' : 'loading';
    this.play(target);
    if (this.mode === 'video') this.afterShown(token, target);
    else if (target.readyState >= 2) this.reveal(token, target);
    else {
      const onData = (): void => this.reveal(token, target);
      target.addEventListener('loadeddata', onData, {once: true});
    }
    if (!this.paused) this.armFallback(token, beat);
  }

  /** Called at about 30 fps: starts the beat clock, loops the tail, keeps the fallback honest. */
  tick(now: number): void {
    if (this.disposed || this.paused) return;
    if (this.mode === 'live') {
      this.elapsed += this.lastTick ? (now - this.lastTick) / 1000 : 0;
      this.lastTick = now;
      const plan = this.plan();
      if (!plan) return;
      const tail = Math.max(1 / 30, plan.dur - plan.loopFrom);
      this.loops = this.elapsed >= plan.dur ? 1 + Math.floor((this.elapsed - plan.dur) / tail) : 0;
      this.time = this.loops ? plan.loopFrom + (this.elapsed - plan.dur) % tail : this.elapsed;
      this.drawLive();
      return;
    }
    const video = this.current;
    if (!video) return;
    if (this.mode === 'loading' && video.readyState >= 2) this.reveal(this.token, video);
    if (this.mode !== 'video') return;
    if (!this.started && !video.paused && !video.seeking && video.currentTime > 0.03) {
      this.started = true;
      this.startedAt = now - video.currentTime * 1000;
      window.clearTimeout(this.fallbackTimer);
    }
    if (this.started) {
      if (video.currentTime !== this.lastVideoTime || !this.lastMotionAt) {
        this.lastVideoTime = video.currentTime;
        this.lastMotionAt = now;
      } else if (now - this.lastMotionAt >= FALLBACK_MS) {
        this.showStill(this.beat, this.token);
        return;
      }
      // Let the current clip buffer before starting a second download.
      if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) this.preloadNext();
    }
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0.3 && !video.seeking && video.currentTime >= duration - 0.07) this.loop(video);
  }

  pause(): void {
    if (!this.paused) this.pausedAt = performance.now();
    this.paused = true;
    this.lastTick = 0;
    window.clearTimeout(this.fallbackTimer);
    for (const video of this.videos) video.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.started && this.pausedAt) this.startedAt += performance.now() - Math.max(this.pausedAt, this.startedAt);
    this.pausedAt = 0;
    this.lastMotionAt = 0;
    if (this.current && (this.mode === 'video' || this.mode === 'loading')) this.play(this.current);
    if (!this.started && this.mode !== 'still' && this.mode !== 'none') this.armFallback(this.token, this.beat);
  }

  dispose(): void {
    this.disposed = true;
    this.liveCanvas?.removeEventListener('webglcontextlost', this.onContextLost);
    this.releaseRenderer();
    window.clearTimeout(this.fallbackTimer);
    for (const id of this.frames) cancelAnimationFrame(id);
    for (const video of this.videos) {
      video.removeEventListener('ended', this.onEnded);
      video.removeEventListener('error', this.onError);
      video.pause();
      video.removeAttribute('src');
      video.dataset.url = '';
      video.classList.remove('is-on');
      video.load();
    }
    this.still.onload = null;
    this.still.onerror = null;
  }

  nextInfo(): {src: string; ready: number} {
    const other = this.other;
    return {src: other.dataset.url ?? '', ready: other.readyState};
  }

  private play(video: HTMLVideoElement): void {
    if (this.paused) return;
    const pending = video.play();
    if (pending) pending.catch(() => { /* the fallback timer shows the still */ });
  }

  private armFallback(token: number, beat: number): void {
    window.clearTimeout(this.fallbackTimer);
    this.fallbackTimer = window.setTimeout(() => {
      if (token !== this.token || this.started || this.disposed) return;
      // The video did not start in time: stop its download and show the still.
      const stalled = this.current;
      if (stalled && this.mode !== 'video') {
        stalled.pause();
        stalled.removeAttribute('src');
        stalled.dataset.url = '';
        stalled.load();
      }
      this.showStill(beat, token);
    }, FALLBACK_MS);
  }

  private reveal(token: number, video: HTMLVideoElement): void {
    if (token !== this.token || this.disposed || this.mode !== 'loading' || this.current !== video) return;
    this.mode = 'video';
    video.classList.add('is-on');
    this.afterShown(token, video);
  }

  /** Keep the previous picture under the new one for two frames, then hide it and preload the next beat. */
  private afterShown(token: number, video: HTMLVideoElement): void {
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        if (token !== this.token || this.disposed) return;
        for (const item of this.videos) {
          if (item === video) continue;
          item.classList.remove('is-on');
          item.pause();
        }
        this.still.classList.remove('is-on');
        this.onShown();
      });
      this.frames.push(second);
    });
    this.frames.push(first);
    if (this.frames.length > 16) this.frames.splice(0, this.frames.length - 16);
  }

  private preloadNext(): void {
    if (this.livePending || this.renderer) return;
    const next = this.media.videos[this.beat + 1];
    const other = this.other;
    if (!next || other.dataset.url === next || other.classList.contains('is-on')) return;
    other.dataset.url = next;
    other.preload = 'auto';
    other.src = next;
    other.load();
  }

  private showStill(beat: number, token: number): void {
    const url = this.media.stills[beat] ?? null;
    const done = (ok: boolean): void => {
      if (token !== this.token || this.disposed) return;
      this.mode = ok ? 'still' : 'none';
      this.started = true;
      this.startedAt = performance.now();
      this.still.classList.toggle('is-on', ok);
      for (const video of this.videos) {
        video.classList.remove('is-on');
        video.pause();
      }
      this.current = null;
      this.onShown();
      this.preloadNext();
    };
    if (!url) {
      done(false);
      return;
    }
    if (this.still.dataset.url === url && this.still.complete && this.still.naturalWidth > 0) {
      done(true);
      return;
    }
    this.still.onload = () => done(true);
    this.still.onerror = () => done(false);
    this.still.dataset.url = url;
    this.still.src = url;
  }

  private loop(video: HTMLVideoElement): void {
    const duration = video.duration;
    const from = Math.min(Math.max(0, this.loopFrom), Math.max(0, duration - 0.25));
    this.loops++;
    // Seeking keeps the last decoded frame on screen until the new one is ready: no flash.
    try {
      video.currentTime = from;
    } catch {
      /* ignore */
    }
    if (video.paused) this.play(video);
  }

  private onEnded = (event: Event): void => {
    const current = this.current;
    if (current && event.target === current && this.mode === 'video') this.loop(current);
  };

  private onError = (event: Event): void => {
    const video = event.target as HTMLVideoElement;
    if (video !== this.current || this.started || !video.dataset.url) return;
    window.clearTimeout(this.fallbackTimer);
    video.dataset.url = '';
    this.showStill(this.beat, this.token);
  };
}

/**
 * A black edge around the glyphs. On the additive display black emits no light, so it cuts the
 * model's bright lines away from the letters instead of drawing anything.
 */
function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.restore();
}

const LABEL_LINE_H = 20;

/** Wrap a label onto at most two lines inside the margin column; only a third line's worth is cut. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): {text: string; width: number; lines: string[]} {
  if (ctx.measureText(text).width <= max) return {text, width: ctx.measureText(text).width, lines: [text]};
  const words = text.split(/\s+/);
  let first = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = first ? `${first} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > max && first) break;
    first = next;
  }
  const rest = words.slice(i).join(' ');
  if (rest) {
    const second = cutText(ctx, rest, max);
    return {text, width: Math.max(ctx.measureText(first).width, second.width), lines: [first, second.text]};
  }
  const cut = cutText(ctx, text, max);
  return {text, width: cut.width, lines: [cut.text]};
}

function cutText(ctx: CanvasRenderingContext2D, text: string, max: number): {text: string; width: number} {
  let width = ctx.measureText(text).width;
  if (width <= max) return {text, width};
  let cut = text;
  while (cut.length > 1 && width > max) {
    cut = cut.slice(0, -1).trimEnd();
    width = ctx.measureText(`${cut}\u2026`).width;
  }
  return {text: `${cut}\u2026`, width};
}


export default function ExploreView({
  name,
  captions,
  spec,
  modelSpec,
  media,
  step,
  replay,
  isSketch,
  autoPlay,
  paused,
  turning,
  onBeat,
  onReplay,
  onWatchAgain,
  onTurn,
  onExitTurn,
  onHome,
  onNewPhoto,
  standIn,
  demo,
  lang,
  onAuto,
  onRendered,
  onMotion,
  followUp = null,
  filmMs,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const stillRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const followRef = useRef<HTMLParagraphElement>(null);
  const turnRef = useRef<TurnHandle>(null);
  const playerRef = useRef<BeatPlayer | null>(null);
  const controlRef = useRef<{start: () => void; stop: () => void; paint: () => void} | null>(null);
  const tracksRef = useRef<Tracks | null>(null);
  const lastInputRef = useRef(-Infinity);
  const turnIdleTimer = useRef<number | undefined>(undefined);
  const [filmPaused, setFilmPaused] = useState(false);
  const [open, setOpen] = useState(false);
  const [turnFailed, setTurnFailed] = useState(false);
  const [liveStatus, setLiveStatus] = useState<'loading' | 'live' | 'failed'>('loading');
  const stopped = paused || turning || filmPaused;
  const pausedRef = useRef(stopped);
  pausedRef.current = stopped;
  const live = useRef({step, replay, autoPlay, onAuto, onRendered, onMotion, spec});
  live.current = {step, replay, autoPlay, onAuto, onRendered, onMotion, spec};
  const motionReported = useRef(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState(false);
  const beat = spec.beats[step];
  const caption = captions[step] ?? '';
  const number = beat?.number ?? null;
  const lastBeat = captions.length - 1;
  const atEnd = step >= lastBeat;
  const speech = window.speechSynthesis;
  const line = followUp?.answer || caption;
  const specCanOpen = useMemo(() => canExplode(modelSpec), [modelSpec]);
  const canOpen = specCanOpen && !turnFailed;
  const turnSurface = useMemo(() => ({
    draw: (view: View) => {
      playerRef.current?.drawView(view);
      controlRef.current?.paint();
    },
    reset: () => {
      playerRef.current?.resetView();
      controlRef.current?.paint();
    },
  }), []);

  useEffect(() => {
    setSpeaking(false);
    setVoiceError(false);
    const cancelOnHide = () => {
      if (!document.hidden) return;
      speech?.cancel();
      setSpeaking(false);
    };
    document.addEventListener('visibilitychange', cancelOnHide);
    return () => {
      document.removeEventListener('visibilitychange', cancelOnHide);
      speech?.cancel();
    };
  }, [speech, step, line, turning, paused]);

  const listen = () => {
    if (!speech || !line) return;
    speech.cancel();
    setVoiceError(false);
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const speechLine = new SpeechSynthesisUtterance(line);
    speechLine.lang = lang || 'en-GB';
    speechLine.rate = 0.92;
    speechLine.onend = () => setSpeaking(false);
    speechLine.onerror = event => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      setSpeaking(false);
      setVoiceError(true);
    };
    lastInputRef.current = performance.now();
    setSpeaking(true);
    speech.speak(speechLine);
  };

  const watchAgain = () => {
    setFilmPaused(false);
    onWatchAgain();
    // Watching again is a request to play: no 20 s input hold on beat 1.
    window.setTimeout(() => {
      lastInputRef.current = -Infinity;
      focusPicture(rootRef.current);
    }, 0);
  };
  const live2 = useRef({turning, step, lastBeat, canOpen, onBeat, onReplay, onExitTurn});
  live2.current = {turning, step, lastBeat, canOpen, onBeat, onReplay, onExitTurn};
  const noteInput = (): void => {
    lastInputRef.current = performance.now();
    if (!live2.current.turning) return;
    window.clearTimeout(turnIdleTimer.current);
    turnIdleTimer.current = window.setTimeout(() => live2.current.onExitTurn(), TURN_IDLE_MS);
  };
  const pinch = (): void => {
    const s = live2.current;
    if (s.turning) {
      if (s.canOpen) setOpen(value => !value);
    } else if (s.step < s.lastBeat) s.onBeat(s.step + 1);
  };

  useEffect(() => {
    if (!turning) return;
    noteInput();
    return () => {
      window.clearTimeout(turnIdleTimer.current);
      // The returned beat stays readable before auto-play resumes.
      lastInputRef.current = performance.now();
    };
  }, [turning]);

  // One control map for the film, its end and Turn it (stageControls.ts). Any input holds auto-play 20 s.
  useStageControls(rootRef, {
    mode: turning ? 'turn' : atEnd ? 'end' : 'film',
    input: noteInput,
    pinch,
    swipe: direction => {
      const s = live2.current;
      if (s.turning) turnRef.current?.turn(direction);
      else {
        const next = Math.min(s.lastBeat, Math.max(0, s.step + direction));
        if (next !== s.step) s.onBeat(next);
      }
    },
    up: () => {
      if (live2.current.turning) turnRef.current?.tilt(-1);
      else live2.current.onReplay();
    },
    down: () => turnRef.current?.tilt(1),
  });

  // A follow-up answer holds its beat like input does, so the answer stays readable.
  const hasFollowUp = followUp !== null;
  useEffect(() => {
    if (hasFollowUp) lastInputRef.current = performance.now();
  }, [hasFollowUp]);

  // Turn it and the film focus the picture; the end focuses New photo (or Watch again).
  useEffect(() => {
    if (!turning) setOpen(false);
    const t = window.setTimeout(() => {
      const root = rootRef.current;
      const primary = root?.querySelector<HTMLButtonElement>('.xp-actions [data-primary]');
      if (primary) primary.focus({preventScroll: true});
      else focusPicture(root);
    }, FOCUS_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [step, turning, atEnd]);

  // Caption: 20 px, at most 2 lines; a long (translated) sentence steps down to 18 then 16 px.
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    for (const candidate of [20, 18, 16]) {
      el.style.fontSize = `${candidate}px`;
      el.style.lineHeight = `${Math.round(candidate * 1.3)}px`;
      if (el.scrollHeight <= Math.round(candidate * 1.3) * 2 + 1) break;
    }
  }, [caption, turning]);

  // One player per film visit.
  useEffect(() => {
    const a = videoA.current;
    const b = videoB.current;
    const still = stillRef.current;
    if (!a || !b || !still) return;
    let rendered = false;
    const shown = (): void => {
      controlRef.current?.paint();
      if (rendered) return;
      rendered = true;
      live.current.onRendered();
    };
    const player = new BeatPlayer([a, b], still, media, shown);
    playerRef.current = player;
    setLiveStatus('loading');
    setTurnFailed(false);
    if (liveCanvasRef.current) player.initLive(liveCanvasRef.current, modelSpec, status => {
      setLiveStatus(status);
      setTurnFailed(status === 'failed');
      controlRef.current?.paint();
    });
    if (pausedRef.current) player.pause();
    // Text and labels are on screen even if no picture ever arrives.
    const safety = window.setTimeout(shown, FALLBACK_MS + 200);
    return () => {
      window.clearTimeout(safety);
      player.dispose();
      if (playerRef.current === player) playerRef.current = null;
      if (navigator.webdriver) delete window.__exploreDebug;
    };
  }, [modelSpec]);

  useEffect(() => {
    playerRef.current?.updateMedia(media);
    let cancelled = false;
    tracksRef.current = null;
    loadTracks(media.tracks).then(tracks => {
      if (cancelled) return;
      tracksRef.current = tracks;
      const player = playerRef.current;
      if (player) player.setLoopFrom(tracks?.beats[player.beat]?.loopFrom ?? 0);
      controlRef.current?.paint();
    });
    return () => { cancelled = true; };
  }, [media]);

  // Beat change or replay.
  const lastShown = useRef({step: -1, replay: -1});
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const restart = lastShown.current.step === step && lastShown.current.replay !== replay;
    lastShown.current = {step, replay};
    player.setLoopFrom(tracksRef.current?.beats[step]?.loopFrom ?? 0);
    player.show(step, restart);
    controlRef.current?.paint();
  }, [step, replay, modelSpec]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (stopped) player.pause();
    else player.resume();
  }, [stopped]);

  // Overlay, beat clock and auto-play at 30 fps.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const root = rootRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !stage || !root || !ctx) return;
    const fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
    let raf = 0;
    let last = performance.now();
    let fpsFrames = 0;
    let fpsT = last;
    let dims: Array<{text: string; x: number; y: number; alpha: number}> = [];
    let scrimTop = stage.clientHeight - 80;

    // Black bands behind the top line and the caption: on the additive display they remove the
    // model's light under the words, so text never sits on lines.
    const scrims = (): void => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const top = ctx.createLinearGradient(0, 0, 0, 56);
      top.addColorStop(0, 'rgba(0,0,0,0.9)');
      top.addColorStop(0.7, 'rgba(0,0,0,0.9)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, 56);
      const from = Math.max(56, scrimTop - 28);
      const bottom = ctx.createLinearGradient(0, from, 0, scrimTop);
      bottom.addColorStop(0, 'rgba(0,0,0,0)');
      bottom.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = bottom;
      ctx.fillRect(0, from, w, scrimTop - from);
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(0, scrimTop, w, h - scrimTop);
    };
    let fadeStart = 0;
    let fadeKey = '';
    let autoFiredFor = -1;
    let running = false;

    const fit = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(stage.clientWidth * dpr);
      const h = Math.round(stage.clientHeight * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();

    const frameMap = (size: number): {scale: number; ox: number; oy: number} => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const scale = Math.min(w / size, h / size);
      return {scale, ox: (w - size * scale) / 2, oy: (h - size * scale) / 2};
    };

    const draw = (player: BeatPlayer, now: number): DebugLabel[] => {
      const dpr = canvas.width / Math.max(1, stage.clientWidth);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const stageRect = stage.getBoundingClientRect();
      scrimTop = bottomRef.current ? bottomRef.current.getBoundingClientRect().top - stageRect.top : stage.clientHeight - 80;
      scrims();
      const currentStep = live.current.step;
      const beat = live.current.spec.beats[currentStep];
      if (!beat) return [];
      const tracks = tracksRef.current;
      const trackBeat = tracks?.beats[currentStep];
      const t = player.mode === 'still' ? trackBeat?.loopFrom ?? beat.move : player.videoTime();
      const {scale, ox, oy} = frameMap(tracks?.size ?? 600);
      const liveMap = frameMap(600);
      let anchors: Array<LiveLabel & {part: string; focus: boolean}>;
      if (player.mode === 'live') {
        anchors = player.labels.map(label => ({...label, x: liveMap.ox + label.x * liveMap.scale,
          y: liveMap.oy + label.y * liveMap.scale, part: '', focus: true}));
      } else if (tracks && trackBeat) {
        anchors = trackBeat.labels.map(label => {
          const [x, y] = anchorAt(label.samples, t);
          return {kind: label.kind, text: label.kind === 'callout' ? label.text : live.current.spec.parts.get(label.part) ?? label.text,
            side: label.side ?? (x < 300 ? 'l' : 'r'), x: ox + x * scale, y: oy + y * scale,
            part: label.part, focus: label.focus || beat.focus.includes(label.part)};
        });
      } else {
        // Captions and callouts remain readable even when neither WebGL nor media is available.
        anchors = [...beat.labels.map((part, i) => ({kind: 'label' as const,
          text: live.current.spec.parts.get(part) ?? '', side: i % 2 ? 'r' as const : 'l' as const,
          x: stage.clientWidth / 2, y: 190 + i * LABEL_GAP, part, focus: beat.focus.includes(part)})),
        ...beat.callouts.map((callout, i) => ({kind: 'callout' as const, text: callout.text,
          side: callout.side ?? 'r' as const, x: stage.clientWidth / 2, y: 210 + i * LABEL_GAP,
          part: '', focus: true}))];
      }
      if (player.mode !== 'live') {
        const missing = beat.callouts.filter(callout => !anchors.some(item => item.kind === 'callout' && item.text === callout.text));
        anchors = [...missing.map((callout, i) => ({kind: 'callout' as const, text: callout.text,
          side: callout.side ?? 'r' as const, x: stage.clientWidth / 2, y: 210 + i * LABEL_GAP,
          part: '', focus: true})), ...anchors];
      }
      if (fadeKey !== `${currentStep}:${live.current.replay}`) {
        fadeKey = `${currentStep}:${live.current.replay}`;
        fadeStart = 0;
      }
      const move = player.plan()?.loopFrom ?? trackBeat?.move ?? beat.move;
      if (!fadeStart && (player.mode !== 'live' && player.mode !== 'video' || t >= move)) fadeStart = now;
      const alpha = fadeStart ? Math.min(1, (now - fadeStart) / FADE_MS) : 0;
      const captionTop = (captionRef.current?.getBoundingClientRect().top ?? bottomRef.current?.getBoundingClientRect().top ?? stageRect.bottom - 80) - stageRect.top;
      const rightMax = (followRef.current ? followRef.current.getBoundingClientRect().top - stageRect.top : captionTop) - 20;
      const leftMax = Math.min(scrimTop, rightMax + 20) - 20;
      ctx.font = `600 ${LABEL_FONT}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      const items = anchors.filter(item => item.text && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(0, 4)
        .map(item => ({...item,
          // Edge anchors use the opposite margin, leaving room around the part itself.
          side: item.x <= MARGIN + LABEL_MAX_W + 24 ? 'r' as const
            : item.x >= stage.clientWidth - MARGIN - LABEL_MAX_W - 24 ? 'l' as const : item.side,
          ay: item.y, ...fitText(ctx, item.text, LABEL_MAX_W)}));
      for (const side of ['l', 'r'] as const) {
        const column = items.filter(item => item.side === side).sort((a, b) => a.y - b.y);
        const max = Math.max(64, side === 'l' ? leftMax : rightMax);
        const gap = (a: typeof column[number], b: typeof column[number]) => LABEL_GAP + ((a.lines.length - 1) + (b.lines.length - 1)) * LABEL_LINE_H / 2;
        for (let i = 0; i < column.length; i++) column[i].y = Math.max(i ? column[i - 1].y + gap(column[i - 1], column[i]) : 64, Math.min(column[i].y, max));
        for (let i = column.length - 1; i >= 0; i--) column[i].y = Math.max(64, Math.min(column[i].y, i === column.length - 1 ? max : column[i + 1].y - gap(column[i], column[i + 1])));
      }
      const out: DebugLabel[] = [];
      const right = stage.clientWidth - MARGIN;
      for (const label of items) {
        const ax = label.x;
        const ay = label.ay;
        const textX = label.side === 'l' ? MARGIN : right;
        const lineX = label.side === 'l' ? MARGIN + label.width + 8 : right - label.width - 8;
        const elbow = lineX + (label.side === 'l' ? 10 : -10);
        const colour = label.kind === 'callout' || label.focus ? C.white : C.soft;
        out.push({part: label.part, text: label.text, alpha, side: label.side, focus: label.focus,
          x: textX, y: label.y, w: label.width, ax, ay});
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = C.soft;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(lineX, label.y);
        ctx.lineTo(elbow, label.y);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        if (label.kind === 'callout') {
          const angle = Math.atan2(ay - label.y, ax - elbow);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - 6 * Math.cos(angle - 0.45), ay - 6 * Math.sin(angle - 0.45));
          ctx.lineTo(ax - 6 * Math.cos(angle + 0.45), ay - 6 * Math.sin(angle + 0.45));
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.textAlign = label.side === 'l' ? 'left' : 'right';
        label.lines.forEach((line, index) => {
          const ly = label.y + (index - (label.lines.length - 1) / 2) * LABEL_LINE_H;
          haloText(ctx, line, textX, ly);
          ctx.fillText(line, textX, ly);
        });
      }
      dims = [];
      ctx.font = `600 16px ${fontFamily}`;
      ctx.textAlign = 'center';
      trackBeat?.dims.forEach((dim, index) => {
        const text = beat.dims[index] || dim.text;
        if (!text) return;
        const [fx, fy] = anchorAt(dim.samples, t);
        const half = ctx.measureText(text).width / 2;
        const x = Math.min(Math.max(ox + fx * scale, MARGIN + half), right - half);
        const y = Math.max(64, oy + fy * scale - 14);
        dims.push({text, x, y, alpha});
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.white;
        haloText(ctx, text, x, y);
        ctx.fillText(text, x, y);
      });
      ctx.globalAlpha = 1;
      return out;
    };

    const tick = (now: number): void => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      const el = now - last;
      if (el < FRAME_GAP_MS) return;
      last = now - (el % FRAME_GAP_MS);
      fpsFrames++;
      if (now - fpsT >= 1000) {
        window.__glassesFps = (fpsFrames * 1000) / (now - fpsT);
        fpsFrames = 0;
        fpsT = now;
      }
      const player = playerRef.current;
      if (!player) return;
      player.tick(now);
      if (!motionReported.current && (player.mode === 'video' || player.mode === 'live') && player.started) {
        motionReported.current = true;
        live.current.onMotion();
      }
      const currentStep = live.current.step;
      const labels = draw(player, now);

      // Auto-play uses move + beat duration from the first frame; input holds it 20 s.
      const tracks = tracksRef.current;
      // The spec's beat dur (default 6 s); tracks.json's dur is the clip length, move included.
      const dur = (player.plan()?.dur ?? tracks?.beats[currentStep]?.dur ?? live.current.spec.beats[currentStep]?.dur ?? 6) * 1000;
      const inputHold = lastInputRef.current + INPUT_PAUSE_MS - now;
      const canAuto = live.current.autoPlay && currentStep < lastBeat && player.beat === currentStep;
      const progress = progressRef.current;
      if (progress) {
        const show = canAuto && player.started && inputHold <= 0;
        progress.style.opacity = show ? '1' : '0';
        if (show) progress.style.transform = `scaleX(${Math.min(1, (now - player.startedAt) / dur).toFixed(3)})`;
      }
      const beatPlayed = (player.mode !== 'video' && player.mode !== 'live') || player.loops > 0 || player.videoTime() * 1000 >= dur - 100;
      if (canAuto && player.started && beatPlayed && autoFiredFor !== currentStep) {
        const due = Math.max(player.startedAt + dur, lastInputRef.current + INPUT_PAUSE_MS);
        if (now >= due) {
          autoFiredFor = currentStep;
          live.current.onAuto();
        }
      }
      if (autoFiredFor !== -1 && autoFiredFor !== currentStep) autoFiredFor = -1;

      if (navigator.webdriver) {
        const next = player.nextInfo();
        window.__exploreDebug = {
          beat: currentStep,
          mode: player.mode,
          started: player.started,
          videoTime: player.videoTime(),
          frameMs: player.frameMs,
          meanFrameMs: player.totalFrameMs / Math.max(1, player.renderedFrames),
          renderedFrames: player.renderedFrames,
          activeSrc: player.active?.dataset.url ?? '',
          nextSrc: next.src,
          nextReady: next.ready,
          autoPausedMs: Math.max(0, inputHold),
          loops: player.loops,
          stillSrc: player.mode === 'still' ? (stillRef.current?.dataset.url ?? '') : '',
          labels,
          dims,
        };
      }
    };

    const start = (): void => {
      if (running || pausedRef.current || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const onVis = (): void => {
      if (document.hidden) {
        stop();
        playerRef.current?.pause();
      } else if (!pausedRef.current) {
        playerRef.current?.resume();
        start();
      }
    };
    controlRef.current = {start, stop, paint: () => {
      const player = playerRef.current;
      if (player) draw(player, performance.now());
    }};
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      controlRef.current = null;
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
    };
  }, [lastBeat]);

  useEffect(() => {
    if (stopped) controlRef.current?.stop();
    else controlRef.current?.start();
  }, [stopped]);

  // Film and end rows keep Home last, on the right. Turn it uses the picture alone.
  const buttons: RowButton[] = [];
  if (!turning && atEnd) {
    if (onNewPhoto) buttons.push({id: 'photo', label: 'New photo', onClick: onNewPhoto, primary: true});
    buttons.push({id: 'again', label: 'Watch again', onClick: watchAgain, primary: !onNewPhoto});
    if (onTurn) buttons.push({id: 'turn', label: 'Turn it', onClick: onTurn});
  } else if (!turning) {
    buttons.push({id: 'pause', label: filmPaused ? 'Resume' : 'Pause', onClick: () => setFilmPaused(value => !value)});
    if (onTurn) buttons.push({id: 'turn', label: 'Turn it', onClick: onTurn});
    if (speech && window.SpeechSynthesisUtterance && line) {
      buttons.push({id: 'listen', label: speaking ? 'Stop voice' : voiceError ? 'Retry voice' : 'Listen', onClick: listen});
    }
  }
  if (!turning) buttons.push({id: 'home', label: 'Home', onClick: onHome, home: true});
  const state = turning ? 'turn' : atEnd ? 'end' : 'film';
  const hint = `Swipe: turn · Pinch: ${open ? 'close up' : 'open up'} · Back: return`;

  const dots = captions.map((_, index) => index);
  return (
    <div className={`xp xp--${state}`} lang={lang} ref={rootRef} data-state={state} data-film-ms={filmMs}
      onPointerDownCapture={noteInput} onPointerMoveCapture={noteInput} onPointerUpCapture={noteInput}>
      <div
        className="xp-stage"
        ref={stageRef}
        tabIndex={atEnd && !turning ? -1 : 0}
        role={atEnd && !turning ? undefined : 'button'}
        aria-label={turning ? `${name}: turn it. ${hint}` : `Beat ${step + 1} of ${captions.length}. ${caption}`}
        onFocus={() => {
          if (atEnd && !turning) rowButtons(rootRef.current)[0]?.focus({preventScroll: true});
        }}
        onClick={() => {
          if (!pictureClickIsPinch()) return;
          noteInput();
          pinch();
        }}
      >
        <video ref={videoA} className="xp-media" muted playsInline preload="auto" aria-hidden="true" />
        <video ref={videoB} className="xp-media" muted playsInline preload="auto" aria-hidden="true" />
        <img ref={stillRef} className="xp-media xp-still" alt="" aria-hidden="true" />
        <canvas ref={canvasRef} className="xp-overlay" aria-hidden="true" />
        <TurnLayer ref={turnRef} canvasRef={liveCanvasRef} surface={turnSurface} active={turning}
          status={liveStatus} paused={paused} still={media.stills[step] ?? null} open={open} />
      </div>
      <div className="xp-top">
        <span className="xp-name">
          {name}
          {turning ? <>{' · '}<span className="xp-mode">Turn it</span></> : null}
        </span>
        {isSketch ? (
          <span className="ex-tag ex-tag--hot xp-tag" aria-label="Generated explanation, not checked">
            {'Sketch · unverified'}
          </span>
        ) : null}
        {standIn ? <span className="ex-tag ex-tag--soft xp-tag">Stand-in model</span> : null}
        {demo ? <span className="ex-tag ex-tag--soft xp-tag">Demo</span> : null}
        <div className="xp-beats" aria-label={`Beat ${step + 1} of ${captions.length}`}>
          <div className="xp-dots" aria-hidden="true">
            {dots.map(index => (
              <span
                key={index}
                className={`xp-dot${index === step ? ' xp-dot--current' : index < step ? ' xp-dot--past' : ''}`}
              />
            ))}
          </div>
          <span className="xp-progress" aria-hidden="true">
            <span className="xp-progress-fill" ref={progressRef} />
          </span>
        </div>
      </div>
      <div className="xp-bottom" ref={bottomRef}>
        {number && !turning ? (
          <div className="xp-number" key={`n${step}`}>
            <div className="xp-number-value">
              {number.value}
              {number.unit ? <span className="xp-number-unit">{number.unit}</span> : null}
            </div>
            {number.label ? <div className="xp-number-label">{number.label}</div> : null}
          </div>
        ) : null}
        {followUp && !turning ? (
          <p className="xp-follow-up" ref={followRef} aria-label={`Q: ${followUp.question} ${followUp.answer}`}>
            <span className="ex-follow-up-question">Q: {followUp.question}</span>{' '}
            <span className="ex-follow-up-answer">{followUp.answer}</span>
          </p>
        ) : null}
        {turning ? (
          <p className="xp-hint" key="hint">{hint}</p>
        ) : (
          <p className="xp-caption" ref={captionRef} key={`c${step}`}>
            {caption}
          </p>
        )}
        {!turning ? <div className="xp-actions" aria-label="Film controls" onFocus={() => {
          lastInputRef.current = performance.now();
        }}>
          {buttons.map(button => (
            <button
              type="button"
              key={button.id}
              className={button.home ? 'xp-home' : undefined}
              data-film-home={button.home ? '' : undefined}
              data-primary={button.primary ? '' : undefined}
              data-id={button.id}
              onClick={button.onClick}
            >
              {button.label}
            </button>
          ))}
        </div> : null}
      </div>
    </div>
  );
}
