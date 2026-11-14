import type {FlowSpec} from './specs/types';
import type {Readout, Scene, Step} from './types';
import {C, arrow, clamp, clear, dot, glowStroke} from './util';

interface NodePoint {
  x: number;
  y: number;
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let remaining = text.trim();
  while (remaining && lines.length < maxLines) {
    if (ctx.measureText(remaining).width <= maxWidth) {
      lines.push(remaining);
      break;
    }
    let count = 1;
    while (count < remaining.length && ctx.measureText(remaining.slice(0, count + 1)).width <= maxWidth) count++;
    if (lines.length === maxLines - 1) {
      let final = remaining.slice(0, count).trimEnd();
      while (final.length > 1 && ctx.measureText(`${final}…`).width > maxWidth) final = final.slice(0, -1).trimEnd();
      lines.push(`${final}…`);
      break;
    }
    const space = remaining.lastIndexOf(' ', count);
    const cut = space > 0 ? space : count;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return lines.length ? lines : [text];
}

export class FlowScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private fontFamily = 'system-ui';
  private points: NodePoint[] = [];
  private readouts: Readout[] = [];
  private stepIndex = 0;
  private fromUpTo = 1;
  private targetUpTo = 1;
  private elapsed = 0;
  private clock = 0;

  constructor(private spec: FlowSpec) {
    this.targetUpTo = 1;
    this.fromUpTo = 1;
    this.updateReadouts();
  }

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
    this.resize(w, h);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    const margin = clamp(this.w * 0.075, 22, 44);
    const span = Math.max(1, this.w - margin * 2);
    const y = this.h * 0.5;
    this.points = this.spec.nodes.map((_, index) => ({
      x: margin + span * index / (this.spec.nodes.length - 1),
      y,
    }));
  }

  setParam(_axis: 'x' | 'y', _dir: -1 | 1): void {}

  setStep(step: Step): void {
    const next = Number.isFinite(step) ? clamp(Math.round(step) - 1, 0, this.spec.steps.length - 1) : 0;
    const oldUpTo = this.targetUpTo;
    this.stepIndex = next;
    this.targetUpTo = this.spec.steps[next].upTo;
    this.fromUpTo = this.targetUpTo > oldUpTo ? oldUpTo : this.targetUpTo;
    this.elapsed = 0;
    this.clock = 0;
    this.updateReadouts();
  }

  param(): number {
    return this.targetUpTo;
  }

  dispose(): void {
    this.ctx = null;
    this.points = [];
    this.readouts = [];
  }

  private updateReadouts(): void {
    const state = this.spec.steps[this.stepIndex];
    if (!state) return;
    const focused: Readout[] = [];
    for (const id of state.focus) {
      const node = this.spec.nodes.find(item => item.id === id);
      if (node?.sub) focused.push({label: node.label, value: node.sub});
    }
    if (state.losses) {
      let sum = 0;
      for (const loss of this.spec.losses) {
        const index = this.spec.nodes.findIndex(node => node.id === loss.at);
        if (index >= 0 && index < state.upTo) sum += loss.share;
      }
      this.readouts = focused.slice(0, 2);
      this.readouts.push({label: 'Lost', value: `${Math.round(sum * 100)}%`});
    } else {
      this.readouts = focused.slice(0, 3);
    }
  }

  private nodeProgress(index: number): number {
    if (index < this.fromUpTo) return 1;
    if (index >= this.targetUpTo) return 0;
    return easeOut(clamp(this.elapsed / 0.3, 0, 1));
  }

  private drawNodeLabel(index: number, reached: boolean, focus: boolean): void {
    const ctx = this.ctx!;
    const point = this.points[index];
    const node = this.spec.nodes[index];
    const spacing = this.points.length > 1 ? this.points[1].x - this.points[0].x : this.w;
    const maxWidth = Math.min(this.w - 16, spacing * 1.72);
    const fontSize = clamp(this.h * 0.065, 16, 20);
    const lineHeight = fontSize * 1.12;
    ctx.font = `600 ${fontSize}px ${this.fontFamily}`;
    const labelLines = wrap(ctx, node.label, maxWidth, 2);
    ctx.font = `400 ${fontSize}px ${this.fontFamily}`;
    const subLines = node.sub ? wrap(ctx, node.sub, maxWidth, 1) : [];
    const lines = labelLines.length + subLines.length;
    const above = index % 2 === 0;
    let baseline = above ? point.y - 20 - (lines - 1) * lineHeight : point.y + 25;
    const minBaseline = 8 + fontSize;
    const maxBaseline = this.h - 8 - (lines - 1) * lineHeight;
    baseline = clamp(baseline, minBaseline, Math.max(minBaseline, maxBaseline));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const alpha = focus ? 1 : reached ? 0.78 : 0.28;
    let lineIndex = 0;
    for (const line of labelLines) {
      ctx.font = `600 ${fontSize}px ${this.fontFamily}`;
      const half = ctx.measureText(line).width / 2;
      const x = clamp(point.x, 8 + half, this.w - 8 - half);
      ctx.fillStyle = C.white;
      ctx.globalAlpha = alpha;
      ctx.fillText(line, x, baseline + lineIndex++ * lineHeight);
    }
    for (const line of subLines) {
      ctx.font = `400 ${fontSize}px ${this.fontFamily}`;
      const half = ctx.measureText(line).width / 2;
      const x = clamp(point.x, 8 + half, this.w - 8 - half);
      ctx.fillStyle = C.soft;
      ctx.globalAlpha = alpha;
      ctx.fillText(line, x, baseline + lineIndex++ * lineHeight);
    }
    ctx.globalAlpha = 1;
  }

  private drawLoss(nodeIndex: number, label: string, share: number, ordinal: number): void {
    const ctx = this.ctx!;
    const point = this.points[nodeIndex];
    const vertical = nodeIndex % 2 === 0 ? 1 : -1;
    const horizontal = point.x < this.w / 2 ? 1 : -1;
    const dx = horizontal * clamp(this.w * (0.10 + ordinal * 0.012), 30, 58);
    const dy = vertical * clamp(this.h * 0.17, 28, 54);
    const endX = clamp(point.x + dx, 18, this.w - 18);
    const endY = clamp(point.y + dy, 24, this.h - 24);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(endX, endY);
    glowStroke(ctx, C.hot, 1.5 + share * 4);

    for (let p = 0; p < 3; p++) {
      const t = (this.clock * 0.24 + p / 3) % 1;
      const x = point.x + (endX - point.x) * t;
      const y = point.y + (endY - point.y) * t;
      ctx.globalAlpha = 1 - t * 0.72;
      dot(ctx, x, y, 1.8 + share * 1.8, C.hot);
    }
    ctx.globalAlpha = 1;

    const fontSize = clamp(this.h * 0.06, 16, 19);
    ctx.font = `600 ${fontSize}px ${this.fontFamily}`;
    const value = `${label} ${Math.round(share * 100)}%`;
    const lines = wrap(ctx, value, this.w - 16, 2);
    const lineHeight = fontSize * 1.12;
    let baseline = endY + vertical * (fontSize + 3);
    if (vertical < 0) baseline -= (lines.length - 1) * lineHeight;
    baseline = clamp(baseline, 8 + fontSize, this.h - 8 - (lines.length - 1) * lineHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.hot;
    lines.forEach((line, index) => {
      const half = ctx.measureText(line).width / 2;
      const x = clamp(endX, 8 + half, this.w - 8 - half);
      ctx.fillText(line, x, baseline + index * lineHeight);
    });
  }

  frame(dt: number): Readout[] {
    const ctx = this.ctx;
    if (!ctx) return this.readouts;
    const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    this.elapsed += delta;
    this.clock = (this.clock + delta) % 1000;
    clear(ctx, this.w, this.h);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const state = this.spec.steps[this.stepIndex];
    const color = this.spec.kind === 'water' || this.spec.kind === 'signal' ? C.cyan : C.amber;
    const radius = clamp(Math.min(this.w, this.h) * 0.035, 8, 11);

    for (let index = 0; index < this.points.length - 1; index++) {
      const a = this.points[index];
      const b = this.points[index + 1];
      const progress = this.nodeProgress(index + 1);
      if (progress <= 0) {
        ctx.beginPath();
        ctx.moveTo(a.x + radius, a.y);
        ctx.lineTo(b.x - radius, b.y);
        ctx.strokeStyle = C.faint;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        continue;
      }
      const startX = a.x + radius;
      const finalX = b.x - radius;
      const endX = startX + (finalX - startX) * progress;
      arrow(ctx, startX, a.y, endX, b.y, color, 2);
      for (let p = 0; p < 4; p++) {
        const t = (this.clock * 0.32 + p / 4) % 1;
        if (t > progress) continue;
        dot(ctx, startX + (finalX - startX) * t, a.y, 2.1, color);
      }
    }

    for (let index = 0; index < this.points.length; index++) {
      const point = this.points[index];
      const progress = this.nodeProgress(index);
      const reached = index < this.targetUpTo;
      const focus = reached && state.focus.includes(this.spec.nodes[index].id);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius * (0.82 + progress * 0.18), 0, Math.PI * 2);
      if (!reached) {
        ctx.strokeStyle = C.faint;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else if (focus) {
        glowStroke(ctx, color, 3, Math.max(0.35, progress));
      } else {
        ctx.strokeStyle = color;
        ctx.globalAlpha = Math.max(0.35, progress);
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      this.drawNodeLabel(index, reached, focus);
    }

    if (state.losses) {
      let ordinal = 0;
      for (const loss of this.spec.losses) {
        const nodeIndex = this.spec.nodes.findIndex(node => node.id === loss.at);
        if (nodeIndex >= 0 && nodeIndex < state.upTo) this.drawLoss(nodeIndex, loss.label, loss.share, ordinal++);
      }
    }
    ctx.restore();
    return this.readouts;
  }
}
