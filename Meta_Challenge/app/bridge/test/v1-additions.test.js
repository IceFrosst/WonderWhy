import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { start } from '../server.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bridge(t, options = {}) {
  const srv = await start({ port: 0, heartbeatMs: 60000, ...options });
  t.after(() => srv.close());
  return { ...srv, base: `http://localhost:${srv.port}` };
}

function socket(port, hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`); const messages = [];
    ws.on('error', reject);
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('open', () => { if (hello) ws.send(JSON.stringify({ type: 'hello', ...hello })); resolve({ ws, messages }); });
  });
}

function nextMessage(client, predicate, timeoutMs = 1000) {
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

function closed(ws) {
  return new Promise((resolve) => ws.once('close', (code) => resolve(code)));
}

async function post(base, body, token) {
  return fetch(`${base}/detect`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-lens-token': token } : {}) }, body: JSON.stringify(body),
  });
}

test('HTTP auth protects detect, last and latency while public routes stay open', async (t) => {
  const { base } = await bridge(t, { token: 'right', provider: 'mock' });
  for (const supplied of [undefined, 'wrong']) {
    const response = await post(base, { forceObjectId: 'ball' }, supplied);
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'unauthorized' });
  }
  assert.equal((await post(base, { forceObjectId: 'ball' }, 'right')).status, 200);
  for (const route of ['/last', '/latency']) {
    assert.equal((await fetch(base + route)).status, 401);
    assert.equal((await fetch(base + route, { headers: { 'x-lens-token': 'wrong' } })).status, 401);
    assert.equal((await fetch(base + route, { headers: { 'x-lens-token': 'right' } })).status, 200);
  }
  for (const route of ['/health', '/objects', '/phone']) assert.equal((await fetch(base + route)).status, 200);
  assert.notEqual((await fetch(base + '/media/missing.jpg')).status, 401);
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.auth, true); assert.ok(!JSON.stringify(health).includes('right'));
});

test('unset token leaves HTTP open and reports auth false', async (t) => {
  const { base } = await bridge(t, { token: '', provider: 'mock' });
  assert.equal((await post(base, { forceObjectId: 'ball' })).status, 200);
  assert.equal((await fetch(base + '/last')).status, 200);
  assert.equal((await fetch(base + '/latency')).status, 200);
  assert.equal((await (await fetch(base + '/health')).json()).auth, false);
});

test('CORS is wildcard when open and restricted when locked', async (t) => {
  const open = await bridge(t, { token: '', provider: 'mock' });
  const openResponse = await fetch(open.base + '/health', { headers: { origin: 'https://elsewhere.test' } });
  assert.equal(openResponse.headers.get('access-control-allow-origin'), '*');
  assert.equal(openResponse.headers.get('vary'), 'Origin');
  assert.equal(openResponse.headers.get('access-control-allow-headers'), 'content-type, x-lens-token');

  const locked = await bridge(t, { token: 'key', allowedOrigins: 'https://allowed.test, https://two.test', provider: 'mock' });
  const own = await fetch(locked.base + '/health', { headers: { origin: locked.base } });
  assert.equal(own.headers.get('access-control-allow-origin'), locked.base);
  const allowed = await fetch(locked.base + '/health', { headers: { origin: 'https://allowed.test' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.test');
  const denied = await fetch(locked.base + '/health', { headers: { origin: 'https://denied.test' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('WebSocket token gates relay and missing hello is closed', async (t) => {
  const { port } = await bridge(t, { token: 'key', provider: 'mock', helloTimeoutMs: 50 });
  const denied = await socket(port, { client: 'phone' }); const deniedClose = closed(denied.ws);
  assert.equal((await nextMessage(denied, (m) => m.code === 'unauthorized')).message, 'Bridge locked');
  assert.equal(await deniedClose, 4401);

  const idle = await socket(port); const idleClose = closed(idle.ws);
  assert.equal(await idleClose, 4401);

  const glasses = await socket(port, { client: 'glasses', token: 'key' });
  const phone = await socket(port, { client: 'phone', token: 'key' });
  phone.ws.send(JSON.stringify({ type: 'nav', action: 'next' }));
  assert.equal((await nextMessage(glasses, (m) => m.type === 'nav')).action, 'next');
  glasses.ws.close(); phone.ws.close();
});

test('/last, clear, TTL and late-glasses replay work', async (t) => {
  const { base, port } = await bridge(t, { provider: 'mock', lastTtlMs: 70 });
  assert.deepEqual(await (await fetch(base + '/last')).json(), { show: null, ageMs: null });
  await post(base, { reqId: 'remember', forceObjectId: 'ball' });
  const remembered = await (await fetch(base + '/last')).json();
  assert.equal(remembered.show.reqId, 'remember'); assert.ok(remembered.ageMs >= 0);
  const late = await socket(port, { client: 'glasses' });
  const replay = await nextMessage(late, (m) => m.type === 'show');
  assert.equal(replay.reqId, 'remember'); assert.equal(replay.replay, true); assert.ok(replay.ageMs >= 0);
  const phone = await socket(port, { client: 'phone' }); phone.ws.send(JSON.stringify({ type: 'clear' })); await sleep(15);
  assert.deepEqual(await (await fetch(base + '/last')).json(), { show: null, ageMs: null });
  await post(base, { reqId: 'expires', forceObjectId: 'ball' }); await sleep(90);
  assert.deepEqual(await (await fetch(base + '/last')).json(), { show: null, ageMs: null });
  late.ws.close(); phone.ws.close();
});

test('heartbeat sends app-level ping', async (t) => {
  const { port } = await bridge(t, { provider: 'mock', heartbeatMs: 15 });
  const client = await socket(port, { client: 'phone' });
  const ping = await nextMessage(client, (m) => m.type === 'ping');
  assert.equal(typeof ping.t_sent, 'number'); client.ws.close();
});

test('show enrichment includes confidence and injected-library lens fields', async (t) => {
  const objects = [{ id: 'thing', label: 'Thing', answer: 'A concise answer.', chapters: [
    { lens: 'motion', title: 'It moves', lead: 'Follow it.', captions: ['First', 'Second'] },
    { lens: 'inside', title: 'Inside', lead: 'Look within.', captions: ['Third'] },
  ] }];
  const detectFn = async ({ forceObjectId }) => forceObjectId
    ? { objectId: forceObjectId, confidence: 0.1, answer: '', model: 'forced', provider: 'forced', detectMs: 1 }
    : { objectId: 'thing', confidence: 0.4, answer: '', model: 'test', provider: 'test', detectMs: 1 };
  const { base } = await bridge(t, { objects, detectFn, provider: 'mock', minConfidence: 0.6 });
  const show = await (await post(base, { reqId: 'low' })).json();
  assert.equal(show.lowConfidence, true); assert.equal(show.summary, 'A concise answer.');
  assert.deepEqual(show.steps, ['First', 'Second']);
  assert.deepEqual(show.lenses, [
    { id: 'thing.motion', kind: 'motion', title: 'It moves', lead: 'Follow it.', steps: ['First', 'Second'] },
    { id: 'thing.inside', kind: 'inside', title: 'Inside', lead: 'Look within.', steps: ['Third'] },
  ]);
  const forced = await (await post(base, { forceObjectId: 'thing' })).json();
  assert.equal(forced.lowConfidence, undefined);
});

test('lowConfidence is absent at the threshold and for unknown', async (t) => {
  let result = { objectId: 'thing', confidence: 0.6, answer: '', model: 'test', provider: 'test', detectMs: 0 };
  const { base } = await bridge(t, { objects: [{ id: 'thing', label: 'Thing' }], provider: 'mock', minConfidence: 0.6, detectFn: async () => result });
  assert.equal((await (await post(base, {})).json()).lowConfidence, undefined);
  result = { ...result, objectId: 'unknown', confidence: 0.1 };
  assert.equal((await (await post(base, {})).json()).lowConfidence, undefined);
});

test('bad image is 400 and provider failures and timeouts relay reqId errors', async (t) => {
  let calls = 0;
  const bad = await bridge(t, { provider: 'gemini', allowOpen: true, detectFn: async () => { calls += 1; } });
  const badGlasses = await socket(bad.port, { client: 'glasses' });
  const badResponse = await post(bad.base, { reqId: 'bad', imageBase64: 'AAAA' });
  assert.equal(badResponse.status, 400); assert.deepEqual(await badResponse.json(), { error: 'bad_image' }); assert.equal(calls, 0);
  assert.deepEqual(await nextMessage(badGlasses, (m) => m.type === 'error'), { type: 'error', code: 'bad_image', message: 'A valid JPEG image is required', reqId: 'bad' });
  badGlasses.ws.close();

  const failed = await bridge(t, { provider: 'gemini', allowOpen: true, detectFn: async () => { throw new Error('provider down'); } });
  const failedGlasses = await socket(failed.port, { client: 'glasses' });
  const failedResponse = await post(failed.base, { reqId: 'fail', imageBase64: jpeg });
  assert.equal(failedResponse.status, 502); assert.equal((await failedResponse.json()).error, 'detect_failed');
  assert.equal((await nextMessage(failedGlasses, (m) => m.type === 'error')).reqId, 'fail'); failedGlasses.ws.close();

  const timed = await bridge(t, { provider: 'gemini', allowOpen: true, detectTimeoutMs: 25, detectFn: () => new Promise(() => {}) });
  const timedGlasses = await socket(timed.port, { client: 'glasses' });
  const timedResponse = await post(timed.base, { reqId: 'slow', imageBase64: jpeg });
  assert.equal(timedResponse.status, 502); assert.equal((await timedResponse.json()).error, 'detect_timeout');
  assert.equal((await nextMessage(timedGlasses, (m) => m.type === 'detecting')).timeoutMs, 2025);
  const timeoutError = await nextMessage(timedGlasses, (m) => m.type === 'error');
  assert.equal(timeoutError.code, 'detect_timeout'); assert.equal(timeoutError.reqId, 'slow'); timedGlasses.ws.close();
});

test('glasses disconnect mid-detect does not abort the HTTP request', async (t) => {
  const { base, port } = await bridge(t, {
    provider: 'mock', detectFn: async () => { await sleep(30); return { objectId: 'unknown', confidence: 0, answer: '', model: 'test', provider: 'test', detectMs: 30 }; },
  });
  const glasses = await socket(port, { client: 'glasses' });
  const request = post(base, { reqId: 'disconnect' });
  await nextMessage(glasses, (m) => m.type === 'detecting'); glasses.ws.terminate();
  assert.equal((await request).status, 200);
});

test('bad JSON and oversized bodies return 400 and 413', async (t) => {
  const { base } = await bridge(t, { provider: 'mock' });
  const badJson = await fetch(base + '/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(badJson.status, 400); assert.deepEqual(await badJson.json(), { error: 'bad_json' });
  const huge = await fetch(base + '/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 1) });
  assert.equal(huge.status, 413); assert.deepEqual(await huge.json(), { error: 'too_large' });
});

test('media manifest enriches show, allowed files serve, and traversal is refused', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-media-')); const dir = path.join(root, 'thing');
  mkdirSync(dir); writeFileSync(path.join(dir, 'still.jpg'), Buffer.from([1, 2, 3]));
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ lenses: { 'thing.motion': { stills: ['still.jpg'] } } }));
  writeFileSync(path.join(root, 'outside.jpg'), Buffer.from([4]));
  const detectFn = async () => ({ objectId: 'thing', confidence: 1, answer: '', model: 'test', provider: 'test', detectMs: 0 });
  const { base } = await bridge(t, { mediaRoot: root, objects: [{ id: 'thing', label: 'Thing' }], provider: 'mock', detectFn });
  const show = await (await post(base, {})).json();
  assert.deepEqual(show.media, { base: '/media/thing', lenses: { 'thing.motion': { stills: ['still.jpg'] } } });
  const file = await fetch(base + '/media/thing/still.jpg');
  assert.equal(file.status, 200); assert.equal(file.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from([1, 2, 3]));
  assert.equal((await fetch(base + '/media/%2e%2e%5coutside.jpg')).status, 404);
  assert.equal((await fetch(base + '/media/thing/file.txt')).status, 404);
});

test('focusBase64 (aim) reaches the detect function, and a broken crop is dropped', async (t) => {
  const seen = [];
  const detectFn = async (args) => { seen.push(args.focusBase64); return { objectId: 'ball', confidence: 0.9, answer: '', model: 'fake', provider: 'fake', detectMs: 1 }; };
  const { base } = await bridge(t, { provider: 'fake', detectFn });
  assert.equal((await post(base, { imageBase64: jpeg, focusBase64: jpeg })).status, 200);
  assert.equal((await post(base, { imageBase64: jpeg, focusBase64: 'not-a-jpeg' })).status, 200);
  assert.equal((await post(base, { imageBase64: jpeg })).status, 200);
  assert.deepEqual(seen, [jpeg, undefined, undefined]);
});
