import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { start } from '../server.js';

const objects = [
  { id: 'thing', label: 'Thing', answer: 'A thing.', chapters: [{ lens: 'motion', title: 'Motion', captions: ['It moves.'] }] },
  { id: 'other', label: 'Other', answer: 'Another thing.', chapters: [{ lens: 'inside', title: 'Inside', captions: ['Look inside.'] }] },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bridge(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bridge-latency-'));
  const latencyLog = path.join(dir, 'latency.jsonl');
  const detectFn = async ({ forceObjectId }) => ({
    objectId: forceObjectId || 'thing', confidence: forceObjectId === 'other' ? 0.8 : 0.9,
    answer: '', provider: forceObjectId === 'other' ? 'beta' : 'alpha',
    model: forceObjectId === 'other' ? 'model-b' : 'model-a', detectMs: forceObjectId === 'other' ? 8 : 4,
  });
  const srv = await start({ port: 0, heartbeatMs: 60000, provider: 'mock', objects, detectFn, latencyLog, ...options });
  t.after(() => srv.close());
  return { ...srv, base: `http://localhost:${srv.port}`, latencyLog };
}

function socket(port, client, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`); const messages = [];
    ws.on('error', reject);
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('open', async () => {
      ws.send(JSON.stringify({ type: 'hello', client, ...(token ? { token } : {}) }));
      await sleep(15); resolve({ ws, messages });
    });
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

function post(base, route, body, token) {
  return fetch(base + route, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-lens-token': token } : {}) }, body: JSON.stringify(body),
  });
}

test('POST /rendered creates one latency record, uses renderMs, and notifies phones', async (t) => {
  const app = await bridge(t); const phone = await socket(app.port, 'phone');
  const detected = await post(app.base, '/detect', { reqId: 'phone-render', forceObjectId: 'thing', preUploadMs: 12 });
  assert.equal(detected.status, 200);
  const response = await post(app.base, '/rendered', { reqId: 'phone-render', renderMs: 37 });
  assert.equal(response.status, 200);
  const record = await response.json();
  assert.equal(record.ok, true); assert.equal(record.reqId, 'phone-render');
  assert.equal(record.objectId, 'thing'); assert.equal(record.detectedToRenderedMs, 37);
  const frame = await nextMessage(phone, (message) => message.type === 'latency' && message.reqId === 'phone-render');
  assert.equal(frame.detectedToRenderedMs, 37); assert.equal(frame.totalMs, record.totalMs);
  assert.equal((await post(app.base, '/rendered', { reqId: 'phone-render' })).status, 404);
  const unknown = await post(app.base, '/rendered', { reqId: 'missing' });
  assert.equal(unknown.status, 404); assert.deepEqual(await unknown.json(), { error: 'unknown_request' });
  assert.equal(existsSync(app.latencyLog), true);
  assert.equal(JSON.parse(readFileSync(app.latencyLog, 'utf8').trim()).detectedToRenderedMs, 37);
  phone.ws.close();
});

test('POST /rendered uses the same authentication as detect', async (t) => {
  const app = await bridge(t, { token: 'right' });
  assert.equal((await post(app.base, '/detect', { reqId: 'locked', forceObjectId: 'thing' }, 'right')).status, 200);
  assert.equal((await post(app.base, '/rendered', { reqId: 'locked' })).status, 401);
  assert.equal((await post(app.base, '/rendered', { reqId: 'locked' }, 'wrong')).status, 401);
  assert.equal((await post(app.base, '/rendered', { reqId: 'locked' }, 'right')).status, 200);
});

test('/latency requests includes acknowledged and unacknowledged provider and object counts', async (t) => {
  const app = await bridge(t);
  assert.equal((await post(app.base, '/detect', { reqId: 'ack', forceObjectId: 'thing' })).status, 200);
  assert.equal((await post(app.base, '/detect', { reqId: 'no-ack', forceObjectId: 'other' })).status, 200);
  assert.equal((await post(app.base, '/rendered', { reqId: 'ack', renderMs: 2 })).status, 200);
  const summary = await (await fetch(app.base + '/latency')).json();
  assert.equal(summary.count, 1);
  assert.deepEqual(summary.requests, {
    count: 2, detectMs: { p50: 4, p90: 8 },
    byProvider: { alpha: 1, beta: 1 }, byObject: { thing: 1, other: 1 },
  });
});

test('phone relay preserves first_run and demo values unchanged', async (t) => {
  const app = await bridge(t); const glasses = await socket(app.port, 'glasses'); const phone = await socket(app.port, 'phone');
  phone.ws.send(JSON.stringify({ type: 'device', state: 'first_run' }));
  assert.deepEqual(await nextMessage(glasses, (message) => message.type === 'device'), { type: 'device', state: 'first_run' });
  phone.ws.send(JSON.stringify({ type: 'nav', action: 'demo' }));
  assert.deepEqual(await nextMessage(glasses, (message) => message.type === 'nav'), { type: 'nav', action: 'demo' });
  glasses.ws.close(); phone.ws.close();
});
