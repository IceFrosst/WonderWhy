import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, glowStroke} from './util';

const G = 9.81;
const TIME_SCALE = 0.6;
const MAX_BOUNCES = 12;
const PEAK_DASH = [2, 6];
const SOLID: number[] = [];
const ENERGY_COLORS = [C.cyan, C.amber, C.pink, C.hot];
const PERCENT = Array.from({length: 101}, (_, i) => `${i}%`);

interface Preset {
  name: string;
  e: number;
  squashiness: number;
}

const PRESETS: readonly Preset[] = [
  {name: 'Super ball', e: 0.90, squashiness: 0.3},
  {name: 'Basketball', e: 0.80, squashiness: 0.5},
  {name: 'Tennis ball', e: 0.75, squashiness: 0.6},
  {name: 'Football', e: 0.70, squashiness: 0.7},
  {name: 'Clay / play-dough', e: 0.10, squashiness: 1.0},
];

// Energies are per unit mass (J/kg); dividing by gH gives the same fractions as mgH.
class BouncingBall {
  preset = PRESETS[1];
  phase: 'flight' | 'contact' | 'rest' = 'flight';
  height = 2;
  velocity = 0;
  contact = 0;
  impactSpeed = 0;
  lost = 0;
  readonly peaks = new Float64Array(MAX_BOUNCES + 1);
  peakCount = 0;
  private drop = 2;
  private time = 0;
  private duration = 0;
  private launchHeight = 2;
  private launchSpeed = 0;
  private incomingEnergy = 0;
  private lostBefore = 0;
  private bounces = 0;
  private terminal = false;

  reset(preset: Preset, height: number): void {
    this.preset = preset;
    this.drop = this.height = this.launchHeight = height;
    this.phase = 'flight';
    this.velocity = this.launchSpeed = this.time = this.contact = 0;
    this.impactSpeed = this.incomingEnergy = this.lost = this.lostBefore = 0;
    this.bounces = 0;
    this.terminal = false;
    this.duration = Math.sqrt(2 * height / G);
    this.peaks.fill(0);
    this.peaks[0] = height;
    this.peakCount = 1;
  }

  advance(dt: number): void {
    // Consume leftover time across flight/contact boundaries, including short final hops.
    while (dt > 0 && this.phase !== 'rest') {
      const remaining = this.duration - this.time;
      const used = Math.min(dt, remaining);
      this.time += used;
      dt -= used;
      const finished = used >= remaining;
      if (this.phase === 'flight') {
        this.height = Math.max(0, this.launchHeight + this.launchSpeed * this.time - G * this.time * this.time / 2);
        this.velocity = this.launchSpeed - G * this.time;
        if (finished) {
          this.height = 0;
          this.impactSpeed = Math.sqrt(this.launchSpeed * this.launchSpeed + 2 * G * this.launchHeight);
          this.incomingEnergy = this.impactSpeed * this.impactSpeed / 2;
          this.lostBefore = this.lost;
          this.bounces++;
          const nextPeak = this.incomingEnergy * this.preset.e * this.preset.e / G;
          this.terminal = nextPeak < 0.02 * this.drop || this.bounces >= MAX_BOUNCES;
          this.phase = 'contact';
          this.time = this.contact = 0;
          this.duration = 0.04 + 0.04 * this.preset.squashiness;
        }
      } else {
        this.contact = clamp(this.time / this.duration, 0, 1);
        // Store the impact energy at full compression, then dissipate a smooth
        // (1 - e²) fraction as the spring releases. The tiny terminal residue
        // also becomes heat when the ball settles at the display threshold.
        const release = Math.sin(Math.max(0, this.contact - 0.5) * Math.PI);
        const lossFraction = this.terminal ? 1 : 1 - this.preset.e * this.preset.e;
        this.lost = this.lostBefore + this.incomingEnergy * lossFraction * release * release;
        this.velocity = -Math.sqrt(Math.max(0, 2 * (this.incomingEnergy - this.lost + this.lostBefore)))
          * Math.cos(Math.PI * this.contact);
        if (finished) {
          this.time = this.contact = 0;
          if (this.terminal) {
            this.phase = 'rest';
            this.velocity = 0;
            this.lost = G * this.drop;
          } else {
            this.launchHeight = 0;
            this.launchSpeed = this.impactSpeed * this.preset.e;
            this.duration = 2 * this.launchSpeed / G;
            this.velocity = this.launchSpeed;
            this.phase = 'flight';
            this.peaks[this.peakCount++] = this.launchSpeed * this.launchSpeed / (2 * G);
          }
        }
      }
    }
  }

