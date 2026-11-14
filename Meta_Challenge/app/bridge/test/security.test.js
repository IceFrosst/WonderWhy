import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { detect, parseModelJson } from '../detect.js';
import { start } from '../server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const bridgeRoot = path.resolve(here, '..');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bridge(t, options = {}) {
  const app = await start({ port: 0, provider: 'mock', heartbeatMs: 60000, ...options });
  t.after(() => app.close());
  return { ...app, base: `http://localhost:${app.port}` };
}

function openSocket(port, hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`); const messages = [];
    ws.on('error', reject);
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('open', () => { if (hello) ws.send(JSON.stringify({ type: 'hello', ...hello })); resolve({ ws, messages }); });
  });
}

function closeCode(ws) {
  return new Promise((resolve) => ws.once('close', (code) => resolve(code)));
}

function post(base, route, body, headers = {}) {
  return fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('a malformed request target returns 400 and the HTTP server keeps serving', async (t) => {
  const app = await bridge(t);
  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ port: app.port, host: '127.0.0.1' }); let data = '';
    socket.setEncoding('utf8'); socket.on('error', reject); socket.on('data', (chunk) => { data += chunk; });
    socket.on('end', () => resolve(data));
    socket.on('connect', () => socket.end('GET // HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
  });
  assert.match(response, /^HTTP\/1\.1 400 /);
  assert.match(response, /\{"error":"bad_request"\}/);
  assert.equal((await fetch(app.base + '/health')).status, 200);
});

test('importing server.js does not install process-wide crash handlers', () => {
  const serverUrl = new URL('../server.js', import.meta.url).href;
  const script = `const a=process.listenerCount('unhandledRejection');const b=process.listenerCount('uncaughtException');await import(${JSON.stringify(serverUrl)});if(a!==process.listenerCount('unhandledRejection')||b!==process.listenerCount('uncaughtException'))process.exit(2);`;
  execFileSync(process.execPath, ['--input-type=module', '--eval', script], { stdio: 'pipe' });
});

test('hostile JSON WebSocket values are ignored before and after hello', async (t) => {
  const app = await bridge(t); const glasses = await openSocket(app.port, { client: 'glasses' });
  const phone = await openSocket(app.port);
  for (const value of ['null', '1', '"x"', '[]', 'x'.repeat(2048)]) phone.ws.send(value);
  phone.ws.send(JSON.stringify({ type: 'nav', action: 'prev' }));
  await sleep(20); assert.equal(glasses.messages.some((item) => item.type === 'nav'), false);
  phone.ws.send(JSON.stringify({ type: 'hello', client: 'phone' })); await sleep(20);
  for (const value of ['null', '1', '"x"', '[]', 'x'.repeat(2048)]) phone.ws.send(value);
  phone.ws.send(JSON.stringify({ type: 'nav', action: 'next' })); await sleep(30);
  assert.equal(glasses.messages.some((item) => item.type === 'nav' && item.action === 'next'), true);
  assert.equal(phone.ws.readyState, WebSocket.OPEN); glasses.ws.close(); phone.ws.close();
});

test('phone source has no variable innerHTML sinks and bridge responses carry security headers', async (t) => {
  const source = readFileSync(path.join(bridgeRoot, 'public', 'phone.html'), 'utf8');
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.match(source, /fragmentToken/); assert.match(source, /hash\.set\('k'/);
  const app = await bridge(t);
  for (const route of ['/health', '/missing', '/phone']) {
    const response = await fetch(app.base + route);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
  const phone = await fetch(app.base + '/phone');
  assert.equal(phone.headers.get('content-security-policy'), "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-src 'self' http://localhost:* http://127.0.0.1:*; base-uri 'none'; form-action 'none'");
});

test('paid providers fail closed unless explicitly opened and health reports open mode', async (t) => {
  assert.throws(() => start({ port: 0, provider: 'anthropic', token: '' }), /LENS_TOKEN is required/);
  assert.throws(() => start({ port: 0, provider: 'gemini', token: '' }), /LENS_TOKEN is required/);
  const app = await bridge(t, { provider: 'gemini', allowOpen: true });
  const health = await (await fetch(app.base + '/health')).json();
  assert.equal(health.auth, false); assert.equal(health.open, true);
});

test('a slower older detect cannot replace a newer completed show', async (t) => {
  let releaseA; let startedA;
  const aStarted = new Promise((resolve) => { startedA = resolve; });
  const gate = new Promise((resolve) => { releaseA = resolve; });
  const detectFn = async ({ question }) => {
    if (question === 'A') { startedA(); await gate; return { objectId: 'ball', confidence: 1, answer: '', model: 'slow', provider: 'fake', detectMs: 20 }; }
    return { objectId: 'kettle', confidence: 1, answer: '', model: 'fast', provider: 'fake', detectMs: 1 };
  };
  const app = await bridge(t, { provider: 'fake', detectFn }); const glasses = await openSocket(app.port, { client: 'glasses' }); await sleep(15);
  const older = post(app.base, '/detect', { reqId: 'older', imageBase64: jpeg, question: 'A' }); await aStarted;
  assert.equal((await post(app.base, '/detect', { reqId: 'newer', imageBase64: jpeg, question: 'B' })).status, 200);
  releaseA(); assert.equal((await older).status, 200); await sleep(20);
  const shows = glasses.messages.filter((item) => item.type === 'show');
  assert.deepEqual(shows.map((item) => item.reqId), ['newer']);
  assert.equal((await (await fetch(app.base + '/last')).json()).show.reqId, 'newer'); glasses.ws.close();
});

test('clear suppresses a detect result that started before it', async (t) => {
  let release; let started;
  const began = new Promise((resolve) => { started = resolve; }); const gate = new Promise((resolve) => { release = resolve; });
  const detectFn = async () => { started(); await gate; return { objectId: 'ball', confidence: 1, answer: '', model: 'slow', provider: 'fake', detectMs: 20 }; };
  const app = await bridge(t, { provider: 'fake', detectFn });
  const glasses = await openSocket(app.port, { client: 'glasses' }); const phone = await openSocket(app.port, { client: 'phone' }); await sleep(15);
  const request = post(app.base, '/detect', { reqId: 'cleared', imageBase64: jpeg }); await began;
  phone.ws.send(JSON.stringify({ type: 'clear' })); await sleep(15); release();
  assert.equal((await request).status, 200); await sleep(20);
  assert.equal(glasses.messages.some((item) => item.type === 'show' && item.reqId === 'cleared'), false);
  assert.deepEqual(await (await fetch(app.base + '/last')).json(), { show: null, ageMs: null }); glasses.ws.close(); phone.ws.close();
});

test('body, model concurrency, WebSocket payload, and socket limits are enforced', async (t) => {
  let release; const gate = new Promise((resolve) => { release = resolve; });
  const app = await bridge(t, { maxInflight: 1, maxSockets: 1, provider: 'fake', detectFn: async () => { await gate; return { objectId: 'ball', confidence: 1, answer: '', model: 'test', provider: 'fake', detectMs: 1 }; } });
  assert.equal(app.server.requestTimeout, 30000); assert.equal(app.server.headersTimeout, 10000); assert.equal(app.server.keepAliveTimeout, 5000);
  const tooLarge = await fetch(app.base + '/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(2 * 1024 * 1024 + 1) });
  assert.equal(tooLarge.status, 413); const tooLargeError = await tooLarge.json();
  assert.equal(tooLargeError.error, 'too_large'); assert.equal(typeof tooLargeError.message, 'string'); assert.match(tooLargeError.reqId, /^[\w-]{1,64}$/);
  const first = post(app.base, '/detect', { reqId: 'held', imageBase64: jpeg }); await sleep(20);
  const busy = await post(app.base, '/detect', { reqId: 'busy', imageBase64: jpeg });
  assert.equal(busy.status, 429); assert.equal(busy.headers.get('retry-after'), '2');
  const busyError = await busy.json(); assert.equal(busyError.error, 'busy'); assert.equal(busyError.reqId, 'busy'); assert.equal(typeof busyError.message, 'string');
  const one = await openSocket(app.port); const second = new WebSocket(`ws://localhost:${app.port}/ws`); second.on('error', () => {}); const secondClose = closeCode(second);
  assert.equal(await secondClose, 1013); one.ws.close();
  release(); assert.equal((await first).status, 200);
});

