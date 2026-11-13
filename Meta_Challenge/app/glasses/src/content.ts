import objectsJson from '../../shared/objects.json';

import {BALL_BOUNCE} from './content/ball_bounce';
import {PHONE_LAYERS} from './content/phone';

export type Step = number;

/** One scene with its own steps. An object can have several chapters (ball: trajectory, then bounce). */
export interface Chapter {
  /** Scene factory id in scenes/index.ts. */
  scene: string;
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

type Extra = Omit<ObjectInfo, 'id' | 'label' | 'concept'>;
/** Legacy single-chapter content: scene id = object id. */
function one(id: string, e: {tagline: string; answer: string; hint: string; captions: string[]}): Extra {
  return {tagline: e.tagline, answer: e.answer, chapters: [{scene: id, title: e.tagline, hint: e.hint, captions: e.captions}]};
}

interface RawObject {
  id: string;
  label: string;
  concept: string;
}

const raw = (objectsJson as {objects: RawObject[]}).objects;

// Content for the prerendered library. Keys must match shared/objects.json ids.
const LEGACY: Record<string, {tagline: string; answer: string; hint: string; captions: string[]}> = {
  ball: {
    tagline: 'Projectile motion',
    answer: 'Gravity bends the path into a curve.',
    hint: 'Left/right: angle. Up/down: speed.',
    captions: [
      'Gravity pulls the ball down all the time, so its path curves into a parabola.',
      'Sideways speed never changes. Only the up-and-down speed does, because gravity acts down.',
      'Air drag slows the ball, so the best angle drops below 45 degrees. Grey = no air.',
    ],
  },
  guitar: {
    tagline: 'Standing waves',
    answer: 'A shorter string vibrates faster, so the note is higher.',
    hint: 'Left/right: fret. Up/down: tension.',
    captions: [
      'Pressing a fret shortens the string. Half the length gives double the frequency: f = v / 2L.',
      'A string also vibrates in whole-number patterns: harmonics n = 1, 2, 3 at f, 2f, 3f.',
      'Wave speed depends on tension T and mass per length: f = (1/2L) sqrt(T/mu). Tighter = higher.',
    ],
  },
  bicycle: {
    tagline: 'Gear ratio',
    answer: 'A big front gear and small back gear trade force for speed.',
    hint: 'Left/right: rear gear teeth.',
    captions: [
      'The chain links two gears. Gear ratio = front teeth / rear teeth.',
      'Each pedal turn pulls the chain by the front teeth count, so the wheel turns by the ratio.',
      'Energy is conserved: a higher ratio gives more speed per pedal turn but less push at the wheel.',
    ],
  },
  kettle: {
    tagline: 'Convection and boiling',
    answer: 'Hot water rises, cool water sinks, bubbles are vapour.',
    hint: 'Left/right: heat.',
    captions: [
      'Heated water expands and gets lighter, so it rises in the middle and sinks at the sides.',
      'Hot spots at the bottom let vapour bubbles form (nucleation), then they rise and burst.',
      'At 100 C extra energy goes into turning water to vapour, not heating it. That is latent heat.',
    ],
  },
  pendulum: {
    tagline: 'Swing time',
    answer: 'Swing time depends on length, not weight.',
    hint: 'Left/right: length.',
    captions: [
      'One swing takes T = 2 pi sqrt(L/g). A longer string swings more slowly.',
      'The angle follows a smooth sine wave. Four times the length gives double the period.',
      'Mass cancels out: two bobs of different mass on equal strings swing together.',
    ],
  },
};

const EXTRA: Record<string, Extra> = Object.fromEntries(Object.entries(LEGACY).map(([id, e]) => [id, one(id, e)]));
// Multi-chapter objects.
EXTRA.ball = {...EXTRA.ball, chapters: [...EXTRA.ball.chapters, BALL_BOUNCE]};
EXTRA.phone = {tagline: 'What is inside', answer: PHONE_LAYERS.answer, chapters: [PHONE_LAYERS.chapter]};

export const OBJECTS: ObjectInfo[] = raw.map(o => ({
  id: o.id,
  label: o.label,
  concept: o.concept,
  ...(EXTRA[o.id] ?? {tagline: o.concept, answer: o.concept, chapters: []}),
}));

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
