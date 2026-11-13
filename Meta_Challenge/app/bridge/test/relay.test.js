import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

process.env.DETECT_PROVIDER = 'mock';
const logPath = path.join(mkdtempSync(path.join(tmpdir(), 'bridge-')), 'latency.jsonl');
process.env.LATENCY_LOG = logPath;
const { start } = await import('../server.js');

let srv, base;
before(async () => { srv = await start({ port: 0 }); base = `http://localhost:${srv.port}`; });
after(() => srv.close());

function client(kind) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${srv.port}/ws`);
    const msgs = []; const waiters = [];
    ws.on('message', (d) => { const m = JSON.parse(d); msgs.push(m); waiters.forEach((w) => w()); });
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', client: kind })); setTimeout(() => resolve({
      ws, msgs,
      next: (type) => new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout waiting for ' + type)), 3000);
        const check = () => { const m = msgs.find((x) => x.type === type); if (m) { clearTimeout(t); res(m); return true; } };
        if (!check()) waiters.push(check);
      }),
    }), 50); });
  });
}
const post = (body) => fetch(`${base}/detect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('forced detect relays detecting then show, and rendered yields latency', async () => {
  const g = await client('glasses'); const p = await client('phone');
  const r = await post({ reqId: 'r1', imageBase64: null, forceObjectId: 'ball', t_capture: Date.now() - 50 });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.objectId, 'ball');
  await g.next('show');
  const types = g.msgs.map((m) => m.type);
  assert.ok(types.indexOf('detecting') < types.indexOf('show'));
  assert.equal(g.msgs.find((m) => m.type === 'show').objectId, 'ball');
  assert.equal(g.msgs.find((m) => m.type === 'show').timings.model, 'forced');
  g.ws.send(JSON.stringify({ type: 'rendered', reqId: 'r1', t_rendered: Date.now() + 20 }));
  const lat = await p.next('latency');
  assert.equal(lat.objectId, 'ball');
  assert.ok(lat.captureToReceivedMs >= 50 && lat.totalMs >= 70);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(existsSync(logPath));
  assert.equal(readFileSync(logPath, 'utf8').trim().split('\n').length, 1);
  const s = await (await fetch(`${base}/latency`)).json();
  assert.equal(s.count, 1);
  assert.ok(s.totalMs.p50 >= 70);
  g.ws.close(); p.ws.close();
});

test('nav relays phone to glasses, state relays glasses to phone', async () => {
  const g = await client('glasses'); const p = await client('phone');
  p.ws.send(JSON.stringify({ type: 'nav', action: 'next' }));
  assert.equal((await g.next('nav')).action, 'next');
  g.ws.send(JSON.stringify({ type: 'state', objectId: 'ball', step: 2 }));
  assert.equal((await p.next('state')).step, 2);
  g.ws.close(); p.ws.close();
});

test('mock provider returns unknown without forceObjectId', async () => {
  const r = await post({ reqId: 'r2', imageBase64: 'AAAA' });
  const b = await r.json();
  assert.equal(b.objectId, 'unknown');
  assert.equal(b.confidence, 0);
  assert.match(b.answer, /Mock mode/);
});

test('basic endpoints', async () => {
  assert.equal((await (await fetch(`${base}/health`)).json()).ok, true);
  assert.equal((await (await fetch(`${base}/objects`)).json()).objects.length, (await import("../detect.js")).loadObjects().length);
  assert.equal((await fetch(`${base}/phone`)).status, 200);
});
