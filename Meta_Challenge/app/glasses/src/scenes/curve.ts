import type {CurveSeries, CurveSpec} from './specs/types';
import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, glowStroke} from './util';

interface Layout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  font: number;
}

interface LabelPoint {
  text: string;
  color: string;
  x: number;
  y: number;
  baseline: number;
}

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const TIDY = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;

function stepDecimals(step: number): number {
  const source = step.toString().toLowerCase();
  if (source.includes('e-')) return clamp(Number(source.split('e-')[1]), 0, 6);
  return clamp((source.split('.')[1] ?? '').length, 0, 6);
}

/** Axis ticks carry only the decimals they need: 2, 0.5, 2.5, never 2.00. */
function tickText(value: number): string {
  return String(Number(value.toFixed(6)));
}

/** Three to five round tick values (steps of 1, 2, 2.5 or 5 times a power of ten) inside [min, max]. */
function tidyTicks(min: number, max: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find(candidate => candidate * power >= raw - 1e-12) ?? 10) * power;
  const out: number[] = [];
  let iterations = 0;
  for (let value = Math.ceil(min / step - 1e-9) * step;
    value <= max + step * 1e-9 && iterations < 12;
    value += step, iterations++) {
    out.push(Math.abs(value) < step * 1e-9 ? 0 : value);
  }
  return out.length >= 2 ? out : [min, max];
}

