import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, dashed, dot, fmt, glowStroke, solid} from './util';

const NP = 72;
const PI = Math.PI;
const E_BOIL = 80; // energy units to heat 20 -> 100 C
const E_END = 200; // end of the boiling plateau (latent heat)
const E_MAX = 235;

interface P {
  x: number;
  y: number;
  t: number;
}
interface B {
  x: number;
  y: number;
  r: number;
}

// small deterministic RNG so scenes can later be rendered reproducibly
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class KettleScene implements Scene {
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private heat = 3;
  private energy = 0;
  private hold = 0;
  private time = 0;
  private rand = rng(7);
  private ps: P[] = [];
  private bs: B[] = [];

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.resize(w, h);
    this.ps = [];
    for (let i = 0; i < NP; i++) this.ps.push({x: this.rand() * 2 - 1, y: 0.05 + this.rand() * 0.9, t: 0.2});
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  setStep(step: Step): void {
    this.step = step;
    this.bs = [];
    this.energy = step === 3 ? 60 : this.energy;
  }
  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') this.heat = clamp(this.heat + dir, 1, 5);
  }
  param(): number {
    return this.heat;
  }
  dispose(): void {
    this.ps = [];
    this.bs = [];
  }

  private temp(): number {
    const e = this.energy;
    if (e <= E_BOIL) return 20 + e;
    if (e <= E_END) return 100;
    return 100 + (e - E_END);
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    clear(ctx, w, h);
    this.time += dt;

    // energy clock
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.energy = 0;
    } else {
      this.energy += dt * this.heat * 4;
      if (this.energy >= E_MAX) {
        this.energy = E_MAX;
        this.hold = 1.2;
      }
    }
    const T = this.temp();
    const boiling = this.energy > E_BOIL && this.energy <= E_END;

    // vessel geometry
    const vx0 = 22;
    const vx1 = this.step === 3 ? w * 0.56 : w * 0.78;
    const vxOff = this.step === 3 ? 0 : (w - (vx1 - vx0)) / 2 - vx0;
    const x0 = vx0 + vxOff;
    const x1 = vx1 + vxOff;
    const top = 14;
    const bot = h - 40;
    const waterTop = top + 22;
    const vw = x1 - x0;
    const vh = bot - waterTop;
    const toX = (nx: number): number => x0 + ((nx + 1) / 2) * vw;
    const toY = (ny: number): number => bot - ny * vh;

    // water body (faint fill) and surface
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = C.cyan;
    ctx.fillRect(x0, waterTop, vw, vh);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = x0 + (vw * i) / 24;
      const y = waterTop + Math.sin(this.time * 3 + i * 0.9) * (1 + (boiling ? 2.5 : 0.8));
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    glowStroke(ctx, C.cyan, 2, 0.8);

    // vessel walls
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x0, bot);
    ctx.lineTo(x1, bot);
    ctx.lineTo(x1, top);
    glowStroke(ctx, C.white, 3);

    // heat source
    const flames = 7;
    for (let k = 0; k < flames; k++) {
      const fx = x0 + 12 + ((vw - 24) * k) / (flames - 1);
      const fh = (6 + this.heat * 4.2) * (0.7 + 0.3 * Math.sin(this.time * 9 + k * 1.7));
      ctx.beginPath();
      ctx.moveTo(fx - 6, h - 6);
      ctx.quadraticCurveTo(fx - 3, h - 6 - fh * 0.6, fx, h - 6 - fh);
      ctx.quadraticCurveTo(fx + 3, h - 6 - fh * 0.6, fx + 6, h - 6);
      glowStroke(ctx, C.hot, 2.5);
    }

    // convection: two rolls, up the middle and down the sides
    const A = 0.04 * this.heat;
    for (const p of this.ps) {
      const u = -A * PI * Math.sin(PI * p.x) * Math.cos(PI * p.y);
      const v = A * PI * Math.cos(PI * p.x) * Math.sin(PI * p.y);
      p.x += (u * dt) / 1 + (this.rand() - 0.5) * 0.01;
      p.y += v * dt * 2 + (this.rand() - 0.5) * 0.008;
      if (p.y < 0.04) p.y = 0.04;
      if (p.y > 0.97) p.y = 0.97;
      if (p.x < -0.97) p.x = -0.97;
      if (p.x > 0.97) p.x = 0.97;
      if (p.y < 0.28) p.t = Math.min(1, p.t + dt * 0.25 * this.heat);
      else if (p.y > 0.7) p.t = Math.max(0.1, p.t - dt * 0.35);
      const g = Math.round(150 + p.t * 105);
      ctx.globalAlpha = 0.5 + p.t * 0.5;
      ctx.fillStyle = `rgb(${Math.round(80 + p.t * 175)},${g},${Math.round(255 - p.t * 150)})`;
      ctx.beginPath();
      ctx.arc(toX(p.x), toY(p.y), 2.2 + p.t * 1.6, 0, PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // bubbles (nucleation at fixed hot spots at the bottom)
    if (this.step >= 2) {
      const rate = this.step === 2 ? this.heat * 1.6 : boiling ? this.heat * 3.2 : this.heat * 0.5;
      if (this.rand() < rate * dt && this.bs.length < 40) {
        const site = Math.floor(this.rand() * 5);
        this.bs.push({x: -0.6 + site * 0.3, y: 0.03, r: 2});
      }
      for (let i = this.bs.length - 1; i >= 0; i--) {
        const b = this.bs[i];
        b.y += dt * (0.18 + this.heat * 0.06);
        b.r = Math.min(8, b.r + dt * 3.5);
        b.x += Math.sin(this.time * 4 + i) * 0.002;
        if (b.y > 0.995) {
          this.bs.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(toX(b.x), toY(b.y), b.r, 0, PI * 2);
        glowStroke(ctx, C.white, 1.6, 0.9);
      }
    }

    // heating curve (step 3): temperature stays at 100 C while energy goes into phase change
    if (this.step === 3) {
      const gx0 = w * 0.64;
      const gx1 = w - 16;
      const gy0 = 22;
      const gy1 = h - 50;
      const gx = (e: number): number => gx0 + ((gx1 - gx0) * e) / E_MAX;
      const gy = (t: number): number => gy1 - ((gy1 - gy0) * (t - 20)) / 115;
      ctx.beginPath();
      ctx.moveTo(gx0, gy0);
      ctx.lineTo(gx0, gy1);
      ctx.lineTo(gx1, gy1);
      glowStroke(ctx, C.dim, 2);
      ctx.beginPath();
      ctx.moveTo(gx(0), gy(20));
      ctx.lineTo(gx(E_BOIL), gy(100));
      ctx.lineTo(gx(E_END), gy(100));
      ctx.lineTo(gx(E_MAX), gy(100 + (E_MAX - E_END)));
      dashed(ctx, 6, 5);
      glowStroke(ctx, C.faint, 2);
      solid(ctx);
      ctx.beginPath();
      ctx.moveTo(gx(0), gy(20));
      const upto = Math.min(this.energy, E_MAX);
      const pts: Array<[number, number]> = [
        [0, 20],
        [Math.min(upto, E_BOIL), 20 + Math.min(upto, E_BOIL)],
      ];
      if (upto > E_BOIL) pts.push([Math.min(upto, E_END), 100]);
      if (upto > E_END) pts.push([upto, 100 + (upto - E_END)]);
      pts.forEach(([e, t], i) => (i ? ctx.lineTo(gx(e), gy(t)) : ctx.moveTo(gx(e), gy(t))));
      glowStroke(ctx, boiling ? C.amber : C.cyan, 3);
      dot(ctx, gx(upto), gy(T), 6, C.white);
    }

    const state = this.energy > E_END ? 'Steam' : boiling ? 'Boiling (phase change)' : 'Heating';
    const out: Readout[] = [
      {label: 'Heat', value: `${this.heat} / 5`},
      {label: 'Water', value: `${Math.round(T)} °C`},
      {label: 'State', value: state},
    ];
    if (this.step === 3) {
      const share = boiling ? '100% to vapour' : this.energy > E_END ? 'heating steam' : '100% to warming';
      out.push({label: 'Energy goes to', value: share});
      out.push({label: 'Energy in', value: `${fmt(this.energy, 0)} units`});
    }
    return out;
  }
}
