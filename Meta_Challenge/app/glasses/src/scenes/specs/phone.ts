import type {ExplodedSpec} from './types';

// A teaching schematic: real phones pack several of these parts side by side.
export const PHONE_SPEC: ExplodedSpec = {
  object: 'phone',
  footprint: {w: 0.5, d: 1},
  thicknessLabel: '~8 mm',
  layers: [
    {id: 'glass', name: 'Cover glass', role: 'Protects the screen while letting light through.', color: 'soft', shape: 'slab', thickness: 0.003},
    {id: 'touch', name: 'Touch sensor', role: 'An electrode grid detects changes in capacitance from your finger.', color: 'cyan', shape: 'grid', inset: 0.035, thickness: 0.002},
    {id: 'oled', name: 'OLED display', role: 'Each pixel makes its own light and can switch off for black.', color: 'pink', shape: 'cells', inset: 0.04, thickness: 0.003},
    {id: 'frame', name: 'Mid-frame', role: 'Supports the parts and helps spread heat.', color: 'soft', shape: 'frame', thickness: 0.009},
    {id: 'logic', name: 'Logic board', role: 'Processor, memory and radio chips run apps and connect the phone.', color: 'green', shape: 'chips', thickness: 0.006, rect: {x: 0.08, y: 0.06, w: 0.84, h: 0.24}},
    {id: 'battery', name: 'Battery', role: 'Stores energy as lithium ions move between two electrode layers.', color: 'amber', shape: 'slab', thickness: 0.022, rect: {x: 0.08, y: 0.33, w: 0.84, h: 0.6}},
    {id: 'coil', name: 'Charging coil', role: 'Receives energy from a changing magnetic field during wireless charging.', color: 'cyan', shape: 'coil', thickness: 0.002, rect: {x: 0.14, y: 0.32, w: 0.72, h: 0.54}},
    {id: 'camera', name: 'Camera module', role: 'Several lenses focus light onto a tiny image sensor.', color: 'hot', shape: 'lens', thickness: 0.006, rect: {x: 0.08, y: 0.06, w: 0.28, h: 0.2}},
    {id: 'back', name: 'Back glass', role: 'Closes and protects the back of the phone.', color: 'soft', shape: 'slab', thickness: 0.003},
  ],
  steps: [
    {explode: 0, focus: []},
    {explode: 1, focus: ['glass', 'touch']},
    {explode: 1, focus: ['oled']},
    {explode: 1, focus: ['logic']},
    {explode: 1, focus: ['battery']},
    {explode: 1, focus: ['coil', 'camera', 'back']},
  ],
};
