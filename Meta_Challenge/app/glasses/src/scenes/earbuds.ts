import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, dot, glowStroke} from './util';

/**
 * Active noise cancelling. Step 1: the noise wave reaches the ear. Step 2: the outer microphone hears it
 * and the earbud plays the same wave flipped. Step 3: the two add up to an almost flat line (silence),
 * except for the fast, voice-like part the earbud cannot follow in time. Left/right sets how well the
 * anti-noise matches (timing), so the viewer can see why a late or weak flip leaves noise.
 */
const SLOW = 1.4; // visual speed of the travelling wave

export class EarbudsScene implements Scene {
  private ctx!: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private t = 0;
  /** How well the anti-noise matches, 0..100 %. */
  private match = 96;

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
    if (axis === 'x') this.match = clamp(this.match + dir * 8, 0, 100);
  }
  param(): number {
    return this.match;
  }
  dispose(): void {}

  /** The noise: a low hum plus a smaller, faster voice-like ripple. u = position 0..1. */
  private noise(u: number): {low: number; high: number} {
    const k = u * 6 - this.t * SLOW;
    const low = Math.sin(2 * Math.PI * k * 0.55) * 0.7 + Math.sin(2 * Math.PI * k * 0.9 + 1.3) * 0.3;
    const high = Math.sin(2 * Math.PI * k * 4.1 + 0.4) * 0.22;
    return {low, high};
  }

  private wave(cy: number, amp: number, x0: number, x1: number, f: (u: number) => number, color: string, width = 3): void {
    const {ctx} = this;
    ctx.beginPath();
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = x0 + (x1 - x0) * u;
      const y = cy - amp * f(u);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    glowStroke(ctx, color, width);
  }

  private earbud(x: number, y: number, r: number): void {
    const {ctx} = this;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    glowStroke(ctx, C.white, 2.5);
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.lineTo(x, y + r * 2.6);
    glowStroke(ctx, C.white, 2.5);
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    clear(ctx, w, h);
    this.t += dt;
    const x0 = 24;
    const x1 = w - 70;
    const m = this.match / 100;
    // A late or weak flip: scale and a small phase lag grow as the match drops.
    const lag = (1 - m) * 0.25;
    const anti = (u: number): number => {
      const n = this.noise(u - lag / 6);
      return -(n.low + n.high) * m; // the same wave, flipped (a late or weak flip leaves some noise)
    };
    const total = (u: number): number => {
      const n = this.noise(u);
      return n.low + n.high + anti(u);
    };
    const noiseF = (u: number): number => {
      const n = this.noise(u);
      return n.low + n.high;
    };

    // the ear and earbud on the right
    const bx = w - 42;
    this.earbud(bx, h * 0.5 - 18, 14);

    if (this.step === 1) {
      const amp = Math.min(h * 0.3, 80);
      this.wave(h * 0.5, amp, x0, x1, noiseF, C.hot, 3.5);
      dot(ctx, bx - 24, h * 0.5, 4, C.hot);
      return [
        {label: 'Noise', value: 'reaches your ear'},
        {label: 'Low hum', value: 'big, slow waves'},
      ];
    }

    const rows = 3;
    const rowH = h / rows;
    const amp = Math.min(rowH * 0.32, 44);
    // row 1: noise
    this.wave(rowH * 0.5, amp, x0, x1, noiseF, C.hot, 3);
    // row 2: anti-noise, the same wave flipped
    this.wave(rowH * 1.5, amp, x0, x1, anti, C.cyan, 3);
    // row 3 (step 3): the sum
    if (this.step >= 3) {
      this.wave(rowH * 2.5, amp, x0, x1, total, C.green, 3.5);
    } else {
      ctx.beginPath();
      ctx.moveTo(x0, rowH * 2.5);
      ctx.lineTo(x1, rowH * 2.5);
      glowStroke(ctx, C.faint, 1.5);
    }
    // the outer microphone (step 2+): a small dot on the noise row near the earbud
    dot(ctx, x1 + 10, rowH * 0.5, 4, C.amber);
    const left = Math.round(Math.abs(1 - m) * 100);
    if (this.step >= 3) {
      return [
        {label: 'Sum', value: m > 0.9 ? 'almost silence' : 'noise left'},
        {label: 'Match', value: `${Math.round(this.match)} %`},
        {label: 'Hum left', value: `${left} %`},
      ];
    }
    return [
      {label: 'Mic', value: 'hears noise'},
      {label: 'Speaker', value: 'flips it'},
      {label: 'Match', value: `${Math.round(this.match)} %`},
    ];
  }
}
