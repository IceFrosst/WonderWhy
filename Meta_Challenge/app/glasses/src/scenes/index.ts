import {BallScene} from './ball';
import {BicycleScene} from './bicycle';
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
};

/** Returns null for `unknown` or any id without a scene. */
export function createScene(id: string): Scene | null {
  const f = FACTORIES[id];
  return f ? f() : null;
}
