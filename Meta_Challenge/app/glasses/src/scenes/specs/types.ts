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

export type FlowKind = 'energy' | 'water' | 'signal' | 'force';

export interface FlowNode {
  id: string;
  label: string;
  sub?: string;
}

export interface FlowLoss {
  at: string;
  label: string;
  share: number;
}

export interface FlowSpec {
  kind: FlowKind;
  nodes: FlowNode[];
  losses: FlowLoss[];
  steps: Array<{upTo: number; focus: string[]; losses: boolean}>;
}

export interface NumberValue {
  value: number;
  unit: string;
  label: string;
  decimals?: number;
}

export interface NumberRow extends NumberValue {
  scales?: boolean;
  of?: number;
}

export interface NumberKnob {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface NumberSpec {
  headline: NumberValue;
  rows: NumberRow[];
  compare?: NumberValue;
  knob?: NumberKnob;
  steps: Array<{show: 'headline' | 'rows' | 'compare'}>;
}

const FLOW_KINDS: readonly string[] = ['energy', 'water', 'signal', 'force'];
const NUMBER_SHOWS: readonly string[] = ['headline', 'rows', 'compare'];
const MAX_VALUE = 1_000_000_000;
const shortText = (x: unknown): string | null => {
  if (!text(x)) return null;
  return x.trim().slice(0, 48);
};
const safeValue = (x: number): number => bounded(x, -MAX_VALUE, MAX_VALUE);
const decimals = (x: unknown): number | null => {
  if (x === undefined) return null;
  return number(x) ? Math.round(bounded(x, 0, 6)) : NaN;
};

/** Validate a serialised left-to-right flow diagram. */
export function parseFlowSpec(x: unknown): FlowSpec | null {
  if (!record(x) || typeof x.kind !== 'string' || !FLOW_KINDS.includes(x.kind)) return null;
  if (!Array.isArray(x.nodes) || x.nodes.length < 2 || !Array.isArray(x.losses) || !Array.isArray(x.steps) || !x.steps.length) return null;

  const nodes: FlowNode[] = [];
  const ids = new Set<string>();
  for (const item of x.nodes.slice(0, 6)) {
    if (!record(item)) return null;
    const id = shortText(item.id);
    const label = shortText(item.label);
    const sub = item.sub === undefined ? null : shortText(item.sub);
    if (!id || !label || (item.sub !== undefined && !sub) || ids.has(id)) return null;
    ids.add(id);
    nodes.push({id, label, ...(sub === null ? {} : {sub})});
  }
  if (nodes.length < 2) return null;

  const losses: FlowLoss[] = [];
  for (const item of x.losses.slice(0, 3)) {
    if (!record(item) || !number(item.share)) return null;
    const at = shortText(item.at);
    const label = shortText(item.label);
    if (!at || !label) return null;
    if (ids.has(at)) losses.push({at, label, share: bounded(item.share, 0, 1)});
  }

  const steps: FlowSpec['steps'] = [];
  for (const item of x.steps) {
    if (!record(item) || !number(item.upTo) || !Array.isArray(item.focus) || typeof item.losses !== 'boolean') return null;
    const focus: string[] = [];
    for (const raw of item.focus) {
      const id = shortText(raw);
      if (!id) return null;
      if (ids.has(id) && !focus.includes(id)) focus.push(id);
    }
    steps.push({
      upTo: Math.round(bounded(item.upTo, 1, nodes.length)),
      focus,
      losses: item.losses,
    });
  }
  return {kind: x.kind as FlowKind, nodes, losses, steps};
}

function parseNumberValue(x: unknown): NumberValue | null {
  if (!record(x) || !number(x.value)) return null;
  const unit = shortText(x.unit);
  const label = shortText(x.label);
  const places = decimals(x.decimals);
  if (!unit || !label || Number.isNaN(places)) return null;
  return {
    value: safeValue(x.value),
    unit,
    label,
    ...(places === null ? {} : {decimals: places}),
  };
}

/** Validate a serialised headline/rows/comparison number card. */
export function parseNumberSpec(x: unknown): NumberSpec | null {
  if (!record(x) || !Array.isArray(x.rows) || !Array.isArray(x.steps) || !x.steps.length) return null;
  const headline = parseNumberValue(x.headline);
  if (!headline) return null;

  const rows: NumberRow[] = [];
  for (const item of x.rows.slice(0, 4)) {
    const row = parseNumberValue(item);
    if (!row || !record(item)) return null;
    if (item.scales !== undefined && typeof item.scales !== 'boolean') return null;
    if (item.of !== undefined && (!number(item.of) || item.of <= 0)) return null;
    rows.push({
      ...row,
      ...(item.scales === undefined ? {} : {scales: item.scales}),
      ...(item.of === undefined ? {} : {of: bounded(item.of, 0.000001, MAX_VALUE)}),
    });
  }

  let compare: NumberValue | undefined;
  if (x.compare !== undefined) {
    compare = parseNumberValue(x.compare) ?? undefined;
    if (!compare) return null;
  }

  let knob: NumberKnob | undefined;
  if (x.knob !== undefined) {
    if (!record(x.knob)) return null;
    const k = x.knob;
    const label = shortText(k.label);
    const unit = shortText(k.unit);
    if (!label || !unit || !number(k.min) || !number(k.max) || !number(k.step) || !number(k.value)) return null;
    const min = safeValue(k.min);
    const max = safeValue(k.max);
    if (min >= max || k.step <= 0) return null;
    knob = {
      label,
      unit,
      min,
      max,
      step: bounded(k.step, 0.000001, max - min),
      value: bounded(k.value, min, max),
    };
    if (knob.value === 0) return null;
  }

  const steps: NumberSpec['steps'] = [];
  for (const item of x.steps) {
    if (!record(item) || typeof item.show !== 'string' || !NUMBER_SHOWS.includes(item.show)) return null;
    if (item.show === 'compare' && !compare) return null;
    steps.push({show: item.show as NumberSpec['steps'][number]['show']});
  }
  return {headline, rows, steps, ...(compare ? {compare} : {}), ...(knob ? {knob} : {})};
}

export interface CurveAxis {
  label: string;
  unit: string;
  decimals?: number;
}

export interface CurveXAxis extends CurveAxis {
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface CurveSeries {
  name: string;
  role: 'main' | 'other';
  points: Array<[number, number]>;
}

export interface CurveMark {
  x: number;
  label: string;
}

export interface CurveSpec {
  x: CurveXAxis;
  y: CurveAxis;
  series: CurveSeries[];
  marks: CurveMark[];
  steps: Array<{series: string[]}>;
}

const curveUnit = (x: unknown): string | null => {
  if (typeof x !== 'string') return null;
  return x.trim().slice(0, 48);
};

function parseCurveDecimals(x: unknown): number | null {
  if (x === undefined) return null;
  return number(x) ? Math.round(bounded(x, 0, 6)) : NaN;
}

/** Validate a serialised interactive curve comparison. */
export function parseCurveSpec(x: unknown): CurveSpec | null {
  if (!record(x) || !record(x.x) || !record(x.y)) return null;
  if (!Array.isArray(x.series) || x.series.length < 1 || x.series.length > 2) return null;
  if (!Array.isArray(x.marks) || !Array.isArray(x.steps) || !x.steps.length) return null;

  const xLabel = shortText(x.x.label);
  const xUnit = curveUnit(x.x.unit);
  const xDecimals = parseCurveDecimals(x.x.decimals);
  const yLabel = shortText(x.y.label);
  const yUnit = curveUnit(x.y.unit);
  const yDecimals = parseCurveDecimals(x.y.decimals);
  if (!xLabel || xUnit === null || Number.isNaN(xDecimals)
      || !yLabel || yUnit === null || Number.isNaN(yDecimals)) return null;
  if (!number(x.x.min) || !number(x.x.max) || !number(x.x.step) || !number(x.x.value)) return null;
  if (x.x.min >= x.x.max || x.x.step <= 0) return null;

  const series: CurveSeries[] = [];
  const names = new Set<string>();
  const roles = new Set<string>();
  for (const item of x.series) {
    if (!record(item)) return null;
    const name = shortText(item.name);
    if (!name || names.has(name) || (item.role !== 'main' && item.role !== 'other') || roles.has(item.role)) return null;
    if (!Array.isArray(item.points)) return null;
    const points: Array<[number, number]> = [];
    for (const point of item.points) {
      if (!Array.isArray(point) || point.length < 2 || !number(point[0]) || !number(point[1])) continue;
      points.push([point[0], point[1]]);
      if (points.length === 64) break;
    }
    if (points.length < 2) return null;
    for (let index = 1; index < points.length; index++) {
      if (points[index][0] <= points[index - 1][0]) return null;
    }
    names.add(name);
    roles.add(item.role);
    series.push({name, role: item.role, points});
  }
  if (!roles.has('main')) return null;

  const marks: CurveMark[] = [];
  for (const item of x.marks.slice(0, 3)) {
    if (!record(item) || !number(item.x)) return null;
    const label = shortText(item.label);
    if (!label) return null;
    marks.push({x: item.x, label});
  }

  const steps: CurveSpec['steps'] = [];
  const mainName = series.find(item => item.role === 'main')!.name;
  for (const item of x.steps) {
    if (!record(item) || !Array.isArray(item.series)) return null;
    const shown: string[] = [];
    for (const raw of item.series) {
      const name = shortText(raw);
      if (!name) return null;
      if (names.has(name) && !shown.includes(name)) shown.push(name);
    }
    if (!shown.includes(mainName)) return null;
    steps.push({series: shown});
  }

  return {
    x: {
      label: xLabel,
      unit: xUnit,
      min: x.x.min,
      max: x.x.max,
      step: Math.min(x.x.step, x.x.max - x.x.min),
      value: bounded(x.x.value, x.x.min, x.x.max),
      ...(xDecimals === null ? {} : {decimals: xDecimals}),
    },
    y: {
      label: yLabel,
      unit: yUnit,
      ...(yDecimals === null ? {} : {decimals: yDecimals}),
    },
    series,
    marks,
    steps,
  };
}