  energies(out: Float64Array): void {
    out[0] = G * this.height;
    out[1] = this.velocity * this.velocity / 2;
    out[2] = this.phase === 'contact'
      ? Math.max(0, this.incomingEnergy - (this.lost - this.lostBefore) - out[1]) : 0;
    out[3] = this.lost;
  }
}

export class BounceScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private step: Step = 1;
  private selected = 1;
  private drop = 2;
  private pause = 0;
  private readonly left = new BouncingBall();
  private readonly right = new BouncingBall();
  private readonly energy = new Float64Array(4);
  private readonly percentages = new Int16Array(4);
  private readouts: Readout[] = [];

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.resize(w, h);
    this.restart();
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') this.selected = clamp(this.selected + dir, 0, PRESETS.length - 1);
    else this.drop = clamp(this.drop + dir * 0.25, 0.5, 3);
    this.restart();
  }

  setStep(step: Step): void {
    this.step = step;
    this.restart();
  }

  param(): number {
    return PRESETS[this.selected].e;
  }

  dispose(): void {
    this.ctx = null;
  }

  private restart(): void {
    const preset = PRESETS[this.selected];
    const comparison = PRESETS[this.selected === PRESETS.length - 1 ? 0 : PRESETS.length - 1];
    this.left.reset(preset, this.drop);
    this.right.reset(comparison, this.drop);
    this.pause = 0;
    const ball = {label: 'Ball', value: preset.name};
    const drop = {label: 'Drop', value: `${this.drop.toFixed(2)} m`};
    if (this.step === 2) {
      this.readouts = [
        {label: 'Height', value: '100%'},
        {label: 'Movement', value: '0%'},
        {label: 'Squash', value: '0%'},
        {label: 'Lost to heat', value: '0%'},
        ball, drop,
      ];
    } else if (this.step === 3) {
      const bounces = Math.min(MAX_BOUNCES, Math.ceil(Math.log(0.02) / (2 * Math.log(preset.e))));
      this.readouts = [
        ball,
        {label: 'e', value: preset.e.toFixed(2)},
        {label: `${comparison.name.split(' /')[0]} e`, value: comparison.e.toFixed(2)},
        {label: 'Bounces to rest', value: String(bounces)},
        drop,
      ];
    } else {
      this.readouts = [ball, {label: 'Keeps', value: PERCENT[Math.round(preset.e * preset.e * 100)]}, drop];
    }
  }

  frame(dt: number): Readout[] {
    const {ctx, w, h} = this;
    if (!ctx) return this.readouts;
    const elapsed = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    const pair = this.step === 3;
    if (this.left.phase === 'rest' && (!pair || this.right.phase === 'rest')) {
      this.pause += elapsed;
      if (this.pause >= 0.8) this.restart();
    } else {
      this.left.advance(elapsed * TIME_SCALE);
      if (pair) this.right.advance(elapsed * TIME_SCALE);
    }

    clear(ctx, w, h);
    const radius = Math.min(w * 0.025, h * 0.047);
    const ground = h * 0.91;
    // A fixed metre scale makes a changed drop height visible, even on a wide canvas.
    const scale = (ground - h * 0.09 - radius * 2) / 3;
    ctx.setLineDash(SOLID);
    ctx.beginPath();
    ctx.moveTo(w * 0.05, ground);
    ctx.lineTo(w * (this.step === 2 ? 0.77 : 0.95), ground);
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (pair) {
      this.drawBall(this.left, w * 0.28, w * 0.34, ground, radius, scale);
      this.drawBall(this.right, w * 0.72, w * 0.34, ground, radius, scale);
    } else {
      this.drawBall(this.left, w * (this.step === 2 ? 0.39 : 0.5), w * 0.52, ground, radius, scale);
    }
    if (this.step === 2) {
      this.left.energies(this.energy);
      this.drawEnergy(ground);
      this.updateEnergyReadouts();
    }
    return this.readouts;
  }

  private drawBall(ball: BouncingBall, x: number, laneWidth: number, ground: number, radius: number, scale: number): void {
    const ctx = this.ctx!;
    ctx.setLineDash(PEAK_DASH);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.dim;
    ctx.beginPath();
    for (let i = 0; i < ball.peakCount; i++) {
      const y = ground - radius - ball.peaks[i] * scale;
      ctx.moveTo(x - laneWidth * 0.4, y);
      ctx.lineTo(x + laneWidth * 0.4, y);
    }
    ctx.stroke();
    ctx.setLineDash(SOLID);

    let rx = radius;
    let ry = radius;
    if (ball.phase === 'contact') {
      const squash = Math.min(0.35, ball.impactSpeed * ball.preset.squashiness * 0.075)
        * Math.sin(Math.PI * ball.contact);
      ry *= 1 - squash;
      rx /= 1 - squash;
    } else if (ball.phase === 'flight') {
      const stretch = Math.min(0.08, Math.abs(ball.velocity) * 0.012);
      ry *= 1 + stretch;
      rx /= 1 + stretch;
    }
    // Bottom stays on the floor during contact; stretched flight never clips it.
    const y = ground - ry - ball.height * scale;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.faint;
    ctx.fill();
    glowStroke(ctx, C.white, 2);
  }

  private drawEnergy(ground: number): void {
    const ctx = this.ctx!;
    const x = this.w * 0.86;
    const width = this.w * 0.055;
    const height = this.h * 0.72;
    const initial = G * this.drop;
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.dim;
    ctx.strokeRect(x, ground - height, width, height);
    let bottom = ground;
    for (let i = 0; i < 4; i++) {
      const segment = clamp(this.energy[i] / initial, 0, 1) * height;
      if (segment <= 0) continue;
      ctx.fillStyle = ENERGY_COLORS[i];
      ctx.globalAlpha = 0.14;
      ctx.fillRect(x, bottom - segment, width, segment);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ENERGY_COLORS[i];
      ctx.strokeRect(x, bottom - segment, width, segment);
      bottom -= segment;
    }
  }

  private updateEnergyReadouts(): void {
    // Largest-remainder rounding keeps the four integer chips summing to 100.
    const initial = G * this.drop;
    let total = 0;
    for (let i = 0; i < 4; i++) {
      this.percentages[i] = Math.floor(clamp(this.energy[i] / initial, 0, 1) * 100);
      total += this.percentages[i];
    }
    while (total < 100) {
      let best = 0;
      for (let i = 1; i < 4; i++) {
        if (this.energy[i] / initial * 100 - this.percentages[i]
          > this.energy[best] / initial * 100 - this.percentages[best]) best = i;
      }
      this.percentages[best]++;
      total++;
    }
    // React needs a fresh snapshot when chips change. Keep existing objects and
    // arrays otherwise; all simulation and drawing buffers are reused.
    let changed = false;
    for (let i = 0; i < 4; i++) {
      const value = PERCENT[this.percentages[i]];
      if (this.readouts[i].value === value) continue;
      if (!changed) this.readouts = this.readouts.slice();
      changed = true;
      this.readouts[i] = {label: this.readouts[i].label, value};
    }
  }
}
