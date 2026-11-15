import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { buildPrompt, detect, loadObjects, sketch as detectSketch } from '../detect.js';
import { buildSketchPrompt, parseSketchReply, validateSketch } from '../sketch.js';
import { start } from '../server.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/sketch-stapler.json', import.meta.url), 'utf8'));
const objects = loadObjects();
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const clone = (value) => structuredClone(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function librarySketch() {
  const kettle = objects.find((item) => item.id === 'kettle');
  const ball = objects.find((item) => item.id === 'ball');
  return {
    label: 'Library examples', answer: 'These chapters reuse the checked library data.', verified: true,
    chapters: [
      ...kettle.chapters.filter((item) => item.lens === 'flow' || item.lens === 'number'),
      ball.chapters.find((item) => item.lens === 'whatif'),
    ],
  };
}

test('validateSketch accepts the fixture and reusable library chapters', () => {
  const stapler = validateSketch(fixture);
  assert.ok(stapler); assert.equal(stapler.verified, false); assert.equal(stapler.chapters.length, 3);
  assert.deepEqual(stapler.chapters.map((item) => item.lens), ['explore', 'flow', 'number']);
  const library = validateSketch(librarySketch());
  assert.ok(library); assert.equal(library.verified, false); assert.deepEqual(library.chapters.map((item) => item.scene), ['flow', 'number', 'curve']);
  assert.equal('hint' in library.chapters[0], false);
});

test('validateSketch cleans text, forces unverified, and drops unknown fields', () => {
  const value = clone(fixture);
  value.label = `  ${'L'.repeat(60)}  `; value.answer = `  ${'A'.repeat(150)}  `; value.verified = true; value.extra = 'drop';
  value.chapters[1].title = ` ${'T'.repeat(50)} `; value.chapters[1].captions[0] = ` ${'C'.repeat(220)} `;
  value.chapters[1].knobs[0] = { axis: 'x', label: 'K'.repeat(30), extra: true };
  const clean = validateSketch(value);
  assert.equal(clean.label.length, 40); assert.equal(clean.answer.length, 120); assert.equal(clean.verified, false);
  assert.equal(clean.chapters[1].title.length, 40); assert.equal(clean.chapters[1].captions[0].length, 200);
  assert.deepEqual(clean.chapters[1].knobs[0], { axis: 'x', label: 'K'.repeat(23) + '\u2026' });
  assert.equal('extra' in clean, false);
});

test('validateSketch bounds curve numbers, cleans text, caps words, and requires unique lenses', () => {
  const value = librarySketch(); const curve = value.chapters[2];
  value.answer = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
  curve.title = '  Curve\u0000\n  title  ';
  curve.captions[0] = Array.from({ length: 30 }, (_, index) => `word${index}`).join(' ');
  curve.spec.x.min = -1e12; curve.spec.x.max = 1e12; curve.spec.x.step = 1e12; curve.spec.x.value = 2e12;
  curve.spec.series[0].points = [[-2e9, -3e9], [0, 0], [2e9, 3e9]];
  curve.spec.marks = [{ x: 4e9, label: '  high\u0007   mark  ' }];
  const clean = validateSketch(value);
  assert.ok(clean); assert.equal(clean.answer.split(/\s+/).length, 12); assert.match(clean.answer, /\u2026$/);
  const cleanCurve = clean.chapters[2];
  assert.equal(cleanCurve.title, 'Curve title'); assert.equal(cleanCurve.captions[0].split(/\s+/).length, 24); assert.match(cleanCurve.captions[0], /\u2026$/);
  assert.deepEqual(cleanCurve.spec.x, { label: curve.spec.x.label, unit: curve.spec.x.unit, min: -1e9, max: 1e9, step: 1e9, value: 1e9, decimals: 0 });
  assert.deepEqual(cleanCurve.spec.series[0].points, [[-1e9, -1e9], [0, 0], [1e9, 1e9]]);
  assert.deepEqual(cleanCurve.spec.marks, [{ x: 1e9, label: 'high mark' }]);

  const duplicate = clone(fixture); duplicate.chapters[2] = clone(duplicate.chapters[1]);
  assert.equal(validateSketch(duplicate), null);
});

test('validateSketch caps collection work before iterating untrusted arrays', () => {
  const value = clone(fixture);
  value.chapters[1].spec.nodes.push(...Array(1000).fill({ id: 'ignored', label: 'ignored' }));
  value.chapters[1].spec.losses.push(...Array(1000).fill({ at: value.chapters[1].spec.nodes[0].id, label: 'ignored', share: 1 }));
  const clean = validateSketch(value);
  assert.ok(clean); assert.equal(clean.chapters[1].spec.nodes.length, 6); assert.equal(clean.chapters[1].spec.losses.length, 3);
});

test('validateSketch rejects malformed sketches without throwing', () => {
  const cases = [
    null,
    { ...clone(fixture), label: ' ' },
    { ...clone(fixture), answer: '' },
    { ...clone(fixture), chapters: [] },
    { ...clone(fixture), chapters: [...clone(fixture).chapters, clone(fixture).chapters[1], clone(fixture).chapters[2]] },
    (() => { const x = clone(fixture); x.chapters[1].lens = 'inside'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].scene = 'number'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].captions = []; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].captions = Array(7).fill('caption'); x.chapters[1].spec.steps = Array(7).fill(x.chapters[1].spec.steps[0]); return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].captions.pop(); x.chapters[1].knobs.pop(); return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].knobs.pop(); return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].spec.losses[0].at = 'missing'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].spec.nodes[1].id = 'hand'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].spec.kind = 'motion'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].spec.nodes = [x.chapters[1].spec.nodes[0]]; return x; })(),
    (() => { const x = clone(fixture); x.chapters[1].spec.steps[0].upTo = Infinity; return x; })(),
    (() => { const x = clone(fixture); x.chapters[2].spec.headline.value = NaN; return x; })(),
    (() => { const x = clone(fixture); x.chapters[2].spec.steps[0].show = 'other'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[2].spec.steps[0].show = 'compare'; return x; })(),
    (() => { const x = clone(fixture); x.chapters[2].captions.pop(); return x; })(),
    (() => { const x = clone(fixture); x.chapters[2].spec.knob = { label: 'x', unit: 'm', min: 2, max: 1, step: 1, value: 1 }; return x; })(),
    (() => { const x = librarySketch(); x.chapters[2].spec.series[0].points[1][0] = x.chapters[2].spec.series[0].points[0][0]; return x; })(),
    (() => { const x = librarySketch(); x.chapters[2].spec.series[1].role = 'main'; return x; })(),
    (() => { const x = librarySketch(); x.chapters[2].spec.series[0].role = 'other'; x.chapters[2].spec.series.pop(); return x; })(),
    (() => { const x = librarySketch(); x.chapters[2].spec.x.max = Infinity; return x; })(),
    (() => { const x = librarySketch(); x.chapters[2].spec.steps[0].series = ['Moon']; return x; })(),
  ];
  assert.ok(cases.length >= 15);
  for (const value of cases) assert.doesNotThrow(() => assert.equal(validateSketch(value), null));
});

