import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, createRateLimiter, start } from '../server.js';

async function bridge(t, options = {}) {
  const app = await start({ port: 0, provider: 'mock', heartbeatMs: 60000, ...options });
  t.after(() => app.close());
  return { ...app, base: `http://localhost:${app.port}` };
}
const post = (base, route, body, headers = {}) => fetch(base + route, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const forced = (n) => ({ reqId: `rl-${n}`, forceObjectId: 'ball' });

test('token bucket allows a burst, refills over time and enforces the hourly window', () => {
  let t = 0;
  const limiter = createRateLimiter({ perMinute: 3, perHour: 5, now: () => t });
  assert.deepEqual([1, 2, 3].map(() => limiter.take('a')), [0, 0, 0]);
  assert.ok(limiter.take('a') > 0, 'fourth request in the minute is refused');
  assert.equal(limiter.take('b'), 0, 'another address has its own bucket');
  t += 20000; // one token back
  assert.equal(limiter.take('a'), 0);
  assert.ok(limiter.take('a') > 0);
  t += 60000; // the minute window is full again, but the hour has only 5 in total
  assert.equal(limiter.take('a'), 0);
  assert.ok(limiter.take('a') > 0, 'hourly limit applies even though the minute bucket has refilled');
  assert.equal(createRateLimiter({ perMinute: 0, perHour: 0 }).enabled, false);
  assert.equal(createRateLimiter({ perMinute: 0, perHour: 0 }).take('a'), 0);
});

test('X-Forwarded-For is trusted only when the direct peer is private', () => {
  const req = (peer, xff) => ({ socket: { remoteAddress: peer }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  assert.equal(clientIp(req('172.18.0.2', '203.0.113.9')), '203.0.113.9');
  assert.equal(clientIp(req('::ffff:172.18.0.2', '198.51.100.1, 203.0.113.9')), '203.0.113.9');
  assert.equal(clientIp(req('::ffff:10.0.0.5', '203.0.113.9, 172.18.0.3')), '203.0.113.9', 'inner proxies are skipped');
  assert.equal(clientIp(req('127.0.0.1', '')), '127.0.0.1');
  assert.equal(clientIp(req('198.51.100.7', '203.0.113.9')), '198.51.100.7', 'a public peer cannot spoof the header');
  assert.equal(clientIp(req('::ffff:198.51.100.7', '10.0.0.1')), '198.51.100.7');
});

test('POST /detect and /ask return 429 with the error JSON shape once the per-minute limit is hit', async (t) => {
  const app = await bridge(t, { ratePerMinute: 2, ratePerHour: 0 });
  assert.equal((await post(app.base, '/detect', forced(1))).status, 200);
  assert.equal((await post(app.base, '/ask', { reqId: 'rl-a', aboutObjectId: 'ball', question: 'why?' })).status, 200);
  const limited = await post(app.base, '/detect', forced(3));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  const body = await limited.json();
  assert.equal(body.error, 'rate_limited');
  assert.match(body.message, /wait a moment/i);
  assert.match(body.reqId, /^[\w-]{1,64}$/);
  const askLimited = await post(app.base, '/ask', { aboutObjectId: 'ball', question: 'why?' });
  assert.equal(askLimited.status, 429);
  assert.equal((await askLimited.json()).error, 'rate_limited');
  assert.equal((await fetch(`${app.base}/health`)).status, 200, 'read-only routes are not limited');
});

test('the hourly limit applies on its own and 0 disables a window', async (t) => {
  const hourly = await bridge(t, { ratePerMinute: 0, ratePerHour: 2 });
  assert.deepEqual(await Promise.all([1, 2].map(async (n) => (await post(hourly.base, '/detect', forced(n))).status)), [200, 200]);
  assert.equal((await post(hourly.base, '/detect', forced(3))).status, 429);
  const off = await bridge(t, { ratePerMinute: 0, ratePerHour: 0 });
  for (let n = 0; n < 10; n++) assert.equal((await post(off.base, '/detect', forced(n))).status, 200);
});

test('each forwarded client address has its own budget behind a private proxy', async (t) => {
  const app = await bridge(t, { ratePerMinute: 1, ratePerHour: 0 });
  const as = (ip, n) => post(app.base, '/detect', forced(n), { 'x-forwarded-for': ip });
  assert.equal((await as('203.0.113.1', 1)).status, 200);
  assert.equal((await as('203.0.113.1', 2)).status, 429);
  assert.equal((await as('203.0.113.2', 3)).status, 200, 'a different client is unaffected');
});

test('a paid provider is limited by default (6 per minute) and unauthenticated calls are rejected before the limiter', async (t) => {
  const app = await bridge(t, { provider: 'gemini', token: 'secret' });
  const headers = { 'x-lens-token': 'secret' };
  for (let n = 0; n < 6; n++) assert.equal((await post(app.base, '/detect', forced(n), headers)).status, 200);
  assert.equal((await post(app.base, '/detect', forced(7), headers)).status, 429);
  assert.equal((await post(app.base, '/detect', forced(8))).status, 401, 'auth is checked first');
});

test('LENS_RATE_PER_MIN and LENS_RATE_PER_HOUR configure the limiter from the environment', async (t) => {
  const saved = [process.env.LENS_RATE_PER_MIN, process.env.LENS_RATE_PER_HOUR];
  process.env.LENS_RATE_PER_MIN = '1'; process.env.LENS_RATE_PER_HOUR = '0';
  t.after(() => { for (const [i, k] of ['LENS_RATE_PER_MIN', 'LENS_RATE_PER_HOUR'].entries()) { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; } });
  const app = await bridge(t);
  assert.equal((await post(app.base, '/detect', forced(1))).status, 200);
  assert.equal((await post(app.base, '/detect', forced(2))).status, 429);
});
