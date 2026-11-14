import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateModel3d } from '../model3d.js';
import { validateSketch } from '../sketch.js';
import { start } from '../server.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/sketch-stapler.json', import.meta.url), 'utf8'));
const clone = (value) => structuredClone(value);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

function basePart(fields = {}) {
  return {
    id: 'part', label: 'Part', prim: 'sphere', r: 1,
    pos: [0, 0, 0], rot: [0, 0, 0], scale: 1, role: 'object', explode: [0, 0, 0],
    ...fields,
  };
}

function baseBeat(fields = {}) {
  return { camera: { yaw: 0, pitch: 0, zoom: 1, target: null }, ...fields };
}

function spec(part = basePart(), beat = baseBeat()) {
  return { parts: [part], beats: [beat] };
}

test('validateModel3d accepts and detaches the stapler fixture', () => {
  const source = fixture.chapters[0].spec;
  const clean = validateModel3d(source, fixture.chapters[0].captions.length);
  assert.ok(clean); assert.notEqual(clean, source);
  assert.equal(clean.parts.length, 13); assert.equal(clean.beats.length, 5);
  assert.equal(clean.parts.find((part) => part.id === 'pusher_spring').prim, 'helix');
  assert.equal(clean.beats[2].fx[0].type, 'arrow');
});

test('validateModel3d accepts every primitive with its required fields', () => {
  const cases = [
    { prim: 'box', size: [1, 2, 3] },
    { prim: 'cylinder', r: 1, h: 2, r2: 0.1, segments: 6 },
    { prim: 'sphere', r: 1 },
    { prim: 'torus', r: 2, tube: 0.2 },
    { prim: 'lathe', profile: [[0, 0], [2, 1]] },
    { prim: 'extrude', shape: [[0, 0], [1, 0], [0, 1]], h: 1 },
    { prim: 'tube', path: [[0, 0, 0], [1, 1, 1]], r: 0.1, closed: false },
    { prim: 'gear', teeth: 6, r: 2, h: 1, toothDepth: 0.2 },
    { prim: 'helix', r: 1, h: 3, turns: 40, tube: 0.1 },
  ];
  for (const fields of cases) {
    const clean = validateModel3d(spec(basePart(fields)));
    assert.equal(clean.parts[0].prim, fields.prim);
  }
});

test('validateModel3d caps parts, beats, effects, labels, paths, and profiles', () => {
  const parts = Array.from({ length: 33 }, (_, index) => basePart({ id: `part_${index}` }));
  const beats = Array.from({ length: 7 }, () => baseBeat());
  let clean = validateModel3d({ parts, beats });
  assert.equal(clean.parts.length, 32); assert.equal(clean.beats.length, 6);

  const fx = Array.from({ length: 5 }, () => ({ type: 'trail', on: 'part' }));
  clean = validateModel3d({
    parts: ['a', 'b', 'c', 'd'].map((id) => basePart({ id })),
    beats: [baseBeat({ labels: ['a', 'b', 'c', 'd'], fx: fx.map((item) => ({ ...item, on: 'a' })) })],
  });
  assert.deepEqual(clean.beats[0].labels, ['a', 'b', 'c']); assert.equal(clean.beats[0].fx.length, 4);

  const path = Array.from({ length: 65 }, (_, index) => [index, 0, 0]);
  clean = validateModel3d(spec(basePart({ prim: 'tube', path, r: 1 })));
  assert.equal(clean.parts[0].path.length, 64);
  const profile = Array.from({ length: 65 }, (_, index) => [index, index]);
  clean = validateModel3d(spec(basePart({ prim: 'lathe', profile })));
  assert.equal(clean.parts[0].profile.length, 64);
});

test('validateModel3d enforces finite numeric, size, radius, and primitive ranges', () => {
  const invalidParts = [
    basePart({ pos: [10_001, 0, 0] }),
    basePart({ r: NaN }),
    basePart({ r: 0 }),
    basePart({ r: 10_001 }),
    basePart({ prim: 'box', size: [1, 0, 1] }),
    basePart({ prim: 'cylinder', r: 1, h: 1, segments: 5 }),
    basePart({ prim: 'cylinder', r: 1, h: 1, segments: 49 }),
    basePart({ prim: 'cylinder', r: 1, r2: 0, h: 1, segments: 12 }),
    basePart({ prim: 'gear', teeth: 5, r: 1, h: 1 }),
    basePart({ prim: 'gear', teeth: 81, r: 1, h: 1 }),
    basePart({ prim: 'helix', r: 1, h: 1, turns: 41, tube: 0.1 }),
  ];
  for (const part of invalidParts) assert.equal(validateModel3d(spec(part)), null);
});