test('parseSketchReply handles fences, prose, none, and garbage', () => {
  assert.deepEqual(parseSketchReply(`\`\`\`json\n${JSON.stringify(fixture)}\n\`\`\``), validateSketch(fixture));
  assert.deepEqual(parseSketchReply(`Here is it: ${JSON.stringify(fixture)} thanks.`), validateSketch(fixture));
  assert.equal(parseSketchReply('{"none":true}'), null);
  assert.equal(parseSketchReply('not json at all'), null);
  assert.equal(parseSketchReply('{bad json}'), null);
});

test('buildSketchPrompt names the language and includes the compact 3D lamp example', () => {
  const prompt = buildSketchPrompt({ objects, lang: 'fi', hint: 'metal object' });
  assert.match(prompt, /Finnish/); assert.match(prompt, /desk lamp/); assert.match(prompt, /lower_arm/);
  assert.match(prompt, /Explore beat plan/); assert.match(prompt, /metal object/); assert.match(prompt, /\{"none":true\}/);
});

test('classifier provider request stays byte-identical and sketch gets a larger output limit', async () => {
  const originalFetch = globalThis.fetch; const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), ...init });
    const body = JSON.parse(init.body);
    const text = body.max_tokens === 300
      ? '{"objectId":"unknown","confidence":0.2,"answer":"A hint."}'
      : JSON.stringify(fixture);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }) };
  };
  try {
    const sampleObjects = [{ id: 'thing', detect_hint: 'a thing' }];
    const env = { ANTHROPIC_API_KEY: 'test-only', ANTHROPIC_MODEL: 'test-model' };
    await detect({ imageBase64: 'image', focusBase64: 'focus', objects: sampleObjects, env, provider: 'anthropic', timeoutMs: 1000 });
    const prompt = buildPrompt(sampleObjects, undefined, true, 'en');
    const expected = JSON.stringify({ model: 'test-model', max_tokens: 300, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'image' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'focus' } },
      { type: 'text', text: prompt },
    ] }] });
    assert.equal(requests[0].body, expected);
    const made = await detectSketch({ imageBase64: 'image', objects, env, provider: 'anthropic', timeoutMs: 1000 });
    assert.equal(made.sketch.label, fixture.label); assert.equal(JSON.parse(requests[1].body).max_tokens, 16000);
  } finally { globalThis.fetch = originalFetch; }
});

