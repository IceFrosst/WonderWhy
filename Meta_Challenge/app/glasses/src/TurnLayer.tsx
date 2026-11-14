import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent, RefObject} from 'react';
import type {View} from '@r3d/scene.js';

// Turn it controls the explanation's existing renderer and canvas. Only the view changes;
// the beat clock stays frozen. Momentum integration is shared with the original Turn it.

export interface TurnHandle {
  /** One swipe: a spin of about 35 degrees that glides to a stop; quick repeats add up. */
  turn: (direction: -1 | 1) => void;
  tilt: (direction: -1 | 1) => void;
}

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  surface: {draw: (view: View) => void; reset: () => void};
  active: boolean;
  paused: boolean;
  status: 'loading' | 'live' | 'failed';
  still: string | null;
  open: boolean;
}

// Spin with inertia: a swipe is an angular velocity impulse that glides to a stop under friction
// (about 35 degrees over about 1 s); quick swipes in the same direction add up and push harder
// (3 quick swipes = about a full turn). Friction is a little lighter at speed, so a fast spin
// carries. Integrated in fixed steps, so the glide is the same at any frame rate.
const SWIPE_SPEED = 90; // degrees per second added by one swipe
const REPEAT_BOOST = 1.8; // a quick repeat in the same direction adds this much more
const QUICK_MS = 450;
const MAX_SPEED = 360;
const FRICTION_S = 0.3; // time constant at rest speed...
const FRICTION_FAST_S = 0.9; // ...plus this much at MAX_SPEED
const STOP_SPEED = 4; // below this the spin stops
const STEP_S = 1 / 240;
const RELEASE_MS = 80; // a drag keeps the speed of its last 80 ms
const OPEN_MS = 600;
const DRAG_YAW = 0.6; // degrees per pixel
const DRAG_PITCH = 0.3;
const PITCH_LIMIT = 60;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

