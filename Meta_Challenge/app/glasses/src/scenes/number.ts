import type {NumberRow, NumberSpec, NumberValue} from './specs/types';
import type {Readout, Scene, Step} from './types';
import {C, clamp, clear, glowStroke} from './util';

type Show = NumberSpec['steps'][number]['show'];

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
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
      while (final.length > 1 && ctx.measureText(`${final}\u2026`).width > maxWidth) final = final.slice(0, -1).trimEnd();
      lines.push(`${final}\u2026`);
      break;
    }
    const space = remaining.lastIndexOf(' ', count);
    const cut = space > 0 ? space : count;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return lines.length ? lines : [text];
}

function stepDecimals(step: number): number {
  const source = step.toString().toLowerCase();
  if (source.includes('e-')) return clamp(Number(source.split('e-')[1]), 0, 6);
  return clamp((source.split('.')[1] ?? '').length, 0, 6);
}

export class NumberScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private fontFamily = 'system-ui';
  private stepIndex = 0;
  private show: Show;
  private elapsed = 0;
  private animateToTop = false;
  private knobCurrent: number;
  private readouts: Readout[] = [];
  private wrapCache = new Map<string, string[]>();
  private emWidthCache = new Map<string, number>();
  private bigSize = 56;
  private smallSize = 28;
  private labelSize = 18;
  private rowSize = 16;

  constructor(private spec: NumberSpec) {
    this.show = spec.steps[0].show;
    this.knobCurrent = spec.knob?.value ?? spec.headline.value;
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
    this.bigSize = Math.max(56, this.h * 0.28);
    this.smallSize = Math.max(28, this.bigSize * 0.5);
    this.labelSize = clamp(this.h * 0.07, 18, 24);
    this.rowSize = clamp(this.h * 0.065, 18, 20);
    this.cacheText();
  }

  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    const knob = this.spec.knob;
    if (axis !== 'x' || !knob) return;
    const places = stepDecimals(knob.step);
    const power = 10 ** places;
    const next = Math.round((this.knobCurrent + dir * knob.step) * power) / power;
    this.knobCurrent = clamp(next, knob.min, knob.max);
    this.updateReadouts();
    this.cacheText();
  }

  setStep(step: Step): void {
    const next = Number.isFinite(step) ? clamp(Math.round(step) - 1, 0, this.spec.steps.length - 1) : 0;
    const nextShow = this.spec.steps[next].show;
    this.animateToTop = this.show === 'headline' && nextShow !== 'headline';
    this.stepIndex = next;
    this.show = nextShow;
    this.elapsed = 0;
    this.cacheText();
  }

  param(): number {
    return this.spec.knob ? this.knobCurrent : this.spec.headline.value;
  }

  dispose(): void {
    this.ctx = null;
    this.readouts = [];
    this.wrapCache.clear();
    this.emWidthCache.clear();
  }

  private updateReadouts(): void {
    const knob = this.spec.knob;
    this.readouts = knob
      ? [{label: knob.label, value: `${this.knobCurrent.toFixed(stepDecimals(knob.step))} ${knob.unit}`}]
      : [];
  }

  private factor(): number {
    return this.spec.knob ? this.knobCurrent / this.spec.knob.value : 1;
  }

  private format(value: number, places?: number): string {
    return value.toFixed(places ?? (value < 10 ? 1 : 0));
  }

  private scaled(item: NumberValue | NumberRow): number {
    return item.value * (('scales' in item && item.scales === false) ? 1 : this.factor());
  }

  private textWidth(text: string, size: number, weight: number): number {
    const key = `${weight}:${text}`;
    let em = this.emWidthCache.get(key);
    if (em === undefined) {
      const ctx = this.ctx!;
      ctx.font = `${weight} 100px ${this.fontFamily}`;
      em = ctx.measureText(text).width;
      this.emWidthCache.set(key, em);
    }
    return em * size / 100;
  }

  private cachedWrap(key: string, text: string, maxWidth: number, maxLines: number, size: number, weight: number): string[] {
    const cached = this.wrapCache.get(key);
    if (cached) return cached;
    const ctx = this.ctx!;
    ctx.font = `${weight} ${size}px ${this.fontFamily}`;
    const lines = wrap(ctx, text, maxWidth, maxLines);
    this.wrapCache.set(key, lines);
    return lines;
  }

  private cacheText(): void {
    if (!this.ctx) return;
    this.wrapCache.clear();
    this.emWidthCache.clear();
    this.cachedWrap('headline', this.spec.headline.label, this.w - 24, 2, this.labelSize, 400);
    this.textWidth(this.format(this.scaled(this.spec.headline), this.spec.headline.decimals), this.bigSize, 600);
    this.textWidth(this.spec.headline.unit, Math.max(16, this.bigSize * 0.4), 600);
    this.spec.rows.forEach((row, index) => {
      const valueText = this.format(this.scaled(row), row.decimals);
      const unitWidth = this.textWidth(row.unit, this.rowSize, 600);
      const valueWidth = this.textWidth(valueText, this.rowSize, 600);
      const labelWidth = Math.max(50, this.w - 10 - unitWidth - valueWidth - 7 - 22);
      this.cachedWrap(`row:${index}`, row.label, labelWidth, 2, this.rowSize, 400);
    });
    if (this.spec.compare) {
      this.cachedWrap('compare', this.spec.compare.label, this.w - 24, 2, this.labelSize, 400);
    }
    if (this.spec.knob) {
      const knob = this.spec.knob;
      const size = Math.max(16, this.labelSize * 0.9);
      const value = `${knob.label}: ${this.knobCurrent.toFixed(stepDecimals(knob.step))} ${knob.unit}`;
      this.textWidth(value, size, 600);
    }
  }

  private drawNumber(
    item: NumberValue,
    value: number,
    y: number,
    size: number,
    color: string,
    centerX = this.w / 2,
  ): void {
    const ctx = this.ctx!;
    const finalText = this.format(this.scaled(item), item.decimals);
    const text = this.format(value, item.decimals);
    const unitSize = Math.max(16, size * 0.4);
    const gap = Math.max(6, size * 0.1);
    const numberWidth = this.textWidth(finalText, size, 600);
    const unitWidth = this.textWidth(item.unit, unitSize, 600);
    const left = centerX - (numberWidth + gap + unitWidth) / 2;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    ctx.font = `600 ${size}px ${this.fontFamily}`;
    ctx.fillStyle = color;
    ctx.fillText(text, left + numberWidth, y);
    ctx.textAlign = 'left';
    ctx.font = `600 ${unitSize}px ${this.fontFamily}`;
    ctx.fillStyle = C.white;
    ctx.fillText(item.unit, left + numberWidth + gap, y);
  }

  private drawKnobLine(y: number): number {
    const knob = this.spec.knob;
    if (!knob) return y;
    const ctx = this.ctx!;
    const size = Math.max(16, this.labelSize * 0.9);
    const text = `${knob.label}: ${this.knobCurrent.toFixed(stepDecimals(knob.step))} ${knob.unit}`;
    ctx.font = `600 ${size}px ${this.fontFamily}`;
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, this.w / 2, y);
    const edge = this.w / 2 + this.textWidth(text, size, 600) / 2 + 10;
    const r = Math.max(4, size * 0.25);
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(edge, y - size * 0.55);
    ctx.lineTo(edge + r, y - size * 0.55 - r);
    ctx.lineTo(edge + r * 2, y - size * 0.55);
    ctx.closePath();
    ctx.moveTo(edge, y - size * 0.1);
    ctx.lineTo(edge + r, y - size * 0.1 + r);
    ctx.lineTo(edge + r * 2, y - size * 0.1);
    ctx.closePath();
    ctx.stroke();
    return y + size * 0.45;
  }

  private drawHeadline(top: boolean, transition = 1): number {
    const ctx = this.ctx!;
    const centeredBaseline = this.h * 0.44;
    const topBaseline = 8 + this.smallSize;
    const size = top
      ? this.bigSize + (this.smallSize - this.bigSize) * transition
      : this.bigSize;
    const baseline = top
      ? centeredBaseline + (topBaseline - centeredBaseline) * transition
      : centeredBaseline;
    const target = this.scaled(this.spec.headline);
    const count = this.show === 'headline' ? easeOut(clamp(this.elapsed / 0.9, 0, 1)) : 1;
    this.drawNumber(this.spec.headline, target * count, baseline, size, C.green);

    const labelY = baseline + Math.max(this.labelSize * 1.25, size * 0.34);
    ctx.font = `400 ${this.labelSize}px ${this.fontFamily}`;
    const lines = this.cachedWrap('headline', this.spec.headline.label, this.w - 24, 2, this.labelSize, 400);
    const lineHeight = this.labelSize * 1.2;
    ctx.fillStyle = C.soft;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, index) => ctx.fillText(line, this.w / 2, labelY + index * lineHeight));
    let bottom = labelY + (lines.length - 1) * lineHeight;
    if (this.spec.knob) bottom = this.drawKnobLine(bottom + Math.max(19, this.labelSize * 1.15));
    return bottom;
  }

  private drawRows(startY: number): void {
    const ctx = this.ctx!;
    if (!this.spec.rows.length) return;
    const available = Math.max(1, this.h - startY - 8);
    const rowHeight = available / this.spec.rows.length;
    this.spec.rows.forEach((row, index) => {
      const reveal = easeOut(clamp((this.elapsed - index * 0.15) / 0.2, 0, 1));
      if (reveal <= 0) return;
      const top = startY + index * rowHeight + (1 - reveal) * 6;
      const value = this.scaled(row);
      const valueText = this.format(value, row.decimals);
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.font = `600 ${this.rowSize}px ${this.fontFamily}`;
      const unitWidth = this.textWidth(row.unit, this.rowSize, 600);
      const valueWidth = this.textWidth(valueText, this.rowSize, 600);
      const right = this.w - 10;
      const valueLeft = right - unitWidth - valueWidth - 7;
      const labelWidth = Math.max(50, valueLeft - 22);
      ctx.font = `400 ${this.rowSize}px ${this.fontFamily}`;
      const labelLines = this.cachedWrap(`row:${index}`, row.label, labelWidth, 2, this.rowSize, 400);
      const baseline = top + Math.min(rowHeight * 0.45, this.rowSize + 3);
      const lineHeight = this.rowSize * 1.05;
      ctx.fillStyle = C.soft;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      labelLines.forEach((line, lineIndex) => ctx.fillText(line, 10, baseline + lineIndex * lineHeight));
      ctx.textAlign = 'right';
      ctx.font = `600 ${this.rowSize}px ${this.fontFamily}`;
      ctx.fillStyle = C.white;
      ctx.fillText(valueText, right - unitWidth - 7, baseline);
      ctx.textAlign = 'left';
      ctx.fillText(row.unit, right - unitWidth, baseline);

      if (row.of !== undefined) {
        const barY = top + rowHeight - 5;
        const barX = 10;
        const barW = this.w - 20;
        ctx.strokeStyle = C.white;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, 3);
        ctx.fillStyle = C.cyan;
        ctx.fillRect(barX + 1, barY + 1, Math.max(0, barW - 2) * clamp(value / row.of, 0, 1), 1);
      }
      ctx.restore();
    });
  }

  private drawCompare(startY: number): void {
    const compare = this.spec.compare;
    if (!compare) return;
    const ctx = this.ctx!;
    ctx.font = `400 ${this.labelSize}px ${this.fontFamily}`;
    const lines = this.cachedWrap('compare', compare.label, this.w - 24, 2, this.labelSize, 400);
    const lineHeight = this.labelSize * 1.2;
    const labelBaseline = startY + this.labelSize;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.soft;
    lines.forEach((line, index) => ctx.fillText(line, this.w / 2, labelBaseline + index * lineHeight));

    const compareSize = Math.max(40, this.h * 0.17);
    const valueBaseline = Math.min(
      this.h - 50,
      labelBaseline + (lines.length - 1) * lineHeight + compareSize + 10,
    );
    this.drawNumber(compare, this.scaled(compare), valueBaseline, compareSize, C.pink);

    const markY = Math.min(this.h - 17, valueBaseline + 31);
    const leftX = this.w * 0.34;
    const rightX = this.w * 0.66;
    const r = 7;
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(leftX, markY, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightX, markY - r);
    ctx.lineTo(rightX + r, markY);
    ctx.lineTo(rightX, markY + r);
    ctx.lineTo(rightX - r, markY);
    ctx.closePath();
    glowStroke(ctx, C.white, 1.4);
    const tagSize = 16;
    ctx.font = `400 ${tagSize}px ${this.fontFamily}`;
    ctx.fillStyle = C.white;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(this.spec.headline.unit, leftX - 12, markY);
    ctx.textAlign = 'left';
    ctx.fillText(compare.unit, rightX + 12, markY);
  }

  frame(dt: number): Readout[] {
    const ctx = this.ctx;
    if (!ctx) return this.readouts;
    const delta = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    this.elapsed += delta;
    clear(ctx, this.w, this.h);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.show === 'headline') {
      this.drawHeadline(false);
    } else {
      const transition = this.animateToTop ? easeOut(clamp(this.elapsed / 0.3, 0, 1)) : 1;
      const bottom = this.drawHeadline(true, transition);
      if (this.show === 'rows') this.drawRows(bottom + 8);
      else this.drawCompare(bottom + 6);
    }
    ctx.restore();
    return this.readouts;
  }
}
