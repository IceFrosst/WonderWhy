import type {ZoomSpec} from './specs/types';
import type {Readout, Scene, Step} from './types';
import {C, arrow, clamp, clear, dot, glowStroke} from './util';

interface Point {
  x: number;
  y: number;
}

interface Grain {
  points: Point[];
  angle: number;
}

interface Electron {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

const TRANSITION_SECONDS = 0.7;
const PI2 = Math.PI * 2;

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const ease = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

const wrapUnit = (value: number): number => ((value + 1) % 2 + 2) % 2 - 1;

export class ZoomScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private fontFamily = 'system-ui';
  private fontSize = 16;
  private cx = 0;
  private cy = 0;
  private radius = 1;
  private scaleY = 1;
  private grains: Grain[] = [];
  private electrons: Electron[] = [];
  private latticeAtomTarget: Point = {x: 0, y: 0};
  private latticeElectronTarget: Point = {x: 0, y: 0};
  private stepIndex = 0;
  private fromLevel: number;
  private targetLevel: number;
  private fromHeat = false;
  private transitionElapsed = TRANSITION_SECONDS;
  private direction: -1 | 1 = 1;
  private clock = 0;
  private heatClock = 0;

  constructor(private spec: ZoomSpec) {
    this.fromLevel = spec.steps[0].level;
    this.targetLevel = spec.steps[0].level;
  }

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
    this.resize(w, h);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.fontSize = clamp(this.h * 0.06, 16, 20);
    const topBand = this.fontSize + 9;
    const bottomBand = this.fontSize * 2 + 12;
    this.radius = Math.max(28, Math.min(this.w * 0.42, (this.h - topBand - bottomBand) / 2));
    this.cx = this.w / 2;
    this.cy = topBand + this.radius;
    this.scaleY = this.cy + this.radius + 11;
    this.buildGrains();
    this.buildElectrons();
  }

  setParam(_axis: 'x' | 'y', _dir: -1 | 1): void {}

  setStep(step: Step): void {
    const next = Number.isFinite(step) ? clamp(Math.round(step) - 1, 0, this.spec.steps.length - 1) : 0;
    const previous = this.spec.steps[this.stepIndex];
    const nextState = this.spec.steps[next];
    const oldLevel = this.targetLevel;
    this.stepIndex = next;
    this.heatClock = 0;
    if (nextState.level !== oldLevel) {
      this.fromLevel = oldLevel;
      this.targetLevel = nextState.level;
      this.fromHeat = previous.heat;
      this.direction = nextState.level > oldLevel ? 1 : -1;
      this.transitionElapsed = 0;
    } else {
      this.fromLevel = nextState.level;
      this.targetLevel = nextState.level;
      this.fromHeat = nextState.heat;
      this.transitionElapsed = TRANSITION_SECONDS;
    }
  }

  param(): number {
    return this.targetLevel;
  }

  dispose(): void {
    this.ctx = null;
    this.grains = [];
    this.electrons = [];
  }

  private buildGrains(): void {
    const random = rng(2903);
    const cols = 4;
    const rows = 4;
    const half = this.radius * 0.68;
    const nodes: Point[][] = [];
    for (let row = 0; row <= rows; row++) {
      const line: Point[] = [];
      for (let col = 0; col <= cols; col++) {
        const baseX = this.cx - half + (half * 2 * col) / cols;
        const baseY = this.cy - half + (half * 2 * row) / rows;
        const jitter = half / cols * 0.72;
        line.push({
          x: baseX + (col === 0 || col === cols ? 0 : (random() - 0.5) * jitter),
          y: baseY + (row === 0 || row === rows ? 0 : (random() - 0.5) * jitter),
        });
      }
      nodes.push(line);
    }
    this.grains = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.grains.push({
          points: [nodes[row][col], nodes[row][col + 1], nodes[row + 1][col + 1], nodes[row + 1][col]],
          angle: random() * Math.PI,
        });
      }
    }
  }

  private buildElectrons(): void {
    const random = rng(811);
    this.electrons = Array.from({length: 18}, () => {
      const angle = random() * PI2;
      const speed = 0.035 + random() * 0.035;
      return {
        x: random() * 1.7 - 0.85,
        y: random() * 1.45 - 0.725,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: random() * PI2,
      };
    });
  }

  private lensPath(): void {
    const ctx = this.ctx!;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, this.radius, 0, PI2);
  }

  private fittedText(text: string, maxWidth: number): string {
    const ctx = this.ctx!;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let value = text;
    while (value.length > 1 && ctx.measureText(`${value}\u2026`).width > maxWidth) value = value.slice(0, -1).trimEnd();
    return `${value}\u2026`;
  }

  private drawFrame(): void {
    const ctx = this.ctx!;
    const level = this.spec.levels[this.targetLevel];
    ctx.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.white;
    ctx.fillText(this.fittedText(level.label, this.w - 12), this.cx, this.fontSize + 2);

    this.lensPath();
    glowStroke(ctx, C.white, 2.2);

    if (level.times) {
      ctx.font = `600 ${this.fontSize}px ${this.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillStyle = C.soft;
      const text = this.fittedText(level.times, this.radius * 1.05);
      ctx.fillText(text, this.cx + this.radius - 10, this.cy - this.radius + this.fontSize + 7);
    }

    const barWidth = clamp(this.radius * 0.55, 42, 92);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.cx - barWidth / 2, this.scaleY);
    ctx.lineTo(this.cx + barWidth / 2, this.scaleY);
    ctx.moveTo(this.cx - barWidth / 2, this.scaleY - 4);
    ctx.lineTo(this.cx - barWidth / 2, this.scaleY + 4);
    ctx.moveTo(this.cx + barWidth / 2, this.scaleY - 4);
    ctx.lineTo(this.cx + barWidth / 2, this.scaleY + 4);
    ctx.stroke();
    ctx.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.soft;
    ctx.fillText(this.fittedText(level.scale, this.w - 12), this.cx, Math.min(this.h - 2, this.scaleY + this.fontSize + 4));
  }

  private drawSpoon(): void {
    const ctx = this.ctx!;
    const r = this.radius;
    const alpha = ctx.globalAlpha;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(-0.42);
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, -r * 0.11);
    ctx.bezierCurveTo(-r * 0.3, -r * 0.55, -r * 0.68, -r * 0.46, -r * 0.7, -r * 0.08);
    ctx.bezierCurveTo(-r * 0.7, r * 0.3, -r * 0.32, r * 0.43, -r * 0.12, r * 0.09);
    ctx.lineTo(r * 0.64, r * 0.055);
    ctx.quadraticCurveTo(r * 0.77, 0, r * 0.64, -r * 0.055);
    ctx.closePath();
    glowStroke(ctx, C.white, 2.4);
    ctx.beginPath();
    ctx.ellipse(-r * 0.42, -r * 0.06, r * 0.19, r * 0.27, 0, Math.PI * 1.08, Math.PI * 1.83);
    ctx.strokeStyle = C.soft;
    ctx.globalAlpha = alpha * 0.72;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  private drawGeneric(): void {
    const ctx = this.ctx!;
    const alpha = ctx.globalAlpha;
    const width = this.radius * 1.25;
    const height = this.radius * 0.72;
    const x = this.cx - width / 2;
    const y = this.cy - height / 2;
    const corner = this.radius * 0.16;
    ctx.beginPath();
    ctx.moveTo(x + corner, y);
    ctx.lineTo(x + width - corner, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + corner);
    ctx.lineTo(x + width, y + height - corner);
    ctx.quadraticCurveTo(x + width, y + height, x + width - corner, y + height);
    ctx.lineTo(x + corner, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - corner);
    ctx.lineTo(x, y + corner);
    ctx.quadraticCurveTo(x, y, x + corner, y);
    glowStroke(ctx, C.white, 2.4);
    ctx.beginPath();
    ctx.moveTo(x + corner * 1.1, y + corner * 0.85);
    ctx.lineTo(x + width * 0.66, y + corner * 0.85);
    ctx.strokeStyle = C.soft;
    ctx.globalAlpha = alpha * 0.7;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  private grainPath(grain: Grain): void {
    const ctx = this.ctx!;
    ctx.beginPath();
    grain.points.forEach((point, index) => {
      if (index) ctx.lineTo(point.x, point.y);
      else ctx.moveTo(point.x, point.y);
    });
    ctx.closePath();
  }

  private drawGrains(): void {
    const ctx = this.ctx!;
    const alpha = ctx.globalAlpha;
    for (const grain of this.grains) {
      this.grainPath(grain);
      ctx.strokeStyle = C.soft;
      ctx.globalAlpha = alpha * 0.65;
      ctx.lineWidth = 1.25;
      ctx.stroke();

      const center = grain.points.reduce((sum, point) => ({x: sum.x + point.x, y: sum.y + point.y}), {x: 0, y: 0});
      center.x /= grain.points.length;
      center.y /= grain.points.length;
      ctx.save();
      this.grainPath(grain);
      ctx.clip();
      ctx.translate(center.x, center.y);
      ctx.rotate(grain.angle);
      ctx.strokeStyle = C.faint;
      ctx.globalAlpha = alpha * 0.75;
      ctx.lineWidth = 1;
      const span = this.radius * 0.36;
      for (let line = -1; line <= 1; line++) {
        ctx.beginPath();
        ctx.moveTo(-span, line * 6);
        ctx.lineTo(span, line * 6);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = alpha;
  }

  private leaderLabel(text: string, x: number, y: number, tx: number, ty: number, color: string, align: CanvasTextAlign): void {
    const ctx = this.ctx!;
    const alpha = ctx.globalAlpha;
    ctx.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    const width = ctx.measureText(text).width;
    const left = align === 'left' ? x : x - width;
    const right = align === 'left' ? x + width : x;
    const startX = tx < left ? left - 5 : tx > right ? right + 5 : (left + right) / 2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.75;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(startX, y - this.fontSize * 0.35);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }

  private drawLattice(heat: boolean): void {
    const ctx = this.ctx!;
    const cols = 7;
    const rows = 5;
    const halfW = this.radius * 0.59;
    const halfH = this.radius * 0.4;
    const atomRadius = clamp(this.radius * 0.04, 3.8, 6.5);
    const heatSpec = heat ? this.spec.heat : undefined;
    const heatPhase = this.heatClock % 5;
    const front = Math.min(1, heatPhase / 4);
    let atomTarget = {x: this.cx, y: this.cy};

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const baseX = this.cx - halfW + (halfW * 2 * col) / (cols - 1);
        const baseY = this.cy - halfH + (halfH * 2 * row) / (rows - 1);
        const side = heatSpec?.from === 'right' ? 1 - col / (cols - 1) : col / (cols - 1);
        const warmed = heatSpec ? clamp((front + 0.14 - side) / 0.14, 0, 1) : 0;
        const amplitude = 1.1 + warmed * 5.4;
        const phase = row * 1.91 + col * 2.37;
        const x = baseX + Math.sin(this.clock * (2.2 + warmed * 2.8) + phase) * amplitude;
        const y = baseY + Math.cos(this.clock * (2.45 + warmed * 2.2) + phase * 1.3) * amplitude;
        ctx.beginPath();
        ctx.arc(x, y, atomRadius, 0, PI2);
        if (warmed > 0.15) glowStroke(ctx, C.amber, 1.5 + warmed * 0.8, 0.55 + warmed * 0.45);
        else {
          ctx.strokeStyle = C.white;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        if (row === 1 && col === 1) atomTarget = {x, y};
      }
    }

    let electronTarget = {x: this.cx, y: this.cy};
    this.electrons.forEach((electron, index) => {
      let nx = wrapUnit(electron.x + electron.vx * this.clock + Math.sin(this.clock * 0.5 + electron.phase) * 0.025);
      const ny = wrapUnit(electron.y + electron.vy * this.clock);
      if (heatSpec) {
        const frontX = heatSpec.from === 'left' ? -0.85 + front * 1.7 : 0.85 - front * 1.7;
        const near = clamp(1 - Math.abs(nx - frontX) / 0.32, 0, 1);
        nx = wrapUnit(nx + (heatSpec.from === 'left' ? 1 : -1) * near * heatPhase * 0.055);
      }
      const x = this.cx + nx * halfW;
      const y = this.cy + ny * halfH;
      dot(ctx, x, y, 1.7, C.cyan);
      if (index === 2) electronTarget = {x, y};
    });

    this.latticeAtomTarget = atomTarget;
    this.latticeElectronTarget = electronTarget;
  }

  private drawLatticeLabels(alpha: number): void {
    const ctx = this.ctx!;
    ctx.save();
    ctx.globalAlpha = alpha;
    this.leaderLabel(
      'atom',
      this.cx - this.radius - 10,
      this.cy - this.radius * 0.36,
      this.latticeAtomTarget.x,
      this.latticeAtomTarget.y,
      C.soft,
      'right',
    );
    this.leaderLabel(
      'electron',
      this.cx + this.radius + 10,
      this.cy + this.radius * 0.28,
      this.latticeElectronTarget.x,
      this.latticeElectronTarget.y,
      C.cyan,
      'left',
    );
    ctx.restore();
  }

  private drawHeatMark(levelIndex: number): void {
    const heat = this.spec.heat;
    if (!heat) return;
    const ctx = this.ctx!;
    const alpha = ctx.globalAlpha;
    const fromLeft = heat.from === 'left';
    const y = this.cy + this.radius * 0.72;
    const x0 = this.cx + (fromLeft ? -0.7 : 0.7) * this.radius;
    const x1 = this.cx + (fromLeft ? -0.12 : 0.12) * this.radius;
    arrow(ctx, x0, y, x1, y, C.amber, 2.2);
    ctx.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.amber;
    ctx.fillText(this.fittedText(heat.label, this.radius * 0.8), (x0 + x1) / 2, y - 8);

    if (this.spec.levels[levelIndex].draw !== 'lattice') {
      const gradient = ctx.createLinearGradient(this.cx - this.radius, this.cy, this.cx + this.radius, this.cy);
      if (fromLeft) {
        gradient.addColorStop(0, C.amber);
        gradient.addColorStop(1, 'rgba(255,194,71,0)');
      } else {
        gradient.addColorStop(0, 'rgba(255,194,71,0)');
        gradient.addColorStop(1, C.amber);
      }
      this.lensPath();
      ctx.strokeStyle = gradient;
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }
  }

  private drawLevel(levelIndex: number, heat: boolean, alpha = 1): void {
    const ctx = this.ctx!;
    const level = this.spec.levels[levelIndex];
    ctx.save();
    this.lensPath();
    ctx.clip();
    ctx.globalAlpha = alpha;
    if (level.draw === 'outline') {
      if (level.shape === 'spoon') this.drawSpoon();
      else this.drawGeneric();
    } else if (level.draw === 'grains') this.drawGrains();
    else this.drawLattice(heat);
    if (heat && this.spec.heat) this.drawHeatMark(levelIndex);
    ctx.restore();
  }

  private drawTransition(): void {
    const ctx = this.ctx!;
    const targetHeat = this.spec.steps[this.stepIndex].heat;
    const progress = ease(this.transitionElapsed / TRANSITION_SECONDS);
    const small = Math.max(12, this.radius * 0.12);
    if (this.direction > 0) {
      this.drawLevel(this.fromLevel, this.fromHeat);
      const ring = small + (this.radius - small) * progress;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ring, 0, PI2);
      ctx.clip();
      this.drawLevel(this.targetLevel, targetHeat, progress);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ring, 0, PI2);
      glowStroke(ctx, C.white, 1.6, 0.85);
    } else {
      this.drawLevel(this.targetLevel, targetHeat, progress);
      const ring = this.radius + (small - this.radius) * progress;
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ring, 0, PI2);
      ctx.clip();
      this.drawLevel(this.fromLevel, this.fromHeat, 1 - progress * 0.35);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, ring, 0, PI2);
      glowStroke(ctx, C.white, 1.6, 0.85);
    }
  }

  frame(dt: number): Readout[] {
    const ctx = this.ctx;
    const level = this.spec.levels[this.targetLevel];
    const readouts: Readout[] = [{label: 'Scale', value: level.scale}];
    if (level.times) readouts.push({label: 'Zoom', value: level.times});
    if (!ctx) return readouts;

    const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    this.clock = (this.clock + delta) % 1000;
    this.heatClock = (this.heatClock + delta) % 1000;
    this.transitionElapsed = Math.min(TRANSITION_SECONDS, this.transitionElapsed + delta);
    clear(ctx, this.w, this.h);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (this.transitionElapsed < TRANSITION_SECONDS) this.drawTransition();
    else this.drawLevel(this.targetLevel, this.spec.steps[this.stepIndex].heat);
    if (level.draw === 'lattice') {
      const labelAlpha = this.transitionElapsed < TRANSITION_SECONDS
        ? ease(this.transitionElapsed / TRANSITION_SECONDS)
        : 1;
      this.drawLatticeLabels(labelAlpha);
    }
    this.drawFrame();
    ctx.restore();
    return readouts;
  }
}