test('validateModel3d enforces ids, labels, roles, and earlier parents', () => {
  assert.equal(validateModel3d(spec(basePart({ id: 'Bad ID' }))), null);
  assert.equal(validateModel3d(spec(basePart({ id: 'a'.repeat(33) }))), null);
  assert.equal(validateModel3d(spec(basePart({ role: 'main' }))), null);

  let clean = validateModel3d(spec(basePart({ label: 'L'.repeat(30) })));
  assert.equal(clean.parts[0].label.length, 24); assert.match(clean.parts[0].label, /\u2026$/);

  clean = validateModel3d({
    parts: [basePart({ id: 'parent' }), basePart({ id: 'child', parent: 'parent' }), basePart({ id: 'child' })],
    beats: [baseBeat()],
  });
  assert.deepEqual(clean.parts.map((part) => part.id), ['parent', 'child']);
  assert.equal(clean.parts[1].parent, 'parent');
  assert.equal(validateModel3d(spec(basePart({ parent: 'later' }))), null);
});

test('validateModel3d enforces all animation shapes', () => {
  const animations = [
    { spin: { axis: [0, 1, 0], rpm: -30 } },
    { swing: { axis: [0, 0, 1], deg: 20, hz: 0.5 } },
    { shake: { axis: [1, 0, 0], amp: 0.3, hz: 4 } },
  ];
  for (const anim of animations) assert.deepEqual(validateModel3d(spec(basePart({ anim }))).parts[0].anim, anim);
  assert.equal(validateModel3d(spec(basePart({ anim: { spin: { axis: [0, 0, 0], rpm: 1 } } }))), null);
  assert.equal(validateModel3d(spec(basePart({ anim: { spin: { axis: [0, 1, 0], rpm: 1 }, shake: {} } }))), null);
});

test('validateModel3d enforces camera and beat ranges', () => {
  const cases = [
    { camera: { yaw: 0, pitch: -90, zoom: 1 } },
    { camera: { yaw: 0, pitch: 90, zoom: 1 } },
    { camera: { yaw: 0, pitch: 0, zoom: 0.29 } },
    { camera: { yaw: 0, pitch: 0, zoom: 6.01 } },
    { ...baseBeat(), turn: 20.1 },
    { ...baseBeat(), explode: 1.01 },
    { ...baseBeat(), dur: 2.99 },
    { ...baseBeat(), dur: 12.01 },
  ];
  for (const beat of cases) assert.equal(validateModel3d(spec(basePart(), beat)), null);
  assert.ok(validateModel3d(spec(basePart(), baseBeat({ turn: 20, explode: 1, dur: 12 }))));
});

test('validateModel3d filters beat lists to known unique ids and three labels', () => {
  const clean = validateModel3d(spec(basePart(), baseBeat({
    focus: ['missing', 'part', 'part'], ghost: ['missing'], labels: ['missing', 'part', 'part', 'part'], play: ['part', 'missing'],
  })));
  assert.deepEqual(clean.beats[0].focus, ['part']);
  assert.deepEqual(clean.beats[0].ghost, []);
  assert.deepEqual(clean.beats[0].labels, ['part']);
  assert.deepEqual(clean.beats[0].play, ['part']);
});

test('validateModel3d accepts every effect shape and drops bad or unknown effects', () => {
  const effects = [
    { type: 'arrow', from: 'part', dir: [0, -1, 0], len: 2, role: 'energy', label: 'force' },
    { type: 'flow', path: [[0, 0, 0], [1, 0, 0]], role: 'actor', speed: 1, count: 3, label: 'flow', closed: false },
    { type: 'heat', on: 'part', role: 'loss' },
    { type: 'waves', at: 'part', role: 'actor', hz: 2 },
    { type: 'trail', on: 'part' },
    { type: 'dim', on: 'part', text: '5 cm' },
  ];
  for (const effect of effects) {
    const clean = validateModel3d(spec(basePart(), baseBeat({ fx: [effect] })));
    assert.deepEqual(clean.beats[0].fx, [effect]);
  }
  const clean = validateModel3d(spec(basePart(), baseBeat({ fx: [
    { type: 'unknown', nested: { bad: NaN } },
    { type: 'arrow', from: 'missing', dir: [0, 1, 0], len: 1, role: 'energy', label: 'bad' },
    { type: 'trail', on: 'part', extra: { junk: true } },
  ] })));
  assert.deepEqual(clean.beats[0].fx, [{ type: 'trail', on: 'part' }]);
});