function tidyCeil(value: number): number {
  if (!(value > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  return (TIDY.find(candidate => candidate >= scaled - 1e-12) ?? 10) * power;
}

function tidyFloor(value: number): number {
  if (!(value > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  let result: number = TIDY[0];
  for (const candidate of TIDY) {
    if (candidate > scaled + 1e-12) break;
    result = candidate;
  }
  return result * power;
}

export class CurveScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private fontFamily = 'system-ui';
  private layout: Layout = {left: 54, right: 292, top: 34, bottom: 158, font: 16};
  private stepIndex = 0;
  private knob: number;
  private markerFrom: number;
  private markerVisual: number;
  private markerElapsed = 0.15;
  private reveal = new Map<string, number>();
  private yMin = 0;
  private yMax = 1;
  private yFromMin = 0;
  private yFromMax = 1;
  private yTargetMin = 0;
  private yTargetMax = 1;
  private scaleElapsed = 0.3;
  private shownCache: CurveSeries[] = [];
  private readoutCache: Readout[] = [];
  private textCache = new Map<string, {text: string; width: number}>();

  constructor(private spec: CurveSpec) {
    this.knob = spec.x.value;
    this.markerFrom = this.knob;
    this.markerVisual = this.knob;
    for (const item of spec.series) this.reveal.set(item.name, 1);
    for (const name of spec.steps[0].series) this.reveal.set(name, 0);
    const [min, max] = this.scaleForStep(0);
    this.yMin = min;
    this.yMax = max;
    this.yFromMin = min;
    this.yFromMax = max;
    this.yTargetMin = min;
    this.yTargetMax = max;
    this.refreshCaches();
  }

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
    this.resize(w, h);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    const font = clamp(this.h * 0.055, 16, 18);
    const edge = clamp(this.w * 0.025, 6, 16);
    const left = clamp(this.w * 0.16, 54, 82);
    const top = edge + font + 11;
    const bottom = Math.max(top + 30, this.h - font * 2 - 10);
    this.layout = {
      left,
      right: Math.max(left + 30, this.w - edge),
      top,
      bottom,
      font,
    };
    this.refreshCaches();
  }

  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis !== 'x') return;
    const places = stepDecimals(this.spec.x.step);
    const power = 10 ** places;
    const next = Math.round((this.knob + dir * this.spec.x.step) * power) / power;
    const target = clamp(next, this.spec.x.min, this.spec.x.max);
    if (target === this.knob) return;
    this.markerFrom = this.markerVisual;
    this.knob = target;
    this.markerElapsed = 0;
    this.refreshCaches();
  }

  setStep(step: Step): void {
    const next = Number.isFinite(step) ? clamp(Math.round(step) - 1, 0, this.spec.steps.length - 1) : 0;
    const previous = new Set(this.spec.steps[this.stepIndex].series);
    const shown = this.spec.steps[next].series;
    for (const name of shown) {
      if (!previous.has(name)) this.reveal.set(name, 0);
    }
    this.stepIndex = next;
    this.yFromMin = this.yMin;
    this.yFromMax = this.yMax;
    [this.yTargetMin, this.yTargetMax] = this.scaleForStep(next);
    this.scaleElapsed = 0;
    this.refreshCaches();
  }

  param(): number {
    return this.knob;
  }

  dispose(): void {
    this.ctx = null;
    this.reveal.clear();
    this.textCache.clear();
  }

  private shownSeries(): CurveSeries[] {
    return this.shownCache;
  }

  private refreshCaches(): void {
    const names = this.spec.steps[this.stepIndex].series;
    this.shownCache = names.map(name => this.spec.series.find(item => item.name === name)!).filter(Boolean);
    this.readoutCache = [{
      label: this.spec.x.label,
      value: this.withUnit(this.knob, this.spec.x.unit, this.spec.x.decimals),
    }];
    for (const role of ['main', 'other'] as const) {
      const item = this.shownCache.find(series => series.role === role);
      if (item) this.readoutCache.push({
        label: item.name,
        value: this.withUnit(this.interpolate(item, this.knob), this.spec.y.unit, this.spec.y.decimals),
      });
    }
    this.textCache.clear();
    if (!this.ctx) return;
    this.trimText(this.axisTitle(this.spec.y.label, this.spec.y.unit), this.w - 12);
    this.trimText(this.axisTitle(this.spec.x.label, this.spec.x.unit), this.layout.right - this.layout.left);
    for (const value of tidyTicks(this.spec.x.min, this.spec.x.max)) this.textWidth(tickText(value));
    for (const mark of this.spec.marks) this.trimText(mark.label, Math.max(40, this.layout.right - this.layout.left));
    for (const item of this.shownCache) {
      this.trimText(item.name, Math.max(40, this.layout.right - this.layout.left - 8), 600);
      this.textWidth(this.withUnit(this.interpolate(item, this.knob), this.spec.y.unit, this.spec.y.decimals), 600);
    }
  }

  private scaleForStep(index: number): [number, number] {
    const names = new Set(this.spec.steps[index].series);
    let low = Infinity;
    let high = -Infinity;
    for (const item of this.spec.series) {
      if (!names.has(item.name)) continue;
      for (const [, y] of item.points) {
        low = Math.min(low, y);
        high = Math.max(high, y);
      }
    }
    let bottom = low < 0 ? low : 0;
    let top = high > 0 ? tidyCeil(high) : -tidyFloor(Math.abs(high));
    if (!Number.isFinite(bottom) || !Number.isFinite(top)) return [0, 1];
    if (top <= bottom) {
      const padding = tidyCeil(Math.max(1, Math.abs(bottom) * 0.2));
      top = bottom + padding;
    }
    return [bottom, top];
  }

  private format(value: number, decimals?: number): string {
    return value.toFixed(decimals ?? (Math.abs(value) < 10 ? 1 : 0));
  }

  private withUnit(value: number, unit: string, decimals?: number): string {
    const text = this.format(value, decimals);
    return unit ? `${text} ${unit}` : text;
  }

  private axisTitle(label: string, unit: string): string {
    return unit ? `${label} (${unit})` : label;
  }

  private trimText(text: string, maxWidth: number, weight = 400): string {
    const key = `${weight}:${maxWidth}:${text}`;
    const cached = this.textCache.get(key);
    if (cached) return cached.text;
    const ctx = this.ctx!;
    ctx.font = `${weight} ${this.layout.font}px ${this.fontFamily}`;
    const width = ctx.measureText(text).width;
    if (width <= maxWidth) {
      this.textCache.set(key, {text, width});
      return text;
    }
    const suffix = '\u2026';
    let clipped = text;
    while (clipped.length > 1 && ctx.measureText(clipped + suffix).width > maxWidth) clipped = clipped.slice(0, -1);
    const result = clipped.trimEnd() + suffix;
    this.textCache.set(key, {text: result, width: ctx.measureText(result).width});
    return result;
  }

  private textWidth(text: string, weight = 400): number {
    const key = `${weight}:width:${text}`;
    const cached = this.textCache.get(key);
    if (cached) return cached.width;
    const ctx = this.ctx!;
    ctx.font = `${weight} ${this.layout.font}px ${this.fontFamily}`;
    const width = ctx.measureText(text).width;
    this.textCache.set(key, {text, width});
    return width;
  }

  private mapX(value: number): number {
    const {left, right} = this.layout;
    return left + (value - this.spec.x.min) / (this.spec.x.max - this.spec.x.min) * (right - left);
  }

  private mapY(value: number): number {
    const {top, bottom} = this.layout;
    return bottom - (value - this.yMin) / (this.yMax - this.yMin) * (bottom - top);
  }

  private interpolate(series: CurveSeries, x: number): number {
    const points = series.points;
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[points.length - 1][0]) return points[points.length - 1][1];
    for (let index = 1; index < points.length; index++) {
      const [rightX, rightY] = points[index];
      if (x > rightX) continue;
      const [leftX, leftY] = points[index - 1];
      const mix = (x - leftX) / (rightX - leftX);
      return leftY + (rightY - leftY) * mix;
    }
    return points[points.length - 1][1];
  }

  private drawAxes(): void {
    const ctx = this.ctx!;
    const {left, right, top, bottom, font} = this.layout;
    ctx.setLineDash([]);
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    ctx.font = `400 ${font}px ${this.fontFamily}`;
    ctx.fillStyle = C.soft;
    ctx.textBaseline = 'middle';
    for (const value of tidyTicks(this.yMin, this.yMax)) {
      const mix = (value - this.yMin) / (this.yMax - this.yMin || 1);
      const y = bottom + (top - bottom) * mix;
      ctx.strokeStyle = C.dim;
      ctx.beginPath();
      ctx.moveTo(left - 4, y);
      ctx.lineTo(left, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(tickText(value), left - 7, y);
    }

    for (const value of tidyTicks(this.spec.x.min, this.spec.x.max)) {
      const mix = (value - this.spec.x.min) / (this.spec.x.max - this.spec.x.min || 1);
      const x = left + (right - left) * mix;
      ctx.strokeStyle = C.dim;
      ctx.beginPath();
      ctx.moveTo(x, bottom);
      ctx.lineTo(x, bottom + 4);
      ctx.stroke();
      const label = tickText(value);
      const width = this.textWidth(label);
      ctx.textAlign = 'left';
      ctx.fillText(label, clamp(x - width / 2, 1, this.w - width - 1), bottom + font + 3);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.soft;
    ctx.fillText(
      this.trimText(this.axisTitle(this.spec.y.label, this.spec.y.unit), this.w - 12),
      6,
      6 + font,
    );
    ctx.textAlign = 'center';
    ctx.fillText(
      this.trimText(this.axisTitle(this.spec.x.label, this.spec.x.unit), right - left),
      (left + right) / 2,
      Math.min(this.h - 1, bottom + font * 2 + 5),
    );
  }

  private drawMarks(): void {
    const ctx = this.ctx!;
    const {left, right, top, bottom, font} = this.layout;
    const occupied: Array<[number, number]> = [];
    ctx.font = `400 ${font}px ${this.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    for (const mark of this.spec.marks) {
      if (mark.x < this.spec.x.min || mark.x > this.spec.x.max) continue;
      const x = this.mapX(mark.x);
      const active = Math.abs(this.knob - mark.x) <= this.spec.x.step / 2 + 1e-10;
      const text = this.trimText(mark.label, Math.max(40, right - left));
      const width = this.textWidth(text, 600);
      const labelX = clamp(x - width / 2, left, right - width);
      let row = 0;
      while (row < occupied.length && labelX < occupied[row][1] + 5) row++;
      if (!occupied[row]) occupied[row] = [labelX, labelX + width];
      else occupied[row][1] = labelX + width;
      const baseline = clamp(bottom - 7 - row * (font + 2), top + font, bottom - 7);
      ctx.strokeStyle = active ? C.white : C.soft;
      ctx.lineWidth = active ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(x, bottom - 5);
      ctx.lineTo(x, bottom + 5);
      ctx.stroke();
      ctx.fillStyle = active ? C.white : C.soft;
      ctx.textAlign = 'left';
      ctx.fillText(text, labelX, baseline);
    }
  }

  private drawSeries(series: CurveSeries, progress: number): void {
    const ctx = this.ctx!;
    const {left, right, top, bottom} = this.layout;
    const color = series.role === 'main' ? C.cyan : C.pink;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left - 5, top - 5, (right - left + 10) * progress, bottom - top + 10);
    ctx.clip();
    ctx.setLineDash(series.role === 'other' ? [9, 7] : []);
    ctx.beginPath();
    series.points.forEach(([x, y], index) => {
      const px = this.mapX(x);
      const py = this.mapY(y);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    glowStroke(ctx, color, 2.2);
    ctx.restore();
  }

  private spreadBaselines(labels: LabelPoint[], min: number, max: number): void {
    if (!labels.length) return;
    const gap = this.layout.font + 3;
    labels.sort((a, b) => a.baseline - b.baseline);
    labels[0].baseline = clamp(labels[0].baseline, min, max);
    for (let index = 1; index < labels.length; index++) {
      labels[index].baseline = clamp(Math.max(labels[index].baseline, labels[index - 1].baseline + gap), min, max);
    }
    for (let index = labels.length - 2; index >= 0; index--) {
      labels[index].baseline = Math.min(labels[index].baseline, labels[index + 1].baseline - gap);
    }
  }

  private drawSeriesNames(series: CurveSeries[]): void {
    const ctx = this.ctx!;
    const {left, right, top, bottom, font} = this.layout;
    const markerAtRight = this.mapX(this.markerVisual) > right - font * 1.5;
    const labels: LabelPoint[] = series.map(item => {
      const point = item.points[item.points.length - 1];
      const endY = this.mapY(point[1]);
      let baseline = endY - 7;
      if (markerAtRight) baseline = endY + font + 8 <= bottom - 8 ? endY + font + 8 : endY - font - 12;
      return {
        text: this.trimText(item.name, Math.max(40, right - left - 8), 600),
        color: item.role === 'main' ? C.cyan : C.pink,
        x: clamp(this.mapX(point[0]) - 5, left + 5, right - 5),
        y: endY,
        baseline,
      };
    });
    this.spreadBaselines(labels, top + font, bottom - 8);
    ctx.font = `600 ${font}px ${this.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    for (const label of labels) {
      const width = this.textWidth(label.text, 600);
      const rightSide = label.x + width + 8 <= right;
      ctx.textAlign = rightSide ? 'left' : 'right';
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, label.x + (rightSide ? 6 : -1), label.baseline);
    }
  }

  private drawMarker(series: CurveSeries[]): void {
    const ctx = this.ctx!;
    const {left, right, top, bottom, font} = this.layout;
    const x = this.mapX(this.markerVisual);
    ctx.setLineDash([]);
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();

    const labels: LabelPoint[] = [];
    for (const item of series) {
      const value = this.interpolate(item, this.markerVisual);
      const y = this.mapY(value);
      ctx.beginPath();
      ctx.arc(x, y, item.role === 'main' ? 5 : 4, 0, Math.PI * 2);
      if (item.role === 'main') {
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.strokeStyle = C.white;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = C.pink;
        ctx.fill();
      }
      labels.push({
        text: this.withUnit(this.interpolate(item, this.knob), this.spec.y.unit, this.spec.y.decimals),
        color: item.role === 'main' ? C.green : C.pink,
        x,
        y,
        baseline: y - 7,
      });
    }

    this.spreadBaselines(labels, top + font, bottom - font - 10);
    ctx.font = `600 ${font}px ${this.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    const widest = labels.reduce((width, label) => Math.max(width, this.textWidth(label.text, 600)), 0);
    const drawLeft = x >= (left + right) / 2 || x + widest + 10 > right;
    const markerAtRight = x > right - font * 1.5;
    const nameWidth = markerAtRight
      ? series.reduce((width, item) => Math.max(
        width,
        this.textWidth(this.trimText(item.name, Math.max(40, right - left - 8), 600), 600),
      ), 0)
      : 0;
    const anchor = drawLeft
      ? clamp(x - 8 - nameWidth - (nameWidth ? 10 : 0), left + widest, right - 2)
      : clamp(x + 8, left + 2, right - widest);
    ctx.textAlign = drawLeft ? 'right' : 'left';
    for (const label of labels) {
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, anchor, label.baseline);
    }
  }

  frame(dt: number): Readout[] {
    const ctx = this.ctx;
    const shown = this.shownSeries();
    if (!ctx) return this.readoutCache;
    const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    this.markerElapsed = Math.min(0.15, this.markerElapsed + delta);
    this.markerVisual = this.markerFrom + (this.knob - this.markerFrom) * easeOut(this.markerElapsed / 0.15);
    this.scaleElapsed = Math.min(0.3, this.scaleElapsed + delta);
    const scaleMix = easeOut(this.scaleElapsed / 0.3);
    this.yMin = this.yFromMin + (this.yTargetMin - this.yFromMin) * scaleMix;
    this.yMax = this.yFromMax + (this.yTargetMax - this.yFromMax) * scaleMix;
    for (const item of shown) this.reveal.set(item.name, Math.min(1, (this.reveal.get(item.name) ?? 0) + delta / 0.5));

    clear(ctx, this.w, this.h);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawAxes();
    this.drawMarks();
    for (const item of shown) this.drawSeries(item, easeOut(this.reveal.get(item.name) ?? 1));
    this.drawSeriesNames(shown);
    this.drawMarker(shown);
    ctx.restore();
    return this.readoutCache;
  }
}
