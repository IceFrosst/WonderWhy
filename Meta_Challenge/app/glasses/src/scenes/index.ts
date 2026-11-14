import {BallScene} from './ball';
import {BicycleScene} from './bicycle';
import {BounceScene} from './bounce';
import {CurveScene} from './curve';
import {KettleCutawayScene} from './cutaway';
import {ExplodedScene} from './exploded';
import {FlowScene} from './flow';
import {PHONE_SPEC} from './specs/phone';
import {GuitarScene} from './guitar';
import {KettleScene} from './kettle';
import {NumberScene} from './number';
import {PendulumScene} from './pendulum';
import {parseCurveSpec, parseFlowSpec, parseNumberSpec, parseZoomSpec} from './specs/types';
import type {Scene} from './types';
import {ZoomScene} from './zoom';

export type {Readout, Scene, Step} from './types';

const FACTORIES: Record<string, (spec?: unknown) => Scene | null> = {
  ball: () => new BallScene(),
  guitar: () => new GuitarScene(),
  bicycle: () => new BicycleScene(),
  kettle: () => new KettleScene(),
  'kettle-cutaway': () => new KettleCutawayScene(),
  pendulum: () => new PendulumScene(),
  bounce: () => new BounceScene(),
  'phone-exploded': () => new ExplodedScene(PHONE_SPEC),
  curve: spec => {
    const s = parseCurveSpec(spec);
    return s ? new CurveScene(s) : null;
  },
  flow: spec => {
    const s = parseFlowSpec(spec);
    return s ? new FlowScene(s) : null;
  },
  number: spec => {
    const s = parseNumberSpec(spec);
    return s ? new NumberScene(s) : null;
  },
  zoom: spec => {
    const s = parseZoomSpec(spec);
    return s ? new ZoomScene(s) : null;
  },
};

/**
 * Scene factory id (see Chapter.scene). `spec` is the chapter's drawing data from
 * shared/objects.json for data-driven scenes (curve, flow, number, zoom); hand-written scenes ignore it.
 * Returns null for unknown ids or a spec that does not validate.
 */
export function createScene(id: string, spec?: unknown): Scene | null {
  const f = FACTORIES[id];
  return f ? f(spec) : null;
}
