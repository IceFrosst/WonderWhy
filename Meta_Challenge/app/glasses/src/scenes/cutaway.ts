import type {Readout, Scene, Step} from './types';
import {C, arrow, clamp, clear, dot, glowStroke} from './util';

interface Point {
  x: number;
  y: number;
}

interface CutawayLayout {
  left: number;
  right: number;
  top: number;
  floor: number;
  water: number;
  handleRight: number;
  elementY: number;
  switchX: number;
  switchY: number;
  steam: Point[];
}

const PI2 = Math.PI * 2;

const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export class KettleCutawayScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 1;
  private h = 1;
  private step: Step = 1;
  private time = 0;
  private fontFamily = 'system-ui';
  private fontSize = 16;
  private layout: CutawayLayout = {
    left: 0,
    right: 1,
    top: 0,
    floor: 1,
    water: 0.4,
    handleRight: 1,
    elementY: 1,
    switchX: 1,
    switchY: 1,
    steam: [],
  };

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui';
    this.resize(w, h);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.fontSize = clamp(this.h * 0.06, 16, 19);
    const left = this.w * 0.105;
    const right = this.w * 0.63;
    const top = Math.max(16, this.h * 0.1);
    const floor = this.h * 0.7;
    const water = top + (floor - top) * 0.38;
    const handleRight = this.w - Math.max(18, this.w * 0.055);
    const elementY = floor + Math.max(12, this.h * 0.045);
    const switchX = handleRight - Math.max(21, this.w * 0.04);
    const switchY = Math.min(this.h - this.fontSize - 3, floor + Math.max(34, this.h * 0.125));
    this.layout = {
      left,
      right,
      top,
      floor,
      water,
      handleRight,
      elementY,
      switchX,
      switchY,
      steam: [
        {x: right - (right - left) * 0.28, y: water - 3},
        {x: right - (right - left) * 0.28, y: top + 18},
        {x: right + 13, y: top + 18},
        {x: handleRight - 18, y: top + 35},
        {x: switchX, y: switchY - 13},
      ],
    };
  }

  setParam(_axis: 'x' | 'y', _dir: -1 | 1): void {}

  setStep(step: Step): void {
    this.step = Number.isFinite(step) ? clamp(Math.round(step), 1, 3) : 1;
    this.time = 0;
  }

  param(): number {
    return this.step;
  }

  dispose(): void {
    this.ctx = null;
  }

  private label(text: string, x: number, y: number, color = C.soft, align: CanvasTextAlign = 'center'): void {
    const ctx = this.ctx!;
    ctx.font = `600 ${this.fontSize}px ${this.fontFamily}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    const width = ctx.measureText(text).width;
    let px = x;
    if (align === 'center') px = clamp(x, 6 + width / 2, this.w - 6 - width / 2);
    else if (align === 'left') px = clamp(x, 6, this.w - 6 - width);
    else px = clamp(x, 6 + width, this.w - 6);
    ctx.fillStyle = color;
    ctx.fillText(text, px, clamp(y, this.fontSize + 2, this.h - 3));
  }

  private drawVessel(): void {
    const ctx = this.ctx!;
    const l = this.layout;
    const bodyW = l.right - l.left;

    ctx.beginPath();
    ctx.moveTo(l.left + bodyW * 0.18, l.top);
    ctx.lineTo(l.left - bodyW * 0.08, l.top + 13);
    ctx.lineTo(l.left + bodyW * 0.08, l.top + 22);
    ctx.bezierCurveTo(l.left - 4, l.top + 52, l.left - 5, l.floor - 42, l.left + 8, l.floor);
    ctx.lineTo(l.right, l.floor);
    ctx.bezierCurveTo(l.right + 5, l.floor - 48, l.right + 2, l.top + 45, l.right - bodyW * 0.08, l.top + 6);
    glowStroke(ctx, C.white, 2.2);

    ctx.beginPath();
    ctx.moveTo(l.left + bodyW * 0.18, l.top);
    ctx.lineTo(l.right - bodyW * 0.08, l.top + 6);
    ctx.moveTo(l.left + 8, l.floor);
    ctx.lineTo(l.right, l.floor);
    glowStroke(ctx, C.white, 4.2);

    ctx.beginPath();
    ctx.moveTo(l.right - 3, l.top + 35);
    ctx.bezierCurveTo(l.handleRight + 4, l.top + 25, l.handleRight + 4, l.floor - 14, l.right + 1, l.floor - 17);
    ctx.moveTo(l.right + 11, l.top + 55);
    ctx.bezierCurveTo(l.handleRight - 26, l.top + 50, l.handleRight - 25, l.floor - 38, l.right + 5, l.floor - 39);
    glowStroke(ctx, C.white, 2.2);

    ctx.beginPath();
    ctx.moveTo(l.left + 13, l.water);
    ctx.quadraticCurveTo((l.left + l.right) / 2, l.water - 2, l.right - 10, l.water);
    glowStroke(ctx, C.cyan, 2.1, 0.9);
  }

  private drawElement(lit: boolean, dim = false): void {
    const ctx = this.ctx!;
    const l = this.layout;
    const center = l.left + (l.right - l.left) * 0.53;
    const width = (l.right - l.left) * 0.46;
    const pulse = 0.78 + Math.sin(this.time * 2.2) * 0.16;
    ctx.beginPath();
    for (let i = 0; i <= 52; i++) {
      const p = i / 52;
      const x = center - width / 2 + width * p;
      const y = l.elementY + Math.sin(p * Math.PI * 8) * Math.max(3, this.h * 0.015);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    if (lit) glowStroke(ctx, C.amber, 2.7, dim ? 0.48 : pulse);
    else {
      ctx.strokeStyle = C.dim;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private convectionPoint(progress: number, side: -1 | 1): Point {
    const l = this.layout;
    const center = (l.left + l.right) / 2;
    const edge = side < 0 ? l.left + 25 : l.right - 25;
    const low = l.floor - 15;
    const high = l.water + 17;
    if (progress < 0.36) {
      const p = smooth(progress / 0.36);
      return {x: center + side * 7 * Math.sin(p * Math.PI), y: low + (high - low) * p};
    }
    if (progress < 0.56) {
      const p = smooth((progress - 0.36) / 0.2);
      return {x: center + (edge - center) * p, y: high - Math.sin(p * Math.PI) * 8};
    }
    if (progress < 0.88) {
      const p = smooth((progress - 0.56) / 0.32);
      return {x: edge + side * Math.sin(p * Math.PI) * 3, y: high + (low - high) * p};
    }
    const p = smooth((progress - 0.88) / 0.12);
    return {x: edge + (center - edge) * p, y: low};
  }

  private curvedLoop(side: -1 | 1): void {
    const ctx = this.ctx!;
    const l = this.layout;
    const center = (l.left + l.right) / 2;
    const edge = side < 0 ? l.left + 19 : l.right - 19;
    const low = l.floor - 30;
    const high = l.water + 28;
    ctx.beginPath();
    ctx.moveTo(center + side * 13, low);
    ctx.bezierCurveTo(center + side * 4, high + 26, center + side * 26, high, edge, high + 7);
    ctx.bezierCurveTo(edge + side * 9, high + 35, edge + side * 5, low - 18, edge, low);
    glowStroke(ctx, C.cyan, 1.8, 0.78);
    arrow(ctx, edge + side * 4, low - 19, edge, low, C.cyan, 1.8);
  }

  private drawMovingWater(): void {
    const ctx = this.ctx!;
    for (let i = 0; i < 34; i++) {
      const side: -1 | 1 = i % 2 ? 1 : -1;
      const p = (this.time * 0.095 + i / 34) % 1;
      const point = this.convectionPoint(p, side);
      dot(ctx, point.x, point.y, 1.7 + (i % 3) * 0.35, C.cyan);
    }
    this.curvedLoop(-1);
    this.curvedLoop(1);
    const l = this.layout;
    this.label('rises', (l.left + l.right) / 2, l.water + this.fontSize + 3, C.cyan);
    this.label('sinks', l.left - 6, l.water + this.fontSize * 2.2, C.cyan, 'right');
  }

  private pathPoint(points: Point[], progress: number): Point {
    if (points.length < 2) return points[0] ?? {x: 0, y: 0};
    const lengths: number[] = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      lengths.push(length);
      total += length;
    }
    let distance = clamp(progress, 0, 1) * total;
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i] || i === lengths.length - 1) {
        const p = lengths[i] > 0 ? distance / lengths[i] : 0;
        return {
          x: points[i].x + (points[i + 1].x - points[i].x) * p,
          y: points[i].y + (points[i + 1].y - points[i].y) * p,
        };
      }
      distance -= lengths[i];
    }
    return points[points.length - 1];
  }

  private drawSwitch(): boolean {
    const ctx = this.ctx!;
    const l = this.layout;
    const cycle = this.time % 5.1;
    const reached = cycle >= 1.6;
    const bend = smooth((cycle - 1.6) / 0.22);
    const click = cycle >= 1.6 && cycle < 3.1;

    ctx.beginPath();
    l.steam.forEach((point, index) => {
      if (index) ctx.lineTo(point.x, point.y);
      else ctx.moveTo(point.x, point.y);
    });
    ctx.strokeStyle = C.dim;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    const leading = reached ? 1 : clamp(cycle / 1.6, 0, 1);
    const fade = reached ? clamp(1 - (cycle - 1.6) / 1.5, 0, 1) : 1;
    for (let i = 0; i < 7; i++) {
      const p = leading - i * 0.12;
      if (p < 0 || p > 1) continue;
      const a = this.pathPoint(l.steam, p);
      const b = this.pathPoint(l.steam, Math.min(1, p + 0.025));
      ctx.globalAlpha = fade * (0.55 + i * 0.06);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = C.soft;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (cycle < 3.1) {
      for (let i = 0; i < 7; i++) {
        const p = (cycle * 0.36 + i / 7) % 1;
        const x = l.left + 30 + ((i * 47) % Math.max(36, l.right - l.left - 60));
        const y = l.floor - 8 - p * (l.floor - l.water - 10);
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + p * 2.2, 0, PI2);
        ctx.strokeStyle = C.cyan;
        ctx.globalAlpha = 0.45 + p * 0.4;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const circuitY = l.switchY + 4;
    const gap = 9 + bend * 10;
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(l.left + (l.right - l.left) * 0.76, l.elementY + 5);
    ctx.lineTo(l.right + 12, circuitY);
    ctx.lineTo(l.switchX - gap, circuitY);
    ctx.moveTo(l.switchX + 10, circuitY);
    ctx.lineTo(l.handleRight - 3, circuitY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(l.switchX - 17, l.switchY - 4);
    if (bend > 0) ctx.quadraticCurveTo(l.switchX, l.switchY - 18 - bend * 7, l.switchX + 15, l.switchY - 7 - bend * 9);
    else ctx.lineTo(l.switchX + 15, l.switchY - 4);
    glowStroke(ctx, reached ? C.green : C.white, 2.4);

    this.label('steam tube', l.right + 18, l.top - 4, C.soft, 'left');
    this.label('switch', l.switchX - 23, l.switchY - 12, C.soft, 'right');
    if (click) this.label('click', l.switchX - 8, l.switchY + this.fontSize + 8, C.green, 'right');
    return !reached;
  }

  frame(dt: number): Readout[] {
    const ctx = this.ctx;
    if (!ctx) return [];
    this.time += Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
    clear(ctx, this.w, this.h);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.drawVessel();

    let readouts: Readout[];
    if (this.step === 1) {
      this.drawElement(true);
      const l = this.layout;
      const center = l.left + (l.right - l.left) * 0.53;
      arrow(ctx, center - 29, l.floor - 1, center - 29, l.floor - 28, C.amber, 2.2);
      arrow(ctx, center + 29, l.floor - 1, center + 29, l.floor - 28, C.amber, 2.2);
      this.label('element', center + (l.right - l.left) * 0.25, l.elementY + this.fontSize + 4, C.amber);
      readouts = [{label: 'Power', value: '2000 W'}];
    } else if (this.step === 2) {
      this.drawElement(true, true);
      this.drawMovingWater();
      this.drawVessel();
      const temperature = Math.min(100, 20 + this.time * 4);
      readouts = [{label: 'Water', value: `${Math.round(temperature)} C`}];
    } else {
      const on = this.drawSwitch();
      this.drawElement(on, false);
      readouts = [{label: 'Power', value: on ? 'on' : 'off'}];
    }
    ctx.restore();
    return readouts;
  }
}
