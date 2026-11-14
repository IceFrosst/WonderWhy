import type {Readout, Scene, Step} from './types';
import {C, arrow, clamp, clear, dashed, dot, fmt, glowStroke, solid} from './util';

const G = 9.81;
const K_DRAG = 0.03; // quadratic drag coefficient per unit mass, 1/m
const DT = 0.004;

interface Sample {
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Path {
  s: Sample[];
  range: number;
  maxH: number;
  tEnd: number;
}

function analytic(v0: number, deg: number): Path {
  const a = (deg * Math.PI) / 180;
  const vx = v0 * Math.cos(a);
  const vy0 = v0 * Math.sin(a);
  const tEnd = (2 * vy0) / G;
  const n = 90;
  const s: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (tEnd * i) / n;
    s.push({t, x: vx * t, y: vy0 * t - 0.5 * G * t * t, vx, vy: vy0 - G * t});
  }
  s[n].y = 0;
  return {s, range: vx * tEnd, maxH: (vy0 * vy0) / (2 * G), tEnd};
}

// Semi-implicit Euler with quadratic drag: a = -k |v| v - g.
function withDrag(v0: number, deg: number): Path {
  const a = (deg * Math.PI) / 180;
  let vx = v0 * Math.cos(a);
  let vy = v0 * Math.sin(a);
  let x = 0;
  let y = 0;
  let t = 0;
  let maxH = 0;
  const s: Sample[] = [{t, x, y, vx, vy}];
  let i = 0;
  while (t < 30) {
    const sp = Math.hypot(vx, vy);
    vx += -K_DRAG * sp * vx * DT;
    vy += (-G - K_DRAG * sp * vy) * DT;
    const px = x;
    const py = y;
    x += vx * DT;
    y += vy * DT;
    t += DT;
    if (y > maxH) maxH = y;
    if (y < 0) {
      const f = py / (py - y);
      x = px + (x - px) * f;
      y = 0;
      s.push({t, x, y, vx, vy});
      break;
    }
    if (++i % 8 === 0) s.push({t, x, y, vx, vy});
  }
  return {s, range: x, maxH, tEnd: t};
}

function sampleAt(p: Path, t: number): Sample {
  const s = p.s;
  if (t <= 0) return s[0];
  if (t >= p.tEnd) return s[s.length - 1];
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const f = (t - a.t) / (b.t - a.t || 1);
  return {
    t,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    vx: a.vx + (b.vx - a.vx) * f,
    vy: a.vy + (b.vy - a.vy) * f,
  };
}

export class BallScene implements Scene {
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private angle = 45;
  private speed = 18;
  private clock = 0;
  private ideal!: Path;
  private real!: Path;
  private bestAngle = 45;
  private trail: Array<{x: number; y: number}> = [];

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.resize(w, h);
    this.recompute();
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  setStep(step: Step): void {
    this.step = step;
    this.clock = 0;
    this.trail = [];
    this.recompute();
  }
  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') this.angle = clamp(this.angle + dir * 2, 5, 85);
    else this.speed = clamp(this.speed + dir * 1, 5, 30);
    this.clock = 0;
    this.trail = [];
    this.recompute();
  }
  param(): number {
    return this.angle;
  }
  dispose(): void {
    this.trail = [];
  }

  private recompute(): void {
    this.ideal = analytic(this.speed, this.angle);
    this.real = withDrag(this.speed, this.angle);
    if (this.step === 3) {
      let best = 45;
      let bestR = -1;
      for (let a = 15; a <= 70; a += 1) {
        const r = withDrag(this.speed, a).range;
        if (r > bestR) {
          bestR = r;
          best = a;
        }
      }
      this.bestAngle = best;
    }
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    clear(ctx, w, h);
    const drag = this.step === 3;
    const main = drag ? this.real : this.ideal;
    const padX = 22;
    const padTop = 18;
    const groundY = h - 20;
    const maxR = Math.max(this.ideal.range, drag ? this.real.range : 0, 1);
    const maxH = Math.max(this.ideal.maxH, 1);
    const sc = Math.min((w - padX * 2) / maxR, (groundY - padTop) / maxH);
    const ox = padX;
    const px = (x: number): number => ox + x * sc;
    const py = (y: number): number => groundY - y * sc;

    // ground
    ctx.beginPath();
    ctx.moveTo(ox - 10, groundY);
    ctx.lineTo(w - 6, groundY);
    glowStroke(ctx, C.dim, 2);

    // dimmed no-drag comparison
    if (drag) {
      ctx.beginPath();
      this.ideal.s.forEach((p, i) => (i ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y))));
      dashed(ctx, 7, 7);
      glowStroke(ctx, C.dim, 2);
      solid(ctx);
    }

    // full predicted path
    ctx.beginPath();
    main.s.forEach((p, i) => (i ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y))));
    glowStroke(ctx, C.cyan, 3);

    // landing marker + apex marker
    dot(ctx, px(main.range), groundY, 4, C.cyan);

    // animate ball
    this.clock += dt * 0.9;
    const hold = 0.7;
    if (this.clock > main.tEnd + hold) {
      this.clock = 0;
      this.trail = [];
    }
    const s = sampleAt(main, Math.min(this.clock, main.tEnd));
    const bx = px(s.x);
    const by = py(s.y);
    this.trail.push({x: bx, y: by});
    if (this.trail.length > 10) this.trail.shift();
    for (let i = 0; i < this.trail.length; i++) {
      ctx.globalAlpha = (i / this.trail.length) * 0.5;
      dot(ctx, this.trail[i].x, this.trail[i].y, 4 * (i / this.trail.length) + 1, C.white);
    }
    ctx.globalAlpha = 1;

    // launch angle wedge
    const a = (this.angle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(ox, groundY);
    ctx.lineTo(ox + Math.cos(a) * 34, groundY - Math.sin(a) * 34);
    glowStroke(ctx, C.amber, 2);

    // velocity components (step 2)
    if (this.step === 2) {
      const k = 3.2;
      arrow(ctx, bx, by, bx + s.vx * k, by, C.cyan, 3);
      arrow(ctx, bx, by, bx, by - s.vy * k, C.amber, 3);
      arrow(ctx, bx, by, bx + s.vx * k, by - s.vy * k, C.white, 2);
    }

    dot(ctx, bx, by, 7, C.white);

    if (this.step === 2) {
      return [
        {label: 'Speed', value: `${this.speed} m/s`},
        {label: 'Vx (constant)', value: `${fmt(s.vx)} m/s`},
        {label: 'Vy', value: `${s.vy >= 0 ? '+' : ''}${fmt(s.vy)} m/s`},
      ];
    }
    if (drag) {
      return [
        {label: 'Angle', value: `${this.angle}\u00b0`},
        {label: 'Range', value: `${fmt(main.range)} m`},
        {label: 'Best angle', value: `${this.bestAngle}\u00b0`},
      ];
    }
    return [
      {label: 'Angle', value: `${this.angle}\u00b0`},
      {label: 'Range', value: `${fmt(main.range)} m`},
      {label: 'Max height', value: `${fmt(main.maxH)} m`},
    ];
  }
}
