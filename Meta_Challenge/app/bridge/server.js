import http from 'node:http';
import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { detect, loadObjects, OBJECTS_PATH, pickProvider } from './detect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 5 * 1024 * 1024;
const STAGES = ['captureToReceivedMs', 'detectMs', 'detectedToRenderedMs', 'totalMs'];

// Serve the built glasses Web App (../glasses/dist) at / so one host covers app + bridge.
const GLASSES_DIST = path.resolve(here, '..', 'glasses', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveGlasses(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(GLASSES_DIST, rel);
  if (!file.startsWith(GLASSES_DIST + path.sep) || !existsSync(file) || !statSync(file).isFile()) return false;
  const cache = rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': cache });
  res.end(readFileSync(file));
  return true;
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

export function start({ port = Number(process.env.PORT) || 8787, latencyLog = process.env.LATENCY_LOG || path.join(here, 'latency.jsonl') } = {}) {
  const objects = loadObjects();
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]));
  const glasses = new Set();
  const phones = new Set();
  const pending = new Map(); // reqId -> show message
  const records = [];
  let lastProvider = null;

  const send = (set, msg) => { const t = JSON.stringify(msg); for (const c of set) if (c.readyState === 1) c.send(t); };
  const both = (msg) => { send(glasses, msg); send(phones, msg); };

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' };
  const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };

  function summary() {
    const out = { count: records.length, provider: lastProvider };
    for (const s of STAGES) {
      const v = records.map((r) => r[s]).filter((x) => typeof x === 'number');
      out[s] = { p50: pct(v, 50), p90: pct(v, 90) };
    }
    out.recent = records.slice(-10);
    return out;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > BODY_LIMIT) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  async function handleDetect(req, res) {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch (e) { return json(res, e.status || 400, { error: e.status ? 'too_large' : 'bad_json' }); }
    const reqId = body.reqId || crypto.randomUUID();
    const t_received = Date.now();
    const t_capture = Number(body.t_capture) || t_received;
    // Measured on the sender's own clock (capture -> request sent). Avoids phone/server clock skew.
    const preUploadMs = Number.isFinite(Number(body.preUploadMs)) ? Math.max(0, Number(body.preUploadMs)) : null;
    both({ type: 'detecting', reqId, t_sent: Date.now() });
    try {
      const r = await detect({ imageBase64: body.imageBase64, focusBase64: body.focusBase64, question: body.question, forceObjectId: body.forceObjectId, objects });
      if (r.provider !== 'forced') lastProvider = { provider: r.provider, model: r.model };
      const t_detected = Date.now();
      const obj = byId[r.objectId];
      const show = {
        type: 'show', reqId, objectId: r.objectId, label: obj ? obj.label : 'Unknown object', confidence: r.confidence,
        ...(body.question ? { question: body.question } : {}),
        ...(r.answer ? { answer: r.answer } : {}),
        timings: { t_capture, t_received, t_detected, preUploadMs, detectMs: r.detectMs, model: r.model },
        t_sent: Date.now(),
      };
      pending.set(reqId, show);
      if (pending.size > 200) pending.delete(pending.keys().next().value);
      both(show);
      json(res, 200, show);
    } catch (e) {
      const code = e.code === 'detect_timeout' ? 'detect_timeout' : 'detect_failed';
      both({ type: 'error', code, message: e.message });
      json(res, 502, { error: code, message: e.message, reqId });
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    try {
      if (req.method === 'GET' && url.pathname === '/phone') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
        return res.end(readFileSync(path.join(here, 'public', 'phone.html')));
      }
      if (req.method === 'GET' && url.pathname === '/objects') {
        res.writeHead(200, { 'content-type': 'application/json', ...cors });
        return res.end(readFileSync(OBJECTS_PATH));
      }
      if (req.method === 'GET' && url.pathname === '/latency') return json(res, 200, summary());
      if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, provider: pickProvider(), glasses: glasses.size, phones: phones.size });
      if (req.method === 'POST' && url.pathname === '/detect') return await handleDetect(req, res);
      if (req.method === 'GET' && serveGlasses(url.pathname, res)) return;
      json(res, 404, { error: 'not_found' });
    } catch (e) { json(res, 500, { error: 'server_error', message: e.message }); }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: BODY_LIMIT });
  wss.on('connection', (ws) => {
    let role = null;
    ws.on('close', () => { glasses.delete(ws); phones.delete(ws); });
    ws.on('message', (data) => {
      let m; try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type === 'hello') {
        glasses.delete(ws); phones.delete(ws);
        role = m.client === 'glasses' ? 'glasses' : m.client === 'phone' ? 'phone' : null;
        if (role === 'glasses') glasses.add(ws); else if (role === 'phone') phones.add(ws);
        return;
      }
      if (role === 'phone' && ['nav', 'clear', 'device', 'error'].includes(m.type)) return send(glasses, m);
      if (role === 'glasses' && m.type === 'state') return send(phones, m);
      if (role === 'glasses' && m.type === 'rendered') {
        const show = pending.get(m.reqId);
        if (!show) return;
        pending.delete(m.reqId);
        const t = show.timings;
        // Every duration uses one clock. Server clock: detected -> 'rendered' ack arrives
        // (includes the trip to the glasses, first paint, and the ack's trip back).
        const t_ack = Date.now();
        const pre = t.preUploadMs ?? Math.max(0, t.t_received - t.t_capture); // fallback only valid on one machine
        const rec = {
          reqId: m.reqId, objectId: show.objectId, model: t.model,
          captureToReceivedMs: pre,
          detectMs: t.detectMs,
          detectedToRenderedMs: t_ack - t.t_detected,
          totalMs: pre + (t_ack - t.t_received),
          at: t_ack,
        };
        records.push(rec);
        try { appendFileSync(latencyLog, JSON.stringify(rec) + '\n'); } catch (e) { console.error('latency log failed', e.message); }
        send(phones, { type: 'latency', ...rec });
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve({
      server, port: server.address().port,
      close: () => new Promise((r) => { for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }),
    }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().then(({ port }) => console.log(`bridge on http://localhost:${port}  (phone: /phone, ws: /ws, provider: ${pickProvider()})`));
}
