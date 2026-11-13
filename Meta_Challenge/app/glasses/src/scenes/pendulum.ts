import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, dashed, dot, fmt, glowStroke, solid} from './util';

const G = 9.81;
const THETA0 = (20 * Math.PI) / 180;
const WINDOW = 4; // seconds of angle trace kept in step 2

export class PendulumScene implements Scene {
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private len = 1.0;
  private time = 0;
  private trace: Array<{t: number; a: number}> = [];

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.resize(w, h);
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  setStep(step: Step): void {
    this.step = step;
    this.trace = [];
  }
  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') {
      this.len = clamp(Math.round((this.len + dir * 0.1) * 10) / 10, 0.2, 2.0);
      this.trace = [];
    }
  }
  param(): number {
    return this.len;
  }
  dispose(): void {
    this.trace = [];
  }

  private period(): number {
    return 2 * Math.PI * Math.sqrt(this.len / G);
  }

  private swing(px: number, pivotY: number, sc: number, theta: number, r: number, color: string): void {
    const {ctx} = this;
    const Lpx = this.len * sc;
    // swing arc
    ctx.beginPath();
    ctx.arc(px, pivotY, Lpx, Math.PI / 2 - THETA0, Math.PI / 2 + THETA0);
    dashed(ctx, 4, 6);
    glowStroke(ctx, C.faint, 1.5);
    solid(ctx);
    const bx = px + Math.sin(theta) * Lpx;
    const by = pivotY + Math.cos(theta) * Lpx;
    ctx.beginPath();
    ctx.moveTo(px, pivotY);
    ctx.lineTo(bx, by);
    glowStroke(ctx, C.white, 2);
    dot(ctx, bx, by, r, color);
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    clear(ctx, w, h);
    this.time += dt;
    const T = this.period();
    const theta = THETA0 * Math.cos((2 * Math.PI * this.time) / T);
    const pivotY = 14;
    const sc = (h - 24) / 2.05;

    const px = this.step === 1 ? w / 2 : this.step === 2 ? w * 0.26 : w * 0.3;

    // support bar
    ctx.beginPath();
    ctx.moveTo(this.step === 3 ? w * 0.12 : px - 40, pivotY);
    ctx.lineTo(this.step === 3 ? w * 0.88 : px + 40, pivotY);
    glowStroke(ctx, C.dim, 3);

    if (this.step === 3) {
      this.swing(w * 0.3, pivotY, sc, theta, 8, C.cyan);
      this.swing(w * 0.7, pivotY, sc, theta, 19, C.amber);
    } else {
      this.swing(px, pivotY, sc, theta, 12, C.white);
    }

    if (this.step === 2) {
      this.trace.push({t: this.time, a: theta});
      while (this.trace.length && this.time - this.trace[0].t > WINDOW) this.trace.shift();
      const gx0 = w * 0.5;
      const gx1 = w - 14;
      const gy = h * 0.42;
      const ga = h * 0.28;
      const pxPerS = (gx1 - gx0) / WINDOW;
      ctx.beginPath();
      ctx.moveTo(gx0, gy);
      ctx.lineTo(gx1, gy);
      glowStroke(ctx, C.faint, 1.5);
      ctx.beginPath();
      this.trace.forEach((p, i) => {
        const x = gx1 - (this.time - p.t) * pxPerS;
        const y = gy - (p.a / THETA0) * ga;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      glowStroke(ctx, C.cyan, 3);
      // one-period bracket
      const by = gy + ga + 22;
      const bw = Math.min(T * pxPerS, gx1 - gx0);
      ctx.beginPath();
      ctx.moveTo(gx1 - bw, by);
      ctx.lineTo(gx1, by);
      ctx.moveTo(gx1 - bw, by - 6);
      ctx.lineTo(gx1 - bw, by + 6);
      ctx.moveTo(gx1, by - 6);
      ctx.lineTo(gx1, by + 6);
      glowStroke(ctx, C.amber, 2.5);
    }

    const out: Readout[] = [
      {label: 'Length L', value: `${fmt(this.len, 1)} m`},
      {label: 'Period T', value: `${fmt(T, 2)} s`},
      {label: 'Frequency', value: `${fmt(1 / T, 2)} Hz`},
    ];
    if (this.step === 2) out.push({label: 'T vs L = 1 m', value: `x${fmt(Math.sqrt(this.len), 2)}`});
    if (this.step === 3) {
      out.push({label: 'Mass A / B', value: '0.1 / 0.5 kg'});
      out.push({label: 'Period A = B', value: `${fmt(T, 2)} s`});
    }
    return out;
  }
}
