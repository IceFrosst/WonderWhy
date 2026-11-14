import {useEffect, useRef, useState} from 'react';
import type {PointerEvent} from 'react';
import assembled from '../../turntable/assembled.webp?url';
import exploded from '../../turntable/exploded.webp?url';
import {emitNav, onNav} from './bus';
import type {NavAction} from './bus';

const modes = ['Rotate', 'Zoom', 'Pan'] as const;
const FRAME_DEGREES = 5;
const ATLAS_COLUMNS = 9;
const TILE = 240;
const VIEW_SIZE = 480;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number) => ((value % 360) + 360) % 360;

export default function InspectView({motionMs, onBack}: {motionMs?: number; onBack: () => void}) {
  const [mode, setMode] = useState<(typeof modes)[number]>('Rotate');
  const [pose, setPose] = useState({angle: 0, zoom: 1, x: 0, y: 0});
  const [inside, setInside] = useState(false);
  const [liveRenderer, setLiveRenderer] = useState<typeof import('./liveKettle') | null>(null);
  const [useLive, setUseLive] = useState(() => new URLSearchParams(window.location.search).get('live3d') !== '0');
  const [pitch, setPitch] = useState(0);
  const [shownAngle, setShownAngle] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [inspectMs, setInspectMs] = useState<number>();
  const startedAt = useRef(performance.now());
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof import('./liveKettle.js').createLiveKettle> | null>(null);
  const panel = useRef<HTMLElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{id: number; x: number; y: number} | null>(null);
  const lastSwipe = useRef({direction: 0, at: -Infinity});
  const angle = useRef(0);
  const separation = useRef(0);
  const lastPaint = useRef(-Infinity);
  const images = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    panel.current?.focus();
    const clearDrag = () => { drag.current = null; };
    document.addEventListener('visibilitychange', clearDrag);
    return () => document.removeEventListener('visibilitychange', clearDrag);
  }, []);

  useEffect(() => {
    let active = true;
    if (useLive) {
      import('./liveKettle.js').then(module => { if (active) setLiveRenderer(module); },
        () => { if (active) setUseLive(false); });
      return () => { active = false; };
    }
    const views = [new Image(), new Image()];
    images.current = views;
    views[0].src = assembled;
    views[1].src = exploded;
    Promise.all(views.map(image => image.decode())).then(
      () => { if (active) setLoaded(true); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [useLive]);

  useEffect(() => {
    if (!useLive || !liveRenderer || !canvas.current) return;
    const element = canvas.current;
    const onLost = (event: Event) => {
      event.preventDefault();
      setUseLive(false);
    };
    let live;
    try {
      live = liveRenderer.createLiveKettle(element);
    } catch {
      setUseLive(false);
      return;
    }
    renderer.current = live;
    setLiveReady(true);
    element.addEventListener('webglcontextlost', onLost);
    return () => {
      element.removeEventListener('webglcontextlost', onLost);
      renderer.current = null;
      live.dispose();
    };
  }, [useLive, liveRenderer]);

  useEffect(() => {
    const keys: Record<string, NavAction> = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'next',
    };
    const onKey = (event: KeyboardEvent) => {
      const action = keys[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (document.activeElement === backButton.current) {
        if (action === 'next' && !event.repeat) onBack();
        if (action === 'down') panel.current?.focus();
        return;
      }
      if (action === 'up' && mode === 'Rotate') {
        backButton.current?.focus();
        return;
      }
      if (action !== 'next' || !event.repeat) emitNav(action);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, onBack]);

  useEffect(() => {
    const live = useLive ? renderer.current : null;
    const ctx = useLive ? null : canvas.current?.getContext('2d');
    if (useLive ? !live : !ctx || !loaded) return;
    let request = 0;
    const paint = (now: number) => {
      if (now - lastPaint.current < 1000 / 30 - 1) { request = requestAnimationFrame(paint); return; }
      lastPaint.current = now;
      setInspectMs(previous => previous ?? Math.round(now - startedAt.current));
      const delta = wrap(pose.angle - angle.current + 180) - 180;
      if (live) {
        const target = Number(inside);
        const gap = target - separation.current;
        separation.current = Math.abs(gap) < 0.015 ? target : separation.current + gap * 0.32;
        angle.current = pose.angle;
        live.draw({...pose, pitch}, separation.current);
        setShownAngle(Math.round(pose.angle) % 360);
        if (separation.current !== target && !document.hidden) request = requestAnimationFrame(paint);
        return;
      }
      if (!ctx) return;
      angle.current = Math.abs(delta) < FRAME_DEGREES
        ? pose.angle
        : wrap(angle.current + Math.sign(delta) * FRAME_DEGREES);
      const frame = Math.round(angle.current / FRAME_DEGREES) % 72;
      const side = VIEW_SIZE * pose.zoom;
      const offset = (VIEW_SIZE - side) / 2;
      ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);
      ctx.drawImage(images.current[Number(inside)], frame % ATLAS_COLUMNS * TILE, Math.floor(frame / ATLAS_COLUMNS) * TILE,
        TILE, TILE, offset + pose.x, offset + pose.y, side, side);
      setShownAngle(frame * FRAME_DEGREES);
      if (angle.current !== pose.angle && !document.hidden) request = requestAnimationFrame(paint);
    };
    request = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(request);
  }, [loaded, inside, pose, pitch, useLive, liveReady]);

  useEffect(() => onNav(action => {
    if (action === 'next' || action === 'deeper') {
      setInside(value => !value);
      return;
    }
    if (mode === 'Pan' && (action === 'left' || action === 'right')) {
      setPose(value => ({...value, x: clamp(value.x + (action === 'left' ? -20 : 20), -115, 115)}));
      return;
    }
    if (action === 'up' || action === 'down') {
      setMode(value => modes[(modes.indexOf(value) + (action === 'up' ? 2 : 1)) % modes.length]);
      return;
    }
    if (action !== 'left' && action !== 'right') return;
    const direction = action === 'left' ? -1 : 1;
    const now = performance.now();
    const frames = lastSwipe.current.direction === direction && now - lastSwipe.current.at < 260 ? 3 : 1;
    lastSwipe.current = {direction, at: now};
    setPose(value => mode === 'Zoom'
      ? {...value, zoom: clamp(value.zoom + direction * 0.15, 0.75, 1.9)}
      : {...value, angle: wrap(value.angle + direction * FRAME_DEGREES * frames)});
  }), [mode]);

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current || event.button !== 0) return;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY};
    // The camera simulator forwards synthetic pointer events from its own touch surface.
    if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const last = drag.current;
    if (last?.id !== event.pointerId) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (mode === 'Rotate' && useLive) setPitch(value => clamp(value - dy * 0.42, -65, 65));
    setPose(value => {
      if (mode === 'Rotate') return {...value, angle: wrap(value.angle + dx * 1.2)};
      if (mode === 'Zoom') return {...value, zoom: clamp(value.zoom * Math.exp(-dy / 190), 0.75, 1.9)};
      return {...value, x: clamp(value.x + dx, -115, 115), y: clamp(value.y + dy, -115, 115)};
    });
  };
  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  return (
    <section className="xp-inspect" aria-label="Inspect the kettle" tabIndex={-1} ref={panel}
      data-film-ms={motionMs} data-inspect-ms={inspectMs} data-angle={shownAngle}
      onWheel={event => {
        if (mode !== 'Rotate') return;
        const delta = event.deltaX || event.deltaY;
        setPose(value => ({...value, angle: wrap(value.angle + Math.sign(delta) * FRAME_DEGREES
          * clamp(Math.ceil(Math.abs(delta) / 32), 1, 3))}));
      }}>
      <header className="xp-inspect-header">
        <h1>{inside ? 'Inside the kettle' : 'Inspect the kettle'}</h1>
        <button type="button" ref={backButton} onClick={onBack}>Back to film</button>
      </header>
      <canvas key={useLive ? 'live' : 'frames'} data-renderer={useLive ? 'three' : 'atlas'}
        width={VIEW_SIZE} height={VIEW_SIZE} ref={canvas} aria-hidden="true"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
      {!(useLive ? liveReady : loaded) && (
        <p className="xp-inspect-status" role="status">
          {error && !useLive ? 'Views unavailable. Back to return.' : 'Loading views…'}
        </p>
      )}
    </section>
  );
}
