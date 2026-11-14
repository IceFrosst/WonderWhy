import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, dot, fmt, glowStroke} from './util';

const L0 = 0.648; // open string length, m (guitar scale length)
const MU = 0.0063; // kg/m, low E string
const T0 = 72; // N
const SLOW = 20; // visual slow-down so 30 fps can show the motion

export class GuitarScene implements Scene {
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private fret = 0;
  private tension = T0;
  private phase = 0;

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
  }
  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') this.fret = clamp(this.fret + dir, 0, 12);
    else this.tension = clamp(this.tension + dir * 6, 30, 120);
  }
  param(): number {
    return this.fret;
  }
  dispose(): void {}

  private length(): number {
    return L0 / Math.pow(2, this.fret / 12);
  }
  private freq(): number {
    return Math.sqrt(this.tension / MU) / (2 * this.length());
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    clear(ctx, w, h);
    const f1 = this.freq();
    this.phase += dt * 2 * Math.PI * (f1 / SLOW);

    const x0 = 28; // nut
    const x1 = w - 28; // bridge
    const span = x1 - x0;
    const xf = x0 + span * (1 - 1 / Math.pow(2, this.fret / 12)); // fret position
    const rows = this.step === 2 ? 3 : 1;
    const rowH = h / rows;
    const amp = Math.min(rowH * 0.32, 46);

    // frets (static)
    for (let n = 1; n <= 12; n++) {
      const fx = x0 + span * (1 - 1 / Math.pow(2, n / 12));
      ctx.beginPath();
      ctx.moveTo(fx, 6);
      ctx.lineTo(fx, h - 6);
      glowStroke(ctx, n === this.fret ? C.amber : C.faint, n === this.fret ? 3 : 1.5, n === this.fret ? 0.9 : 1);
    }

    for (let r = 0; r < rows; r++) {
      const cy = rowH * (r + 0.5);
      const mode = r + 1;
      const a = amp / (this.step === 2 ? 1 : 1);
      // dead part (nut to fret) stays flat and dim
      if (xf > x0) {
        ctx.beginPath();
        ctx.moveTo(x0, cy);
        ctx.lineTo(xf, cy);
        glowStroke(ctx, C.dim, 2);
      }
      // vibrating part
      const len = x1 - xf;
      ctx.beginPath();
      const n = 64;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const y = cy - a * Math.sin(mode * Math.PI * u) * Math.cos(this.phase * mode);
        const x = xf + len * u;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      glowStroke(ctx, r === 0 ? C.cyan : r === 1 ? C.green : C.pink, 3);
      // nodes
      for (let k = 0; k <= mode; k++) dot(ctx, xf + (len * k) / mode, cy, 4, C.white);
    }

    const L = this.length();
    if (this.step === 3) {
      return [
        {label: 'Tension T', value: `${Math.round(this.tension)} N`},
        {label: 'Length L', value: `${fmt(L * 100, 1)} cm`},
        {label: 'Frequency', value: `${fmt(f1, 1)} Hz`},
      ];
    }
    if (this.step === 2) {
      return [
        {label: 'Fret', value: String(this.fret)},
        {label: 'f', value: `${fmt(f1, 1)} Hz`},
        {label: '2f / 3f', value: `${fmt(f1 * 2, 1)} / ${fmt(f1 * 3, 1)} Hz`},
      ];
    }
    return [
      {label: 'Fret', value: String(this.fret)},
      {label: 'Length L', value: `${fmt(L * 100, 1)} cm`},
      {label: 'Frequency', value: `${fmt(f1, 1)} Hz`},
    ];
  }
}