test('validateModel3d drops unknown primitives and fields while retaining survivors', () => {
  const source = {
    parts: [basePart({ id: 'bad', prim: 'mesh', nested: { value: NaN } }), basePart({ id: 'good', extra: 'drop' })],
    beats: [baseBeat({ extra: { deep: [NaN] } })],
    constructor: { prototype: { polluted: true } },
  };
  const clean = validateModel3d(source);
  assert.deepEqual(clean.parts.map((part) => part.id), ['good']);
  assert.equal('extra' in clean.parts[0], false); assert.equal(Object.hasOwn(clean, 'constructor'), false);
});

test('validateModel3d rejects empty survivors and caption count mismatches', () => {
  assert.equal(validateModel3d({ parts: [], beats: [baseBeat()] }), null);
  assert.equal(validateModel3d({ parts: [basePart()], beats: [] }), null);
  assert.equal(validateModel3d(spec(), 2), null);
  assert.ok(validateModel3d(spec(), 1));
});

test('validateModel3d handles prototype keys, huge sparse arrays, NaN, and a parent cycle', () => {
  const hostile = JSON.parse('{"parts":[],"beats":[],"__proto__":{"polluted":true}}');
  hostile.parts.length = 1_000_000;
  hostile.parts[0] = basePart({ nested: { huge: new Array(1000), value: NaN } });
  hostile.beats.length = 1_000_000;
  hostile.beats[0] = baseBeat();
  const clean = validateModel3d(hostile);
  assert.equal(clean.parts.length, 1); assert.equal(clean.beats.length, 1);
  assert.equal(Object.hasOwn(clean, '__proto__'), false); assert.equal('nested' in clean.parts[0], false);

  const cycle = {
    parts: [basePart({ id: 'a', parent: 'b' }), basePart({ id: 'b', parent: 'a' })],
    beats: [baseBeat()],
  };
  assert.doesNotThrow(() => assert.equal(validateModel3d(cycle), null));
  assert.equal(validateModel3d(spec(basePart({ r: Infinity }))), null);
});

test('an invalid explore chapter is dropped without dropping the sketch', () => {
  const value = clone(fixture);
  value.chapters[0].spec.beats[0].camera.zoom = 7;
  const clean = validateSketch(value);
  assert.ok(clean); assert.deepEqual(clean.chapters.map((chapter) => chapter.lens), ['flow', 'number']);
});

test('fixture /detect with waitSketch returns the validated explore chapter', async (t) => {
  const app = await start({
    port: 0,
    heartbeatMs: 60_000,
    provider: 'fake',
    sketchProvider: 'fixture',
    detectFn: async () => ({ objectId: 'unknown', confidence: 0.2, answer: 'A stapler.', model: 'test', provider: 'fake', detectMs: 1 }),
  });
  t.after(() => app.close());
  const response = await fetch(`http://localhost:${app.port}/detect`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reqId: 'model3d-fixture', imageBase64: jpeg, waitSketch: true }),
  });
  const show = await response.json();
  assert.equal(response.status, 200); assert.equal(show.sketchPending, undefined);
  assert.equal(show.sketch.chapters[0].lens, 'explore');
  assert.equal(show.sketch.chapters[0].scene, 'model3d');
  assert.equal(show.sketch.chapters[0].spec.parts.length, 13);
  assert.equal(show.sketch.chapters[0].spec.beats.length, show.sketch.chapters[0].captions.length);
});

test('optional part fields take their defaults when absent', () => {
  const spec = validateModel3d({
    parts: [{ id: 'ball', prim: 'sphere', r: 5 }],
    beats: [{ camera: { yaw: 0, pitch: 0, zoom: 1 } }],
  });
  assert.ok(spec, 'a part with only id, prim and its size is valid');
  const [ball] = spec.parts;
  assert.deepEqual(ball.pos, [0, 0, 0]);
  assert.deepEqual(ball.rot, [0, 0, 0]);
  assert.deepEqual(ball.explode, [0, 0, 0]);
  assert.equal(ball.scale, 1);
  assert.equal(ball.role, 'object');
  assert.equal(ball.label, '');
  assert.equal(validateModel3d({ parts: [{ id: 'b', prim: 'sphere', r: 5, pos: 'up' }], beats: [{}] }), null, 'a present but invalid field still rejects');
});