test('WebSocket payloads above 64 KB are rejected', async (t) => {
  const app = await bridge(t, { maxSockets: 2 }); const client = await openSocket(app.port);
  const closed = closeCode(client.ws); client.ws.send('x'.repeat(64 * 1024 + 1));
  assert.equal(await closed, 1009);
});

test('prototype names are rejected as object ids and input fields are normalized', async (t) => {
  const app = await bridge(t);
  for (const body of [null, 1, []]) {
    const response = await fetch(app.base + '/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400); const error = await response.json();
    assert.equal(error.error, 'bad_json'); assert.equal(typeof error.message, 'string'); assert.match(error.reqId, /^[\w-]{1,64}$/);
  }
  for (const id of ['__proto__', 'constructor']) {
    assert.equal((await post(app.base, '/detect', { forceObjectId: id })).status, 400);
    assert.equal((await post(app.base, '/ask', { question: 'Why?', aboutObjectId: id })).status, 400);
  }
  assert.equal((await post(app.base, '/detect', { question: 4 })).status, 400);
  const show = await (await post(app.base, '/detect', { reqId: '<bad>', forceObjectId: 'ball', question: `  ${'q'.repeat(400)}  `, extra: '<ignored>' })).json();
  assert.match(show.reqId, /^[\w-]{1,64}$/); assert.notEqual(show.reqId, '<bad>'); assert.equal(show.question.length, 300);
  const last = await (await fetch(app.base + '/last')).json(); assert.equal(typeof last.show.question, 'string');
});

test('media supports one byte range and read errors become one clean 500 response', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-range-')); const dir = path.join(root, 'thing'); mkdirSync(dir);
  writeFileSync(path.join(dir, 'clip.mp4'), Buffer.from([0, 1, 2, 3, 4, 5])); writeFileSync(path.join(dir, 'broken.jpg'), Buffer.from([9]));
  const readFileFn = (file) => { if (file.endsWith('broken.jpg')) throw new Error('unreadable'); return readFileSync(file); };
  const app = await bridge(t, { mediaRoot: root, readFileFn });
  const ranged = await fetch(app.base + '/media/thing/clip.mp4', { headers: { range: 'bytes=2-4' } });
  assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('content-range'), 'bytes 2-4/6'); assert.equal(ranged.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), Buffer.from([2, 3, 4]));
  const broken = await fetch(app.base + '/media/thing/broken.jpg');
  assert.equal(broken.status, 500); assert.deepEqual(await broken.json(), { error: 'server_error' });
  assert.equal((await fetch(app.base + '/health')).status, 200);
});