async function bridge(t, options = {}) {
  const detectFn = options.detectFn || (async () => ({ objectId: 'unknown', confidence: 0.2, answer: 'Classifier hint.', model: 'detect-test', provider: 'fake', detectMs: 1 }));
  const srv = await start({ port: 0, heartbeatMs: 60000, provider: 'fake', detectFn, ...options });
  t.after(() => srv.close());
  return { ...srv, base: `http://localhost:${srv.port}` };
}

function socket(port, client = 'glasses', token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`); const messages = [];
    ws.on('error', reject); ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', client, ...(token ? { token } : {}) })); resolve({ ws, messages }); });
  });
}

function nextMessage(client, predicate, timeoutMs = 1500) {
  const found = client.messages.find(predicate); if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.ws.off('message', onMessage); reject(new Error('message timeout')); }, timeoutMs);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
      if (predicate(message)) { clearTimeout(timeout); client.ws.off('message', onMessage); resolve(message); }
    };
    client.ws.on('message', onMessage);
  });
}

function post(base, body, token) {
  return fetch(base + '/detect', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-lens-token': token } : {}) }, body: JSON.stringify(body) });
}

test('feature off has no pending marker and health reports off', async (t) => {
  let calls = 0; const { base } = await bridge(t, { sketchProvider: 'off', sketchFn: async () => { calls += 1; return fixture; } });
  const show = await (await post(base, { reqId: 'off', imageBase64: jpeg })).json();
  assert.equal(show.sketchPending, undefined); assert.equal(calls, 0);
  assert.equal((await (await fetch(base + '/health')).json()).sketch, 'off');
});

test('fixture mode emits one frame, updates last, and replays the sketch', async (t) => {
  const { base, port } = await bridge(t, { sketchProvider: 'fixture' });
  const glasses = await socket(port); const phone = await socket(port, 'phone');
  const show = await (await post(base, { reqId: 'fixture', imageBase64: jpeg })).json();
  assert.equal(show.sketchPending, true);
  const frame = await nextMessage(glasses, (item) => item.type === 'sketch' && item.reqId === 'fixture');
  const phoneFrame = await nextMessage(phone, (item) => item.type === 'sketch' && item.reqId === 'fixture');
  assert.equal(frame.sketch.label, 'Desk stapler'); assert.deepEqual(phoneFrame, frame);
  await sleep(25); assert.equal(glasses.messages.filter((item) => item.type === 'sketch' && item.reqId === 'fixture').length, 1);
  const last = await (await fetch(base + '/last')).json();
  assert.equal(last.show.sketch.label, 'Desk stapler'); assert.equal(last.show.sketchPending, undefined);
  const late = await socket(port); const replay = await nextMessage(late, (item) => item.type === 'show');
  assert.equal(replay.replay, true); assert.equal(replay.sketch.label, 'Desk stapler'); assert.equal(replay.sketchPending, undefined);
  glasses.ws.close(); phone.ws.close(); late.ws.close();
});

test('failing and invalid generators emit errors and clear pending', async (t) => {
  for (const [reqId, sketchFn] of [
    ['throws', async () => { throw new Error('failed'); }],
    ['invalid', async () => ({ sketch: { label: 'bad' }, model: 'test', ms: 1 })],
  ]) {
    const app = await bridge(t, { sketchProvider: 'auto', sketchFn }); const glasses = await socket(app.port);
    const show = await (await post(app.base, { reqId, imageBase64: jpeg })).json(); assert.equal(show.sketchPending, true);
    const frame = await nextMessage(glasses, (item) => item.type === 'sketch' && item.reqId === reqId);
    assert.deepEqual(frame, { type: 'sketch', reqId, error: 'sketch_failed' });
    const last = await (await fetch(app.base + '/last')).json(); assert.equal(last.show.sketchPending, undefined);
    glasses.ws.close(); await app.close();
  }
});

test('slow generator times out with exactly one error frame', async (t) => {
  const { base, port } = await bridge(t, {
    sketchProvider: 'auto', sketchTimeoutMs: 25,
    sketchFn: async () => { await sleep(90); return { sketch: fixture, model: 'late', ms: 90 }; },
  });
  const glasses = await socket(port); await post(base, { reqId: 'slow-sketch', imageBase64: jpeg });
  const frame = await nextMessage(glasses, (item) => item.type === 'sketch' && item.reqId === 'slow-sketch');
  assert.equal(frame.error, 'sketch_failed'); await sleep(120);
  assert.equal(glasses.messages.filter((item) => item.type === 'sketch' && item.reqId === 'slow-sketch').length, 1);
  glasses.ws.close();
});

test('waitSketch returns the result and still emits WebSocket frames', async (t) => {
  const seen = [];
  const { base, port } = await bridge(t, { sketchProvider: 'auto', sketchFn: async (args) => { seen.push(args); return { sketch: fixture, model: 'test', ms: 1 }; } });
  const glasses = await socket(port);
  const show = await (await post(base, { reqId: 'wait', imageBase64: jpeg, waitSketch: true, lang: 'fi-FI' })).json();
  assert.equal(show.sketch.label, 'Desk stapler'); assert.equal(show.sketchPending, undefined); assert.equal(show.sketchError, undefined);
  assert.equal(seen[0].lang, 'fi'); assert.equal(seen[0].hint, 'Classifier hint.');
  assert.equal((await nextMessage(glasses, (item) => item.type === 'sketch' && item.reqId === 'wait')).sketch.label, 'Desk stapler');
  glasses.ws.close();
});

test('dev stand-in sketches mark the sketch frame', async (t) => {
  const { base, port } = await bridge(t, { provider: 'claude', sketchProvider: 'auto', sketchFn: async () => ({ sketch: fixture, model: 'stand-in', ms: 1 }) });
  const glasses = await socket(port); await post(base, { reqId: 'stand-in', imageBase64: jpeg });
  const frame = await nextMessage(glasses, (item) => item.type === 'sketch' && item.reqId === 'stand-in');
  assert.equal(frame.standIn, true); glasses.ws.close();
});

test('forced, library, and mock detections never start auto sketches', async (t) => {
  let calls = 0; const sketchFn = async () => { calls += 1; return fixture; };
  const library = await bridge(t, {
    sketchProvider: 'auto', sketchFn,
    detectFn: async ({ forceObjectId }) => ({ objectId: forceObjectId || 'ball', confidence: 1, answer: '', model: 'test', provider: forceObjectId ? 'forced' : 'fake', detectMs: 0 }),
  });
  assert.equal((await (await post(library.base, { reqId: 'forced', imageBase64: jpeg, forceObjectId: 'unknown' })).json()).sketchPending, undefined);
  assert.equal((await (await post(library.base, { reqId: 'library', imageBase64: jpeg })).json()).sketchPending, undefined);
  const mock = await bridge(t, { provider: 'mock', sketchProvider: 'auto', sketchFn, detectFn: async () => ({ objectId: 'unknown', confidence: 0, answer: '', model: 'mock', provider: 'mock', detectMs: 0 }) });
  assert.equal((await (await post(mock.base, { reqId: 'mock', imageBase64: jpeg })).json()).sketchPending, undefined);
  assert.equal((await (await fetch(mock.base + '/health')).json()).sketch, 'off'); assert.equal(calls, 0);
});

test('an older sketch frame is suppressed and cannot overwrite a newer remembered show', async (t) => {
  let release; const gate = new Promise((resolve) => { release = resolve; }); let count = 0;
  const { base, port } = await bridge(t, {
    sketchProvider: 'auto',
    detectFn: async () => ({ objectId: count++ === 0 ? 'unknown' : 'ball', confidence: 1, answer: '', model: 'test', provider: 'fake', detectMs: 0 }),
    sketchFn: async () => { await gate; return { sketch: fixture, model: 'test', ms: 1 }; },
  });
  const glasses = await socket(port);
  await post(base, { reqId: 'older', imageBase64: jpeg });
  await post(base, { reqId: 'newer', imageBase64: jpeg }); release();
  await sleep(50);
  assert.equal(glasses.messages.some((item) => item.type === 'sketch' && item.reqId === 'older'), false);
  const last = await (await fetch(base + '/last')).json(); assert.equal(last.show.reqId, 'newer'); assert.equal(last.show.sketch, undefined);
  glasses.ws.close();
});

test('sketch routes keep HTTP and WebSocket authentication', async (t) => {
  let calls = 0;
  const { base, port } = await bridge(t, { token: 'right', sketchProvider: 'auto', sketchFn: async () => { calls += 1; return fixture; } });
  assert.equal((await post(base, { reqId: 'denied', imageBase64: jpeg })).status, 401); assert.equal(calls, 0);
  const glasses = await socket(port, 'glasses', 'right');
  const allowed = await post(base, { reqId: 'allowed', imageBase64: jpeg }, 'right'); assert.equal(allowed.status, 200);
  assert.equal((await nextMessage(glasses, (item) => item.type === 'sketch' && item.reqId === 'allowed')).sketch.label, 'Desk stapler');
  assert.equal(calls, 1); glasses.ws.close();
});
