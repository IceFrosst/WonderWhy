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
}

export interface ObjectInfo {
  id: string;
  label: string;
  concept: string;
  tagline: string;
  answer: string;
  chapters: Chapter[];
}

export const OBJECTS: ObjectInfo[] = objectsJson.objects;

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
