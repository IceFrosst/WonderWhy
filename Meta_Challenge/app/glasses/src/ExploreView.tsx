import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {emitNav, onNav} from './bus';
import {anchorAt, loadTracks} from './explore';
import type {ExploreMedia, ExploreSpec, Tracks} from './explore';
import {C} from './scenes/palette';

// Explore lens player (shared/MODEL3D.md "Screen layout of this lens"): the beat's video full
// frame behind a label overlay, a top line with the object name and beat dots, the number block
// and a two-line caption. Two video elements take turns so a beat change never shows black.

interface Props {
  name: string;
  captions: string[];
  spec: ExploreSpec;
  media: ExploreMedia;
  /** 0-based beat. */
  step: number;
  /** Increments when the wearer asks to replay the current beat. */
  replay: number;
  isSketch: boolean;
  autoPlay: boolean;
  paused: boolean;
  standIn?: boolean;
  demo?: boolean;
  lang?: string;
  onAuto: () => void;
  onRendered: () => void;
  /** A follow-up question answered on this beat (shown above the caption). */
  followUp?: {question: string; answer: string} | null;
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

type Mode = 'loading' | 'video' | 'still' | 'none';

const FALLBACK_MS = 1500;
const INPUT_PAUSE_MS = 20000;
const FADE_MS = 300;
const FRAME_GAP_MS = 1000 / 30;
const LABEL_FONT = 17;
const LABEL_GAP = 30;
const MARGIN = 24;
const LABEL_MAX_W = 196;
const FOCUS_DELAY_MS = 50;

/** Owns the two beat videos and the still; knows nothing about React. */
class BeatPlayer {
  mode: Mode = 'loading';
  beat = -1;
  started = false;
  startedAt = 0;
  loops = 0;
  private token = 0;
  private current: HTMLVideoElement | null = null;
  private fallbackTimer: number | undefined;
  private frames: number[] = [];
  private paused = false;
  private loopFrom = 0;
  private disposed = false;

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

  get active(): HTMLVideoElement | null {
    return this.mode === 'video' ? this.current : null;
  }

  get other(): HTMLVideoElement {
    return this.current === this.videos[0] ? this.videos[1] : this.videos[0];
  }

  videoTime(): number {
    return this.current && this.mode === 'video' ? this.current.currentTime : 0;
  }

  setLoopFrom(seconds: number): void {
    this.loopFrom = seconds;
  }

  show(beat: number, restart: boolean): void {
    if (this.disposed) return;
    const token = ++this.token;
    window.clearTimeout(this.fallbackTimer);
    const url = this.media.videos[beat] ?? null;
    this.beat = beat;
    this.started = false;
    this.startedAt = 0;
    this.loops = 0;
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
    const video = this.current;
    if (!video || this.disposed || this.paused) return;
    if (this.mode === 'loading' && video.readyState >= 2) this.reveal(this.token, video);
    if (this.mode !== 'video') return;
    if (!this.started && !video.paused && !video.seeking && video.currentTime > 0.03) {
      this.started = true;
      this.startedAt = now - video.currentTime * 1000;
      window.clearTimeout(this.fallbackTimer);
    }
    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0.3 && !video.seeking && video.currentTime >= duration - 0.07) this.loop(video);
  }

