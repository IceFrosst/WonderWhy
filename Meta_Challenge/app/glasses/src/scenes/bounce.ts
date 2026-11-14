import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, glowStroke} from './util';

const G = 9.81;
const TIME_SCALE = 0.6;
const MAX_BOUNCES = 12;
const PEAK_DASH = [2, 6];
const SOLID: number[] = [];
const ENERGY_COLORS = [C.amber, C.cyan, C.hot];
const ENERGY_LABELS = ['height', 'motion', 'lost'];
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
          // Hold contact long enough for squash to read at the 30 fps display cap.
          this.duration = 0.08 + 0.08 * this.preset.squashiness;
        }
      } else {
        this.contact = clamp(this.time / this.duration, 0, 1);
        // Store the impact energy at full compression, then dissipate a smooth
        // (1 - e^2) fraction as the spring releases. The tiny terminal residue
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

  projectedPeak(index: number): number {
    return this.drop * Math.pow(this.preset.e * this.preset.e, index);
  }

  visualPosition(trailCount: number): {index: number; progress: number} {
    if (this.phase === 'rest') return {index: trailCount - 1, progress: 1};
    if (this.phase === 'contact') return {index: clamp(this.bounces - 1, 0, trailCount - 1), progress: 1};
    if (this.bounces === 0) {
      return {index: 0, progress: 0.5 + 0.5 * clamp(this.time / this.duration, 0, 1)};
    }
    return {
      index: clamp(this.bounces, 0, trailCount - 1),
      progress: clamp(this.time / this.duration, 0, 1),
    };
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
  private readouts: Readout[] = [];
  private fontFamily = 'system-ui';

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
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
        drop,
        {label: 'Movement', value: '0%'},
        {label: 'Lost to heat', value: '0%'},
      ];
    } else if (this.step === 3) {
      this.readouts = [
        ball,
        {label: 'e', value: preset.e.toFixed(2)},
        {label: `${comparison.name.split(' /')[0]} e`, value: comparison.e.toFixed(2)},
      ];
    } else {
      this.readouts = [drop, ball, {label: 'Keeps', value: PERCENT[Math.round(preset.e * preset.e * 100)]}];
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
    const radius = Math.min(w * 0.04, h * 0.1);
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
      this.drawBall(this.left, w * 0.27, w * 0.4, ground, radius, scale, PRESETS[this.selected].name);
      this.drawBall(
        this.right,
        w * 0.73,
        w * 0.4,
        ground,
        radius,
        scale,
        PRESETS[this.selected === PRESETS.length - 1 ? 0 : PRESETS.length - 1].name,
      );
    } else {
      this.drawBall(
        this.left,
        w * (this.step === 2 ? 0.34 : 0.5),
        w * (this.step === 2 ? 0.58 : 0.86),
        ground,
        radius,
        scale,
        PRESETS[this.selected].name,
      );
    }
    if (this.step === 2) {
      this.left.energies(this.energy);
      this.drawEnergy(ground);
      this.updateEnergyReadouts();
    }
    return this.readouts;
  }

  private drawBall(
    ball: BouncingBall,
    x: number,
    laneWidth: number,
    ground: number,
    radius: number,
    scale: number,
    label: string,
  ): void {
    const ctx = this.ctx!;
    const trailCount = 4;
    const laneLeft = x - laneWidth * 0.5;
    const span = laneWidth / trailCount;
    ctx.font = `600 16px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.soft;
    ctx.fillText(label, x, 2);

    // A dotted bounce path makes the shrinking sequence readable even in a still.
    ctx.fillStyle = C.cyan;
    for (let index = 0; index < trailCount; index++) {
      const peak = ball.projectedPeak(index);
      if (peak < 0.015) break;
      for (let dotIndex = 0; dotIndex <= 12; dotIndex++) {
        const t = dotIndex / 12;
        const dotX = laneLeft + (index + t) * span;
        const dotY = ground - radius - peak * scale * 4 * t * (1 - t);
        ctx.globalAlpha = 0.12 + (1 - index / trailCount) * 0.12;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Peak guides and direct height labels name the first three diminishing arcs.
    for (let index = 0; index < trailCount; index++) {
      const peak = ball.projectedPeak(index);
      if (peak < 0.015) break;
      const peakX = laneLeft + (index + 0.5) * span;
      const peakY = ground - radius - peak * scale;
      ctx.setLineDash(PEAK_DASH);
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(peakX - span * 0.34, peakY);
      ctx.lineTo(peakX + span * 0.34, peakY);
      ctx.stroke();
      if (index < 3) {
        const height = `${peak.toFixed(2)} m`;
        const textWidth = ctx.measureText(height).width;
        const textX = clamp(peakX, laneLeft + textWidth / 2, laneLeft + laneWidth - textWidth / 2);
        // Above the ball's top at its peak, so the ball never covers its own height label.
        const textY = clamp(peakY - radius - 20, 22, ground - 24);
        ctx.fillStyle = C.soft;
        ctx.fillText(height, textX, textY);
      }
    }
    ctx.setLineDash(SOLID);

    let rx = radius;
    let ry = radius;
    if (ball.phase === 'contact') {
      const squash = Math.min(0.45, ball.impactSpeed * ball.preset.squashiness * 0.1)
        * Math.sin(Math.PI * ball.contact);
      ry *= 1 - squash;
      rx /= 1 - squash;
    } else if (ball.phase === 'flight') {
      const stretch = Math.min(0.08, Math.abs(ball.velocity) * 0.012);
      ry *= 1 + stretch;
      rx /= 1 + stretch;
    }
    const visual = ball.visualPosition(trailCount);
    const ballX = laneLeft + (visual.index + visual.progress) * span;
    // Bottom stays on the floor during contact; stretched flight never clips it.
    const y = ground - ry - ball.height * scale;
    ctx.beginPath();
    ctx.ellipse(ballX, y, rx, ry, 0, 0, Math.PI * 2);
    glowStroke(ctx, C.cyan, 3);
  }

  private drawEnergy(ground: number): void {
    const ctx = this.ctx!;
    const x = this.w * 0.72;
    const width = clamp(this.w * 0.055, 26, 34);
    const height = this.h * 0.66;
    const initial = G * this.drop;
    const values = [this.energy[0] + this.energy[2], this.energy[1], this.energy[3]];
    const segments: Array<{actualY: number; color: string; label: string; desiredY: number}> = [];
    const top = ground - height;

    ctx.font = `600 18px ${this.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = C.white;
    ctx.fillText('energy', x, top - 8);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.dim;
    ctx.strokeRect(x, ground - height, width, height);
    let bottom = ground;
    for (let index = 0; index < values.length; index++) {
      const segment = clamp(values[index] / initial, 0, 1) * height;
      const segmentTop = bottom - segment;
      if (segment > 0.5) {
        ctx.fillStyle = ENERGY_COLORS[index];
        ctx.globalAlpha = 0.14;
        ctx.fillRect(x, segmentTop, width, segment);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ENERGY_COLORS[index];
        ctx.strokeRect(x, segmentTop, width, segment);
      }
      const actualY = segment > 1 ? segmentTop + segment / 2 : bottom;
      segments.push({actualY, color: ENERGY_COLORS[index], label: ENERGY_LABELS[index], desiredY: actualY});
      bottom = segmentTop;
    }

    const ordered = [...segments].sort((a, b) => a.desiredY - b.desiredY);
    const minLabelY = top + 10;
    const maxLabelY = ground - 10;
    ordered.forEach((segment, index) => {
      segment.desiredY = clamp(segment.desiredY, minLabelY, maxLabelY);
      if (index > 0) segment.desiredY = Math.max(segment.desiredY, ordered[index - 1].desiredY + 20);
    });
    const overflow = Math.max(0, ordered[ordered.length - 1].desiredY - maxLabelY);
    if (overflow) ordered.forEach(segment => { segment.desiredY -= overflow; });

    ctx.font = `600 16px ${this.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const segment of segments) {
      ctx.strokeStyle = segment.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + width, segment.actualY);
      ctx.lineTo(x + width + 7, segment.desiredY);
      ctx.stroke();
      ctx.fillStyle = segment.color;
      ctx.fillText(segment.label, x + width + 10, segment.desiredY);
    }
  }

  private updateEnergyReadouts(): void {
    const initial = G * this.drop;
    const movement = PERCENT[Math.round(clamp(this.energy[1] / initial, 0, 1) * 100)];
    const lost = PERCENT[Math.round(clamp(this.energy[3] / initial, 0, 1) * 100)];
    if (this.readouts[1].value === movement && this.readouts[2].value === lost) return;
    this.readouts = [
      this.readouts[0],
      {label: 'Movement', value: movement},
      {label: 'Lost to heat', value: lost},
    ];
  }
}