test('pi spawn failures clean their temporary folder and claude read access is scoped', async () => {
  const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('lens-')));
  await assert.rejects(detect({ imageBase64: jpeg, objects: [], provider: 'pi', timeoutMs: 100, env: { PI_BIN: `missing-pi-${Date.now()}` } }), /pi not runnable/);
  await sleep(30);
  const after = readdirSync(tmpdir()).filter((name) => name.startsWith('lens-') && !before.has(name));
  assert.deepEqual(after, []);
  const source = readFileSync(path.join(bridgeRoot, 'detect.js'), 'utf8');
  assert.match(source, /'--tools', 'Read', '--allowedTools', 'Read\(\.\/\*\.jpg\)'/);
});

test('missing preUploadMs never mixes phone and server clocks', async (t) => {
  const app = await bridge(t);
  await post(app.base, '/detect', { reqId: 'clock-safe', forceObjectId: 'ball', t_capture: 1 });
  const result = await (await post(app.base, '/rendered', { reqId: 'clock-safe', renderMs: 5 })).json();
  assert.equal(result.captureToReceivedMs, null); assert.ok(result.totalMs < 1000);
});

test('latency log stops growing at 20 MB and uses asynchronous append code', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bridge-log-cap-')); const latencyLog = path.join(dir, 'latency.jsonl');
  writeFileSync(latencyLog, Buffer.alloc(20 * 1024 * 1024));
  const app = await bridge(t, { latencyLog });
  await post(app.base, '/detect', { reqId: 'full-log', forceObjectId: 'ball' });
  await post(app.base, '/rendered', { reqId: 'full-log', renderMs: 1 }); await sleep(30);
  assert.equal(readFileSync(latencyLog).length, 20 * 1024 * 1024);
  const source = readFileSync(path.join(bridgeRoot, 'server.js'), 'utf8');
  assert.doesNotMatch(source, /appendFileSync/); assert.match(source, /from 'node:fs\/promises'/);
});

test('in-memory latency records retain only the latest 500 entries', async (t) => {
  const app = await bridge(t); const originalLog = console.log; console.log = () => {};
  try {
    for (let start = 0; start < 501; start += 100) {
      const ids = Array.from({ length: Math.min(100, 501 - start) }, (_, offset) => `cap-${start + offset}`);
      await Promise.all(ids.map((reqId) => post(app.base, '/detect', { reqId, forceObjectId: 'ball' })));
      await Promise.all(ids.map((reqId) => post(app.base, '/rendered', { reqId, renderMs: 0 })));
    }
  } finally { console.log = originalLog; }
  const summary = await (await fetch(app.base + '/latency')).json();
  assert.equal(summary.count, 500); assert.equal(summary.recent.length, 10); assert.equal(summary.recent.at(-1).reqId, 'cap-500');
});

test('classifier answers are cleaned and capped, and Gemini classification sets an output limit', async () => {
  const answer = parseModelJson(JSON.stringify({ objectId: 'unknown', confidence: 0.5, answer: `  hello\u0000\n${'x'.repeat(400)}  ` }), []);
  assert.equal(answer.answer.includes('\u0000'), false); assert.equal(answer.answer.includes('\n'), false); assert.equal(answer.answer.length, 300);
  const originalFetch = globalThis.fetch; let body;
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"objectId":"unknown","confidence":0,"answer":"ok"}' }] } }] }) }; };
  try {
    await detect({ imageBase64: 'image', objects: [], provider: 'gemini', timeoutMs: 1000, env: { GEMINI_API_KEY: 'test-only' } });
    assert.equal(body.generationConfig.maxOutputTokens, 300);
  } finally { globalThis.fetch = originalFetch; }
});
