import {C} from './palette';

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Two-pass glow: a wide soft stroke then a thin bright one (cheaper than shadowBlur). */
export function glowStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  width = 3,
  alpha = 1,
): void {
  const prev = ctx.globalAlpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = prev * 0.22 * alpha;
  ctx.lineWidth = width * 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = prev * alpha;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = prev;
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * 0.25;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = prev;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export function arrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width = 3,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 3) return;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(11, len * 0.5);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1 - ux * head - uy * head * 0.55, y1 - uy * head + ux * head * 0.55);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1 - ux * head + uy * head * 0.55, y1 - uy * head - ux * head * 0.55);
  glowStroke(ctx, color, width);
}

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, w, h);
}

export function dashed(ctx: CanvasRenderingContext2D, on: number, off: number): void {
  ctx.setLineDash([on, off]);
}

export function solid(ctx: CanvasRenderingContext2D): void {
  ctx.setLineDash([]);
}

export const fmt = (v: number, d = 1): string => v.toFixed(d);
export { C };
