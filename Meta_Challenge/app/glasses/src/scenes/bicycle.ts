import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, dashed, dot, fmt, glowStroke, solid} from './util';

const NF = 44; // front chainring teeth
const WHEEL_CIRC = 2.1; // m
const CADENCE = 90; // rpm for the speed readout
const TAU = Math.PI * 2;

export class BicycleScene implements Scene {
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private nr = 20;
  private thetaF = 0; // radians turned by the pedals
  private revF = 0;

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
    this.revF = 0;
  }
  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') {
      this.nr = clamp(this.nr + dir, 11, 34);
      this.revF = 0;
    }
  }
  param(): number {
    return this.nr;
  }
  dispose(): void {}

  private gear(cx: number, cy: number, r: number, teeth: number, theta: number, color: string): void {
    const {ctx} = this;
    const tip = r + 4;
    const root = r - 4;
    ctx.beginPath();
    const n = teeth * 4;
    for (let i = 0; i < n; i++) {
      const rad = i % 4 === 1 || i % 4 === 2 ? tip : root;
      const a = theta + (i / n) * TAU;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    glowStroke(ctx, color, 2);
    // reference spoke so rotation reads clearly
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(theta) * (r - 6), cy + Math.sin(theta) * (r - 6));
    glowStroke(ctx, C.white, 3);
    dot(ctx, cx, cy, 4, color);
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    clear(ctx, w, h);
    const ratio = NF / this.nr;
    const dTheta = dt * (TAU / 2.4);
    this.thetaF += dTheta;
    this.revF += dTheta / TAU;
    const thetaR = this.thetaF * ratio;

    const rf = Math.min(80, h * 0.3);
    const rr = (rf * this.nr) / NF;
    const cy = this.step === 3 ? h * 0.4 : h * 0.5;
    const cf = {x: 24 + rf + 8, y: cy};
    const cr = {x: w - 24 - rf * 0.8 - 8, y: cy};
    const d = cr.x - cf.x;
    const sinP = (rf - rr) / d;
    const cosP = Math.sqrt(1 - sinP * sinP);
    const at = Math.atan2(-cosP, sinP);
    const ab = Math.atan2(cosP, sinP);

    // chain: one closed path, dashes spaced at the tooth pitch and moving at chain speed
    const pitch = (TAU * rf) / NF;
    ctx.beginPath();
    ctx.moveTo(cf.x + rf * Math.cos(at), cf.y + rf * Math.sin(at));
    ctx.lineTo(cr.x + rr * Math.cos(at), cr.y + rr * Math.sin(at));
    ctx.arc(cr.x, cr.y, rr, at, ab, false);
    ctx.lineTo(cf.x + rf * Math.cos(ab), cf.y + rf * Math.sin(ab));
    ctx.arc(cf.x, cf.y, rf, ab, at + TAU, false);
    dashed(ctx, pitch * 0.6, pitch * 0.4);
    ctx.lineDashOffset = -(this.thetaF * rf);
    glowStroke(ctx, C.amber, 3);
    solid(ctx);
    ctx.lineDashOffset = 0;

    this.gear(cf.x, cf.y, rf - 6, NF, this.thetaF, C.cyan);
    this.gear(cr.x, cr.y, Math.max(rr - 6, 8), this.nr, thetaR, C.green);

    // crank arm + pedal
    const px = cf.x + Math.cos(this.thetaF) * rf * 0.55;
    const py = cf.y + Math.sin(this.thetaF) * rf * 0.55;
    dot(ctx, px, py, 5, C.pink);

    const speedKmh = ratio * (CADENCE / 60) * WHEEL_CIRC * 3.6;
    const rel = 1 / ratio;

    if (this.step === 3) {
      const x0 = 30;
      const maxW = w - 60;
      const bar = (y: number, frac: number, color: string): void => {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + maxW, y);
        glowStroke(ctx, C.faint, 6);
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + maxW * clamp(frac, 0.02, 1), y);
        glowStroke(ctx, color, 6);
      };
      bar(h - 40, speedKmh / 50, C.cyan);
      bar(h - 18, rel * (NF / 34), C.amber);
    }

    if (this.step === 2) {
      return [
        {label: 'Gears', value: `${NF}:${this.nr}`},
        {label: 'Pedal turns', value: fmt(this.revF, 1)},
        {label: 'Wheel turns', value: fmt(this.revF * ratio, 1)},
      ];
    }
    if (this.step === 3) {
      return [
        {label: 'Gears', value: `${NF}:${this.nr}`},
        {label: `Speed (${CADENCE} rpm)`, value: `${fmt(speedKmh, 0)} km/h`},
        {label: 'Push vs 1:1', value: `x${fmt(rel, 2)}`},
      ];
    }
    return [
      {label: 'Gears', value: `${NF}:${this.nr}`},
      {label: 'Gear ratio', value: fmt(ratio, 2)},
    ];
  }
}