const TurnLayer = forwardRef<TurnHandle, Props>(function TurnLayer({canvasRef, surface, active, paused, status, still, open}, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shownMs, setShownMs] = useState<number>();
  const startedAt = useRef(performance.now());
  const current = useRef({surface, active, paused, status});
  current.current = {surface, active, paused, status};
  const pose = useRef({
    yaw: 0, speed: 0, pitch: 0, pitchSpeed: 0, at: 0,
    open: open ? 1 : 0, openFrom: open ? 1 : 0, openTarget: open ? 1 : 0, openAt: 0,
  });
  const explodeOverride = useRef(false);
  const frame = useRef(0);
  const frames = useRef(0);
  /** When the last spin started (swipe or drag release), for data-glide-ms. */
  const spunAt = useRef(0);
  const lastSwipe = useRef({yaw: {direction: 0, at: -Infinity}, pitch: {direction: 0, at: -Infinity}});
  const drag = useRef<{id: number; x: number; y: number; moved: number; samples: Array<{t: number; yaw: number; pitch: number}>} | null>(null);
  const dragEndedAt = useRef(-Infinity);
  /** Advances the spin to `now` (fixed steps, exponential friction). */
  const glide = (now: number): void => {
    const p = pose.current;
    const elapsed = p.at ? Math.min(0.25, (now - p.at) / 1000) : 0;
    p.at = now;
    if (drag.current) return;
    for (let t = 0; t < elapsed && (p.speed || p.pitchSpeed); t += STEP_S) {
      const dt = Math.min(STEP_S, elapsed - t);
      for (const axis of ['yaw', 'pitch'] as const) {
        const key = axis === 'yaw' ? 'speed' : 'pitchSpeed';
        const speed = p[key];
        const tau = FRICTION_S + FRICTION_FAST_S * (Math.abs(speed) / MAX_SPEED);
        const next = speed * Math.exp(-dt / tau);
        p[axis] += ((speed + next) / 2) * dt;
        p[key] = Math.abs(next) < STOP_SPEED ? 0 : next;
        if (axis === 'pitch' && Math.abs(p.pitch) >= PITCH_LIMIT) {
          p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch));
          p.pitchSpeed = 0;
        }
      }
    }
  };
  const paint = (): void => {
    frame.current = 0;
    const state = current.current;
    const p = pose.current;
    const now = performance.now();
    glide(now);
    const k = p.openAt ? Math.min(1, (now - p.openAt) / OPEN_MS) : 1;
    p.open = p.openFrom + (p.openTarget - p.openFrom) * easeOut(k);
    if (!state.active || state.paused || state.status !== 'live') return;
    const drawStart = performance.now();
    state.surface.draw({yaw: p.yaw, pitch: p.pitch, explode: explodeOverride.current ? p.open : null});
    const drawMs = performance.now() - drawStart;
    const moving = p.speed !== 0 || p.pitchSpeed !== 0 || k < 1;
    const root = rootRef.current;
    if (root) {
      root.dataset.yaw = String(Math.round(p.yaw));
      root.dataset.pitch = String(Math.round(p.pitch));
      root.dataset.open = p.open.toFixed(2);
      root.dataset.moving = moving ? '1' : '0';
      root.dataset.drawMs = drawMs.toFixed(1);
      root.dataset.frames = String(++frames.current);
      if (!moving && spunAt.current) {
        root.dataset.glideMs = String(Math.round(now - spunAt.current));
        spunAt.current = 0;
      }
    }
    // Render only while something moves; the loop stops when it settles.
    if (moving && !document.hidden) schedule();
  };
  const schedule = (): void => {
    if (!current.current.active || current.current.paused || current.current.status !== 'live') return;
    if (rootRef.current) rootRef.current.dataset.moving = '1';
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };

  const swipe = (axis: 'yaw' | 'pitch', direction: -1 | 1): void => {
    const now = performance.now();
    const p = pose.current;
    glide(now);
    const key = axis === 'yaw' ? 'speed' : 'pitchSpeed';
    const last = lastSwipe.current[axis];
    const quick = last.direction === direction && now - last.at < QUICK_MS && p[key] !== 0;
    lastSwipe.current[axis] = {direction, at: now};
    // Swipe right turns the model's front to the right (the camera orbits the other way).
    const speed = p[key] + direction * (axis === 'yaw' ? -1 : 1) * SWIPE_SPEED * (quick ? REPEAT_BOOST : 1);
    p[key] = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
    p.at = now;
    spunAt.current = now;
    schedule();
  };
  useImperativeHandle(ref, () => ({
    turn: direction => swipe('yaw', direction),
    tilt: direction => swipe('pitch', direction),
  }), []);

  useEffect(() => {
    const p = pose.current;
    const target = open ? 1 : 0;
    if (!active || p.openTarget === target) return;
    explodeOverride.current = true;
    p.openFrom = p.open;
    p.openTarget = target;
    p.openAt = performance.now();
    if (!p.speed) p.at = p.openAt;
    schedule();
  }, [open, active]);

  useEffect(() => {
    if (!active) return;
    startedAt.current = performance.now();
    const p = pose.current;
    Object.assign(p, {yaw: 0, speed: 0, pitch: 0, pitchSpeed: 0, at: 0, open: 0, openFrom: 0, openTarget: 0, openAt: 0});
    explodeOverride.current = false;
    frames.current = 0;
    lastSwipe.current = {yaw: {direction: 0, at: -Infinity}, pitch: {direction: 0, at: -Infinity}};
    schedule();
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      drag.current = null;
      surface.reset();
    };
  }, [active, surface]);

  useEffect(() => {
    if (!active || status !== 'live') return;
    setShownMs(Math.round(performance.now() - startedAt.current));
    schedule();
  }, [active, status]);

  useEffect(() => {
    if (!active) return;
    const visibility = (): void => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      pose.current.at = 0;
      if (!document.hidden && !current.current.paused) schedule();
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, paused]);

  // Pointer drag (the simulator forwards its touch pad here): turn, and tilt a little.
  const down = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (drag.current || event.button !== 0) return;
    const p = pose.current;
    glide(performance.now());
    p.speed = 0; // a finger on the pad catches the spin
    p.pitchSpeed = 0;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0, samples: [{t: performance.now(), yaw: p.yaw, pitch: p.pitch}]};
    if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current;
    if (d?.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    d.x = event.clientX;
    d.y = event.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    const p = pose.current;
    const now = performance.now();
    p.yaw -= dx * DRAG_YAW;
    p.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p.pitch + dy * DRAG_PITCH));
    d.samples.push({t: now, yaw: p.yaw, pitch: p.pitch});
    while (d.samples.length > 2 && now - d.samples[0].t > RELEASE_MS) d.samples.shift();
    schedule();
  };
  const up = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const d = drag.current;
    if (d?.id !== event.pointerId) return;
    if (d.moved > 6) dragEndedAt.current = performance.now();
    // Let go: keep the speed of the last ~80 ms of movement, then glide.
    const now = performance.now();
    const recent = d.samples.filter(sample => now - sample.t <= RELEASE_MS);
    const first = recent[0];
    const last = recent.at(-1);
    const span = first && last ? (last.t - first.t) / 1000 : 0;
    const p = pose.current;
    for (const axis of ['yaw', 'pitch'] as const) {
      const speed = span > 0.008 && first && last ? (last[axis] - first[axis]) / span : 0;
      p[axis === 'yaw' ? 'speed' : 'pitchSpeed'] = Math.abs(speed) < STOP_SPEED ? 0 : Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
    }
    p.at = now;
    if (p.speed || p.pitchSpeed) spunAt.current = now;
    drag.current = null;
    schedule();
  };

  return (
    <div
      className={active ? `xp-inspect xp-turn--${status}` : 'xp-live-layer'}
      ref={rootRef}
      data-turn-ms={shownMs}
      onClickCapture={event => {
        // The click that ends a drag is not a pinch.
        if (performance.now() - dragEndedAt.current < 400) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
    >
      {active && still && status === 'failed' ? <img className="xp-turn-still" src={still} alt="" aria-hidden="true" onError={event => { event.currentTarget.style.display = 'none'; }} /> : null}
      <canvas
        ref={canvasRef}
        className="xp-media xp-live"
        data-renderer={status === 'live' ? 'three' : 'still'}
        width={600}
        height={600}
        aria-hidden="true"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
      />
      {active && status === 'failed' ? <p className="xp-turn-note" role="status">3D view unavailable</p> : null}
    </div>
  );
});

export default TurnLayer;
