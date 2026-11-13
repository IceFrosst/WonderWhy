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

const FACTORIES: Record<string, () => Scene> = {
  ball: () => new BallScene(),
  guitar: () => new GuitarScene(),
  bicycle: () => new BicycleScene(),
  kettle: () => new KettleScene(),
  pendulum: () => new PendulumScene(),
  bounce: () => new BounceScene(),
  'phone-exploded': () => new ExplodedScene(PHONE_SPEC),
};

/** Scene factory id (see Chapter.scene). Returns null for unknown ids. */
export function createScene(id: string): Scene | null {
  const f = FACTORIES[id];
  return f ? f() : null;
}
