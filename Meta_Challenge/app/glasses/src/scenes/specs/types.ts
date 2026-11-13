import type {C} from '../palette';

export type ExplodedShape = 'slab' | 'frame' | 'grid' | 'cells' | 'chips' | 'coil' | 'lens';
export type ExplodedColor = keyof typeof C;

export interface ExplodedLayer {
  id: string;
  name: string;
  /** One plain sentence describing the part's job. */
  role: string;
  color: ExplodedColor;
  shape: ExplodedShape;
  /** Fraction removed from each edge of rect (or the whole footprint). */
  inset?: number;
  /** Thickness in the same relative units as the footprint. */
  thickness?: number;
  /** Normalised sub-area of the footprint, measured from its top-left corner. */
  rect?: {x: number; y: number; w: number; h: number};
}

/** Plain JSON data. Layers run from the front/top face to the back. */
export interface ExplodedSpec {
  object: string;
  footprint: {w: number; d: number};
  thicknessLabel?: string;
  layers: ExplodedLayer[];
  steps: Array<{explode: number; focus: string[]}>;
}

const SHAPES: readonly string[] = ['slab', 'frame', 'grid', 'cells', 'chips', 'coil', 'lens'];
const COLORS: readonly string[] = ['white', 'soft', 'cyan', 'amber', 'green', 'pink', 'hot', 'dim', 'faint'];
const bounded = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const number = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const text = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/** Validate untrusted JSON and copy only recognised data; never mutate the input. */
export function parseExplodedSpec(x: unknown): ExplodedSpec | null {
  if (!record(x) || !text(x.object) || !record(x.footprint)) return null;
  const footprint = x.footprint;
  if (!number(footprint.w) || !number(footprint.d)) return null;
  if (!Array.isArray(x.layers) || !x.layers.length || !Array.isArray(x.steps) || !x.steps.length) return null;
  if (x.thicknessLabel !== undefined && !text(x.thicknessLabel)) return null;

  const layers: ExplodedLayer[] = [];
  const ids = new Set<string>();
  for (const item of x.layers.slice(0, 12)) {
    if (!record(item) || !text(item.id) || !text(item.name) || !text(item.role)) return null;
    if (ids.has(item.id) || typeof item.shape !== 'string' || typeof item.color !== 'string') return null;
    ids.add(item.id);
    const layer: ExplodedLayer = {
      id: item.id,
      name: item.name,
      role: item.role,
      color: COLORS.includes(item.color) ? item.color as ExplodedColor : 'cyan',
      shape: SHAPES.includes(item.shape) ? item.shape as ExplodedShape : 'slab',
    };
    if (item.inset !== undefined) {
      if (!number(item.inset)) return null;
      layer.inset = bounded(item.inset, 0, 0.4);
    }
    if (item.thickness !== undefined) {
      if (!number(item.thickness)) return null;
      layer.thickness = bounded(item.thickness, 0.001, 0.1);
    }
    if (item.rect !== undefined) {
      if (!record(item.rect)) return null;
      const r = item.rect;
      if (!number(r.x) || !number(r.y) || !number(r.w) || !number(r.h)) return null;
      const rx = bounded(r.x, 0, 0.99);
      const ry = bounded(r.y, 0, 0.99);
      layer.rect = {x: rx, y: ry, w: bounded(r.w, 0.01, 1 - rx), h: bounded(r.h, 0.01, 1 - ry)};
    }
    layers.push(layer);
  }

  const steps: ExplodedSpec['steps'] = [];
  for (const item of x.steps) {
    if (!record(item) || !number(item.explode) || !Array.isArray(item.focus)) return null;
    if (!item.focus.every(text)) return null;
    // References to truncated or unknown layers cannot focus a visible part.
    const focus = [...new Set(item.focus.filter(id => ids.has(id)))];
    steps.push({explode: bounded(item.explode, 0, 1), focus});
  }
  return {
    object: x.object,
    footprint: {w: bounded(footprint.w, 0.1, 4), d: bounded(footprint.d, 0.1, 4)},
    ...(x.thicknessLabel === undefined ? {} : {thicknessLabel: x.thicknessLabel}),
    layers,
    steps,
  };
}
