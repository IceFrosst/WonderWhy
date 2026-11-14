import {BallScene} from './ball';
import {BicycleScene} from './bicycle';
import {BounceScene} from './bounce';
import {ExplodedScene} from './exploded';
import {PHONE_SPEC} from './specs/phone';
import {GuitarScene} from './guitar';
import {KettleScene} from './kettle';
import {PendulumScene} from './pendulum';
import type {Scene} from './types';

export type {Readout, Scene, Step} from './types';

const FACTORIES: Record<string, (spec?: unknown) => Scene | null> = {
  ball: () => new BallScene(),
  guitar: () => new GuitarScene(),
  bicycle: () => new BicycleScene(),
  kettle: () => new KettleScene(),
  pendulum: () => new PendulumScene(),
  bounce: () => new BounceScene(),
  'phone-exploded': () => new ExplodedScene(PHONE_SPEC),
};

/**
 * Scene factory id (see Chapter.scene). `spec` is the chapter's drawing data from
 * shared/objects.json for data-driven scenes (flow, number); hand-written scenes ignore it.
 * Returns null for unknown ids or a spec that does not validate.
 */
export function createScene(id: string, spec?: unknown): Scene | null {
  const f = FACTORIES[id];
  return f ? f(spec) : null;
}
