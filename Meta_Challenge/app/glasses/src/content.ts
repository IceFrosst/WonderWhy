import objectsJson from '../../shared/objects.json';

export type Step = number;

/** One scene with its own steps. An object can have several chapters (ball: trajectory, then bounce). */
export interface Chapter {
  /** Scene factory id in scenes/index.ts. */
  scene: string;
  lens?: string;
  title: string;
  /** One-line answer shown under the title while this chapter plays; defaults to the object's answer. */
  lead?: string;
  hint: string;
  /** One caption per step; any length >= 1. */
  captions: string[];
  /** One entry per step: what up/down changes on that step (a scene axis), or null for nothing. */
  knobs?: Array<Knob | null>;
  /** Drawing data for data-driven scenes (flow, number). Passed to createScene. */
  spec?: unknown;
}

export interface Knob {
  axis: 'x' | 'y';
  label: string;
}

export interface ObjectInfo {
  id: string;
  label: string;
  /** One-word name for small buttons (home screen). */
  short?: string;
  concept: string;
  tagline: string;
  answer: string;
  chapters: Chapter[];
  /** Set for a generated explanation of an unknown object (never for library objects). */
  provenance?: 'sketch';
}

export const OBJECTS: ObjectInfo[] = objectsJson.objects as ObjectInfo[];

export const UNKNOWN: ObjectInfo = {
  id: 'unknown',
  label: 'Not in the library yet',
  concept: '',
  tagline: '',
  answer: '',
  chapters: [],
};

export function findObject(id: string): ObjectInfo {
  return OBJECTS.find(o => o.id === id) ?? UNKNOWN;
}

const SKETCH_LENSES = ['motion', 'inside', 'cutaway', 'flow', 'zoom', 'whatif', 'compare', 'number'];
const SKETCH_SCENES = ['flow', 'number', 'curve'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function capped(v: unknown, max: number, required: boolean): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (required && t.length === 0) return null;
  return t.slice(0, max);
}

/**
 * Validates an untrusted `sketch` from the bridge (PROTOCOL.md) and copies only known fields.
 * `spec` is kept as-is: the scene's own validator checks it when the lens is drawn.
 * Returns null for anything malformed.
 */
export function sketchToObject(sketch: unknown): ObjectInfo | null {
  if (!isRecord(sketch)) return null;
  const label = capped(sketch.label, 40, true);
  const answer = capped(sketch.answer, 120, false);
  if (label === null || answer === null) return null;
  const rawChapters = sketch.chapters;
  if (!Array.isArray(rawChapters) || rawChapters.length < 1 || rawChapters.length > 3) return null;
  const chapters: Chapter[] = [];
  for (const raw of rawChapters) {
    if (!isRecord(raw)) return null;
    if (typeof raw.lens !== 'string' || !SKETCH_LENSES.includes(raw.lens)) return null;
    if (typeof raw.scene !== 'string' || !SKETCH_SCENES.includes(raw.scene)) return null;
    const title = capped(raw.title, 40, true);
    if (title === null) return null;
    let lead: string | undefined;
    if (raw.lead !== undefined && raw.lead !== null) {
      const l = capped(raw.lead, 120, false);
      if (l === null) return null;
      lead = l || undefined;
    }
    const rawCaptions = raw.captions;
    if (!Array.isArray(rawCaptions) || rawCaptions.length < 1 || rawCaptions.length > 6) return null;
    const captions: string[] = [];
    for (const c of rawCaptions) {
      const t = capped(c, 200, true);
      if (t === null) return null;
      captions.push(t);
    }
    let knobs: Array<Knob | null>;
    if (raw.knobs === undefined || raw.knobs === null) {
      knobs = captions.map(() => null);
    } else {
      if (!Array.isArray(raw.knobs) || raw.knobs.length !== captions.length) return null;
      knobs = [];
      for (const k of raw.knobs) {
        if (k === null) {
          knobs.push(null);
          continue;
        }
        if (!isRecord(k) || (k.axis !== 'x' && k.axis !== 'y')) return null;
        const kl = capped(k.label, 40, true);
        if (kl === null) return null;
        const usable = (raw.scene === 'curve' && k.axis === 'x')
          || (raw.scene === 'number' && k.axis === 'x' && isRecord(raw.spec) && isRecord(raw.spec.knob));
        knobs.push(usable ? {axis: k.axis, label: kl} : null);
      }
    }
    chapters.push({scene: raw.scene, lens: raw.lens, title, lead, hint: '', captions, knobs, spec: raw.spec});
  }
  return {id: 'sketch', label, concept: '', tagline: '', answer, chapters, provenance: 'sketch'};
}