  pause(): void {
    this.paused = true;
    window.clearTimeout(this.fallbackTimer);
    for (const video of this.videos) video.pause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.current && (this.mode === 'video' || this.mode === 'loading')) this.play(this.current);
    if (!this.started && this.mode !== 'still' && this.mode !== 'none') this.armFallback(this.token, this.beat);
  }

  dispose(): void {
    this.disposed = true;
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
        this.preloadNext();
      });
      this.frames.push(second);
    });
    this.frames.push(first);
    if (this.frames.length > 16) this.frames.splice(0, this.frames.length - 16);
  }

  private preloadNext(): void {
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
      if (ok) {
        this.still.classList.add('is-on');
        for (const video of this.videos) {
          video.classList.remove('is-on');
          video.pause();
        }
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

interface Placed {
  part: string;
  text: string;
  side: 'l' | 'r';
  focus: boolean;
  y: number;
  width: number;
  samples: Array<[number, number, number]>;
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

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): {text: string; width: number} {
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
  media,
  step,
  replay,
  isSketch,
  autoPlay,
  paused,
  standIn,
  demo,
  lang,
  onAuto,
  onRendered,
  followUp = null,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const stillRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const numberRef = useRef<HTMLDivElement>(null);
  const followRef = useRef<HTMLParagraphElement>(null);
  const playerRef = useRef<BeatPlayer | null>(null);
  const controlRef = useRef<{start: () => void; stop: () => void} | null>(null);
  const tracksRef = useRef<Tracks | null>(null);
  const lastInputRef = useRef(-Infinity);
  const layoutDirty = useRef(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const live = useRef({step, replay, autoPlay, onAuto, onRendered, spec});
  live.current = {step, replay, autoPlay, onAuto, onRendered, spec};
  const [captionSize, setCaptionSize] = useState(20);
  const beat = spec.beats[step];
  const caption = captions[step] ?? '';
  const number = beat?.number ?? null;
  const lastBeat = captions.length - 1;

  // Any wearer input (D-pad, pinch, bridge nav) pauses auto-play for 20 s.
  useEffect(() => onNav(() => {
    lastInputRef.current = performance.now();
  }), []);
  // A follow-up answer holds its beat like input does, so the answer stays readable.
  const hasFollowUp = followUp !== null;
  useEffect(() => {
    if (hasFollowUp) lastInputRef.current = performance.now();
  }, [hasFollowUp]);

  // Pinch lands on the stage: keep it focused.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = stageRef.current;
      if (el && document.activeElement !== el) el.focus({preventScroll: true});
    }, FOCUS_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  // Caption: 20 px, at most 2 lines; a long (translated) sentence steps down to 18 then 16 px.
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    let size = 20;
    for (const candidate of [20, 18, 16]) {
      size = candidate;
      el.style.fontSize = `${candidate}px`;
      el.style.lineHeight = `${Math.round(candidate * 1.3)}px`;
      if (el.scrollHeight <= Math.round(candidate * 1.3) * 2 + 1) break;
    }
    setCaptionSize(size);
    layoutDirty.current = true;
  }, [caption]);

  useEffect(() => {
    layoutDirty.current = true;
  }, [step, number, captionSize, followUp]);

  // One player per lens visit.
  useEffect(() => {
    const a = videoA.current;
    const b = videoB.current;
    const still = stillRef.current;
    if (!a || !b || !still) return;
    let rendered = false;
    const shown = (): void => {
      layoutDirty.current = true;
      if (rendered) return;
      rendered = true;
      live.current.onRendered();
    };
    const player = new BeatPlayer([a, b], still, media, shown);
    playerRef.current = player;
    let cancelled = false;
    loadTracks(media.tracks).then(tracks => {
      if (cancelled) return;
      tracksRef.current = tracks;
      layoutDirty.current = true;
      player.setLoopFrom(tracks?.beats[player.beat]?.loopFrom ?? 0);
    });
    // Text and labels are on screen even if no picture ever arrives.
    const safety = window.setTimeout(shown, FALLBACK_MS + 200);
    return () => {
      cancelled = true;
      window.clearTimeout(safety);
      player.dispose();
      if (playerRef.current === player) playerRef.current = null;
      if (navigator.webdriver) delete window.__exploreDebug;
    };
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
    layoutDirty.current = true;
  }, [step, replay, media]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (paused) player.pause();
    else player.resume();
  }, [paused]);

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
    let placed: Placed[] = [];
    let dims: Array<{text: string; x: number; y: number; alpha: number}> = [];
    let scrimTop = stage.clientHeight - 80;

    // Black bands behind the top line and the caption: on the additive display they remove the
    // model's light under the words (the video is ours to composite), so text never sits on lines.
    const scrims = (): void => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const top = ctx.createLinearGradient(0, 0, 0, 66);
      top.addColorStop(0, 'rgba(0,0,0,0.9)');
      top.addColorStop(0.7, 'rgba(0,0,0,0.9)');
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, 66);
      const from = Math.max(66, scrimTop - 28);
      const bottom = ctx.createLinearGradient(0, from, 0, scrimTop);
      bottom.addColorStop(0, 'rgba(0,0,0,0)');
      bottom.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = bottom;
      ctx.fillRect(0, from, w, scrimTop - from);
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(0, scrimTop, w, h - scrimTop);
    };
    let placedFor = '';
    let fadeStart = 0;
    let fadeKey = '';
    let autoFiredFor = -1;
    let pausedAt = 0;
    let running = false;

    const fit = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(stage.clientWidth * dpr);
      const h = Math.round(stage.clientHeight * dpr);
      if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
        canvas.width = w;
        canvas.height = h;
        layoutDirty.current = true;
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

    const layout = (player: BeatPlayer): void => {
      const tracks = tracksRef.current;
      const currentStep = live.current.step;
      const beatSpec = live.current.spec.beats[currentStep];
      const trackBeat = tracks?.beats[currentStep];
      placed = [];
      const stageRect = stage.getBoundingClientRect();
      scrimTop = bottomRef.current ? bottomRef.current.getBoundingClientRect().top - stageRect.top : stage.clientHeight - 80;
      if (!tracks || !trackBeat || !beatSpec) return;
      const topLimit = 72;
      // Left labels stay above the whole bottom block (the number sits bottom left); right labels
      // stay above the full-width lines (follow-up answer, caption).
      const captionTop = (captionRef.current?.getBoundingClientRect().top ?? stageRect.bottom - 80) - stageRect.top;
      const followTop = followRef.current ? followRef.current.getBoundingClientRect().top - stageRect.top : null;
      const bottomTop = bottomRef.current ? bottomRef.current.getBoundingClientRect().top - stageRect.top : captionTop;
      const rightMax = (followTop ?? captionTop) - 20;
      const leftMax = Math.min(bottomTop, followTop ?? captionTop) - 20;
      const {scale, ox, oy} = frameMap(tracks.size);
      // The still (c<n>.png) is the frame at loopFrom, the beat's rest pose.
      const restT = player.mode === 'still' ? trackBeat.loopFrom : trackBeat.move + 0.1;
      ctx.font = `600 ${LABEL_FONT}px ${fontFamily}`;
      const items = trackBeat.labels
        .filter(label => live.current.spec.parts.get(label.part))
        .slice(0, 3)
        .map(label => {
          const [ax, ay] = anchorAt(label.samples, restT);
          const sx = ox + ax * scale;
          const sy = oy + ay * scale;
          const side: 'l' | 'r' = label.side ?? (sx < stage.clientWidth / 2 ? 'l' : 'r');
          const fitted = fitText(ctx, live.current.spec.parts.get(label.part) ?? '', LABEL_MAX_W);
          return {
            part: label.part,
            text: fitted.text,
            width: fitted.width,
            side,
            focus: label.focus || beatSpec.focus.includes(label.part),
            y: sy,
            samples: label.samples,
          };
        });
      for (const side of ['l', 'r'] as const) {
        const column = items.filter(item => item.side === side).sort((a, b) => a.y - b.y);
        const max = side === 'l' ? leftMax : rightMax;
        for (let i = 0; i < column.length; i++) {
          const min = i === 0 ? topLimit : column[i - 1].y + LABEL_GAP;
          column[i].y = Math.max(min, Math.min(column[i].y, max));
        }
        for (let i = column.length - 1; i >= 0; i--) {
          const limit = i === column.length - 1 ? max : column[i + 1].y - LABEL_GAP;
          column[i].y = Math.max(topLimit, Math.min(column[i].y, limit));
        }
      }
      placed = items;
    };

    const draw = (player: BeatPlayer, now: number): DebugLabel[] => {
      const dpr = canvas.width / Math.max(1, stage.clientWidth);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scrims();
      const tracks = tracksRef.current;
      const currentStep = live.current.step;
      const trackBeat = tracks?.beats[currentStep];
      if (!tracks || !trackBeat || !player.started || player.beat !== currentStep) return [];
      const t = player.mode === 'still' ? trackBeat.loopFrom : player.videoTime();
      // Labels fade in again whenever the camera move plays again (new beat or replay).
      if (fadeKey !== `${currentStep}:${live.current.replay}`) {
        fadeKey = `${currentStep}:${live.current.replay}`;
        fadeStart = 0;
      }
      if (!fadeStart && (player.mode === 'still' || player.mode === 'none' || t >= trackBeat.move)) fadeStart = now;
      const alpha = fadeStart ? Math.min(1, (now - fadeStart) / FADE_MS) : 0;
      const {scale, ox, oy} = frameMap(tracks.size);
      const out: DebugLabel[] = [];
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `600 ${LABEL_FONT}px ${fontFamily}`;
      ctx.textBaseline = 'middle';
      const right = stage.clientWidth - MARGIN;
      for (const label of placed) {
        const [fx, fy] = anchorAt(label.samples, t);
        const ax = ox + fx * scale;
        const ay = oy + fy * scale;
        const colour = label.focus ? C.white : C.soft;
        const textX = label.side === 'l' ? MARGIN : right;
        const lineX = label.side === 'l' ? MARGIN + label.width + 8 : right - label.width - 8;
        out.push({part: label.part, text: label.text, alpha, side: label.side, focus: label.focus, x: textX, y: label.y, w: label.width, ax, ay});
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.textAlign = label.side === 'l' ? 'left' : 'right';
        haloText(ctx, label.text, textX, label.y);
        ctx.fillText(label.text, textX, label.y);
        const towards = label.side === 'l' ? ax > lineX + 6 : ax < lineX - 6;
        if (towards) {
          ctx.globalAlpha = alpha * 0.8;
          ctx.strokeStyle = C.soft;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(lineX, label.y);
          const elbow = label.side === 'l' ? lineX + 10 : lineX - 10;
          ctx.lineTo(elbow, label.y);
          ctx.lineTo(ax, ay);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Dimension texts ("65 cm") sit just above the middle of the line the video draws.
      dims = [];
      ctx.font = `600 16px ${fontFamily}`;
      ctx.textAlign = 'center';
      trackBeat.dims.forEach((dim, index) => {
        const text = live.current.spec.beats[currentStep]?.dims[index] || dim.text;
        if (!text) return;
        const [fx, fy] = anchorAt(dim.samples, t);
        const half = ctx.measureText(text).width / 2;
        const x = Math.min(Math.max(ox + fx * scale, MARGIN + half), right - half);
        const y = Math.max(72, oy + fy * scale - 14);
        dims.push({text, x, y, alpha});
        if (alpha <= 0) return;
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
      const currentStep = live.current.step;
      const key = `${currentStep}|${player.mode}|${tracksRef.current ? 1 : 0}`;
      if (layoutDirty.current || key !== placedFor) {
        layoutDirty.current = false;
        placedFor = key;
        layout(player);
      }
      const labels = draw(player, now);

      // Auto-play: the beat's own duration from when its video really started; input holds it 20 s.
      const tracks = tracksRef.current;
      // The spec's beat dur (default 6 s); tracks.json's dur is the clip length, move included.
      const dur = (live.current.spec.beats[currentStep]?.dur ?? 6) * 1000;
      const inputHold = lastInputRef.current + INPUT_PAUSE_MS - now;
      const canAuto = live.current.autoPlay && currentStep < lastBeat && player.beat === currentStep;
      const progress = progressRef.current;
      if (progress) {
        const show = canAuto && player.started && inputHold <= 0;
        progress.style.opacity = show ? '1' : '0';
        if (show) progress.style.transform = `scaleX(${Math.min(1, (now - player.startedAt) / dur).toFixed(3)})`;
      }
      if (canAuto && player.started && autoFiredFor !== currentStep) {
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
      const player = playerRef.current;
      if (player && pausedAt && player.started) player.startedAt += last - pausedAt;
      pausedAt = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (!running) return;
      running = false;
      pausedAt = performance.now();
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
    controlRef.current = {start, stop};
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
    if (paused) controlRef.current?.stop();
    else controlRef.current?.start();
  }, [paused]);

  const dots = captions.map((_, index) => index);
  return (
    <div className="xp" lang={lang} ref={rootRef}>
      <div
        className="xp-stage"
        ref={stageRef}
        tabIndex={0}
        role="button"
        aria-label={`Beat ${step + 1} of ${captions.length}. ${caption}`}
        onClick={() => emitNav('next')}
      >
        <video ref={videoA} className="xp-media" muted playsInline preload="auto" aria-hidden="true" />
        <video ref={videoB} className="xp-media" muted playsInline preload="auto" aria-hidden="true" />
        <img ref={stillRef} className="xp-media xp-still" alt="" aria-hidden="true" />
        <canvas ref={canvasRef} className="xp-overlay" aria-hidden="true" />
      </div>
      <div className="xp-top">
        <span className="xp-name">{name}</span>
        {isSketch ? (
          <span className="ex-tag ex-tag--hot xp-tag" aria-label="Generated explanation, not checked">
            {'Sketch \u00b7 unverified'}
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
        {number ? (
          <div className="xp-number" ref={numberRef} key={`n${step}`}>
            <div className="xp-number-value">
              {number.value}
              {number.unit ? <span className="xp-number-unit">{number.unit}</span> : null}
            </div>
            {number.label ? <div className="xp-number-label">{number.label}</div> : null}
          </div>
        ) : null}
        {followUp ? (
          <p className="xp-follow-up" ref={followRef} aria-label={`Q: ${followUp.question} ${followUp.answer}`}>
            <span className="ex-follow-up-question">Q: {followUp.question}</span>{' '}
            <span className="ex-follow-up-answer">{followUp.answer}</span>
          </p>
        ) : null}
        <p className="xp-caption" ref={captionRef} key={`c${step}`}>
          {caption}
        </p>
      </div>
    </div>
  );
}
