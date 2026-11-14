import http from 'node:http';
import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { detect, detectTimeout, loadObjects, pickProvider, STAND_INS } from './detect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 5 * 1024 * 1024;
const STAGES = ['captureToReceivedMs', 'detectMs', 'detectedToRenderedMs', 'totalMs'];
const GLASSES_DIST = path.resolve(here, '..', 'glasses', 'dist');
const MEDIA_EXTS = new Set(['.png', '.jpg', '.mp4', '.json', '.webp']);
const LANGUAGES = new Set(['en', 'fi', 'sv', 'de', 'es', 'fr']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

function serveFile(root, rel, res, headers, cache, allowedExts) {
  let decoded;
  try { decoded = decodeURIComponent(rel).replace(/^[/\\]+/, ''); } catch { return false; }
  const file = path.resolve(root, decoded);
  if (!file.startsWith(root + path.sep) || (allowedExts && !allowedExts.has(path.extname(file).toLowerCase())) || !existsSync(file) || !statSync(file).isFile()) return false;
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': cache, ...headers });
  res.end(readFileSync(file));
  return true;
}

function serveGlasses(pathname, res, headers) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  return serveFile(GLASSES_DIST, rel, res, headers, rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
}

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

function positive(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function validJpegBase64(value) {
  if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function sameToken(actual, expected) {
  if (!expected || typeof actual !== 'string') return !expected;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeLang(value) {
  if (typeof value !== 'string') return 'en';
  const lang = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return LANGUAGES.has(lang) ? lang : 'en';
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function start({
  port = Number(process.env.PORT) || 8787,
  latencyLog = process.env.LATENCY_LOG || path.join(here, 'latency.jsonl'),
  token = process.env.LENS_TOKEN || '',
  allowedOrigins = process.env.LENS_ALLOWED_ORIGINS || '',
  helloTimeoutMs = 5000,
  heartbeatMs = positive(process.env.HEARTBEAT_MS, 10000),
  lastTtlMs = positive(process.env.LAST_TTL_MS, 120000),
  minConfidence = positive(process.env.MIN_CONFIDENCE, 0.6),
  objects = loadObjects(),
  detectFn = detect,
  provider = pickProvider(),
  detectTimeoutMs = detectTimeout(process.env, provider),
  mediaRoot = path.join(here, 'media'),
  i18nRoot = path.join(here, '..', 'shared', 'i18n'),
} = {}) {
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]));
  const mediaBase = path.resolve(mediaRoot);
  const i18nBase = path.resolve(i18nRoot);
  const translations = new Map();
  const originAllowlist = new Set(String(allowedOrigins).split(',').map((s) => s.trim()).filter(Boolean));
  const glasses = new Set(); const phones = new Set();
  const pending = new Map(); const records = []; const timers = new Set();
  let lastProvider = null; let lastShow = null; let lastShowAt = 0; let closing = false;

  const timer = (fn, ms, interval = false) => {
    const t = interval ? setInterval(fn, ms) : setTimeout(() => { timers.delete(t); fn(); }, ms);
    t.unref(); timers.add(t); return t;
  };
  const clearTimer = (t) => { if (!t) return; clearTimeout(t); clearInterval(t); timers.delete(t); };
  const sendOne = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const send = (set, msg) => { const text = JSON.stringify(msg); for (const ws of set) if (ws.readyState === 1) ws.send(text); };
  const both = (msg) => { send(glasses, msg); send(phones, msg); };

  function cors(req) {
    const headers = { 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type, x-lens-token', vary: 'Origin' };
    if (!token) headers['access-control-allow-origin'] = '*';
    else {
      const origin = req.headers.origin;
      const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
      const own = req.headers.host ? `${proto}://${req.headers.host}` : '';
      if (origin && (origin === own || originAllowlist.has(origin))) headers['access-control-allow-origin'] = origin;
    }
    return headers;
  }
  const json = (req, res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', ...cors(req) }); res.end(JSON.stringify(obj)); };
  const authorized = (req) => !token || sameToken(req.headers['x-lens-token'], token);

  function loadTranslation(lang) {
    if (lang === 'en') return null;
    if (translations.has(lang)) return translations.get(lang);
    let data = null;
    try {
      const parsed = JSON.parse(readFileSync(path.join(i18nBase, `${lang}.json`), 'utf8'));
      if (!record(parsed)) throw new Error('translation root must be an object');
      data = parsed;
    } catch (e) {
      console.error(`i18n ${lang} unavailable: ${e.message}`);
    }
    translations.set(lang, data);
    return data;
  }

  function translationFor(data, objectId) {
    const translatedObjects = record(data?.objects) ? data.objects : null;
    return translatedObjects && Object.hasOwn(translatedObjects, objectId) && record(translatedObjects[objectId])
      ? translatedObjects[objectId]
      : null;
  }

  function mergeObject(obj, translated) {
    if (!translated) return obj;
    const chapters = Array.isArray(obj.chapters) ? obj.chapters.map((chapter) => {
      const translatedChapter = record(translated.chapters) && record(translated.chapters[chapter.lens])
        ? translated.chapters[chapter.lens]
        : null;
      if (!translatedChapter) return chapter;
      const captions = Array.isArray(translatedChapter.captions)
        && Array.isArray(chapter.captions)
        && translatedChapter.captions.length === chapter.captions.length
        && translatedChapter.captions.every((caption) => typeof caption === 'string')
        ? translatedChapter.captions
        : chapter.captions;
      return {
        ...chapter,
        ...(typeof translatedChapter.title === 'string' ? { title: translatedChapter.title } : {}),
        ...(typeof translatedChapter.lead === 'string' ? { lead: translatedChapter.lead } : {}),
        ...(captions !== undefined ? { captions } : {}),
      };
    }) : obj.chapters;
    return {
      ...obj,
      ...(typeof translated.label === 'string' ? { label: translated.label } : {}),
      ...(typeof translated.answer === 'string' ? { answer: translated.answer } : {}),
      ...(chapters !== undefined ? { chapters } : {}),
    };
  }

  function currentLast() {
    if (!lastShow) return { show: null, ageMs: null };
    const ageMs = Date.now() - lastShowAt;
    if (ageMs >= lastTtlMs) { lastShow = null; lastShowAt = 0; return { show: null, ageMs: null }; }
    return { show: lastShow, ageMs };
  }

  function summary() {
    const out = { count: records.length, provider: lastProvider };
    for (const stage of STAGES) {
      const values = records.map((r) => r[stage]).filter((x) => typeof x === 'number');
      out[stage] = { p50: pct(values, 50), p90: pct(values, 90) };
    }
    out.recent = records.slice(-10);
    return out;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; let failed = false; const chunks = [];
      req.on('data', (chunk) => {
        if (failed) return;
        size += chunk.length;
        if (size > BODY_LIMIT) { failed = true; reject(Object.assign(new Error('Body too large'), { status: 413 })); }
        else chunks.push(chunk);
      });
      req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
      req.on('error', (e) => { if (!failed) reject(e); });
    });
  }

  function objectFields(obj) {
    if (!obj || !Array.isArray(obj.chapters) || !obj.chapters.length) return {};
    const lenses = obj.chapters.map((chapter) => ({
      id: `${obj.id}.${chapter.lens}`, kind: chapter.lens, title: chapter.title,
      lead: chapter.lead || '', steps: Array.isArray(chapter.captions) ? chapter.captions : [],
    }));
    return {
      ...(typeof obj.answer === 'string' ? { summary: obj.answer } : {}),
      steps: lenses[0].steps,
      lenses,
    };
  }

  function mediaFields(objectId) {
    const manifest = path.join(mediaBase, objectId, 'manifest.json');
    if (!manifest.startsWith(mediaBase + path.sep) || !existsSync(manifest) || !statSync(manifest).isFile()) return {};
    try {
      const data = JSON.parse(readFileSync(manifest, 'utf8'));
      return data && data.lenses && typeof data.lenses === 'object' ? { media: { base: `/media/${objectId}`, lenses: data.lenses } } : {};
    } catch { return {}; }
  }

  function runDetect(args) {
    let timeout;
    const deadline = new Promise((_, reject) => { timeout = timer(() => { const e = new Error(`Detection timed out after ${detectTimeoutMs} ms`); e.code = 'detect_timeout'; reject(e); }, detectTimeoutMs); });
    return Promise.race([Promise.resolve().then(() => detectFn(args)), deadline]).finally(() => clearTimer(timeout));
  }

  async function handleDetect(req, res) {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch (e) { return json(req, res, e.status || 400, { error: e.status ? 'too_large' : 'bad_json' }); }
    const reqId = body.reqId || randomUUID();
    const lang = normalizeLang(body.lang);
    const t_received = Date.now(); const t_capture = Number(body.t_capture) || t_received;
    const preUploadMs = Number.isFinite(Number(body.preUploadMs)) ? Math.max(0, Number(body.preUploadMs)) : null;
    both({ type: 'detecting', reqId, timeoutMs: detectTimeoutMs + 2000, t_sent: Date.now() });
    if (!body.forceObjectId && provider !== 'mock' && !validJpegBase64(body.imageBase64)) {
      both({ type: 'error', code: 'bad_image', message: 'A valid JPEG image is required', reqId });
      return json(req, res, 400, { error: 'bad_image' });
    }
    try {
      // Optional centre crop ("aim"): the model classifies what is in it. A broken crop is dropped, not fatal.
      const focusBase64 = validJpegBase64(body.focusBase64) ? body.focusBase64 : undefined;
      const result = await runDetect({ imageBase64: body.imageBase64, focusBase64, question: body.question, forceObjectId: body.forceObjectId, lang, objects, provider, timeoutMs: detectTimeoutMs });
      if (result.provider !== 'forced') lastProvider = { provider: result.provider, model: result.model };
      const t_detected = Date.now(); const obj = byId[result.objectId];
      const translation = loadTranslation(lang);
      const translated = obj ? translationFor(translation, obj.id) : null;
      const libraryObject = translated ? mergeObject(obj, translated) : obj;
      const libraryLang = obj ? (translated ? lang : 'en') : (translation ? lang : 'en');
      const show = {
        type: 'show', reqId, objectId: result.objectId,
        label: libraryObject ? libraryObject.label : (typeof translation?.unknown_label === 'string' ? translation.unknown_label : 'Unknown object'),
        lang: libraryLang, confidence: result.confidence,
        ...(body.question ? { question: body.question } : {}),
        ...(result.answer ? { answer: result.answer } : {}),
        ...(!body.forceObjectId && result.provider !== 'forced' && result.objectId !== 'unknown' && obj && result.confidence < minConfidence ? { lowConfidence: true } : {}),
        ...(STAND_INS.has(result.provider) ? { standIn: true } : {}),
        ...objectFields(libraryObject), ...mediaFields(result.objectId),
        timings: { t_capture, t_received, t_detected, preUploadMs, detectMs: result.detectMs, model: result.model },
        t_sent: Date.now(),
      };
      pending.set(reqId, show); if (pending.size > 200) pending.delete(pending.keys().next().value);
      lastShow = show; lastShowAt = Date.now();
      both(show); json(req, res, 200, show);
    } catch (e) {
      const code = e.code === 'detect_timeout' ? 'detect_timeout' : 'detect_failed';
      both({ type: 'error', code, message: e.message, reqId });
      json(req, res, 502, { error: code, message: e.message, reqId });
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); const headers = cors(req);
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
    try {
      const protectedRoute = (req.method === 'POST' && url.pathname === '/detect') || (req.method === 'GET' && ['/last', '/latency'].includes(url.pathname));
      if (protectedRoute && !authorized(req)) return json(req, res, 401, { error: 'unauthorized' });
      if (req.method === 'GET' && url.pathname === '/phone') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers }); return res.end(readFileSync(path.join(here, 'public', 'phone.html'))); }
      if (req.method === 'GET' && url.pathname === '/objects') {
        if (!url.searchParams.has('lang')) return json(req, res, 200, { objects });
        const lang = normalizeLang(url.searchParams.get('lang'));
        const translation = loadTranslation(lang);
        const localized = translation ? objects.map((obj) => mergeObject(obj, translationFor(translation, obj.id))) : objects;
        return json(req, res, 200, { objects: localized, lang: translation ? lang : 'en' });
      }
      if (req.method === 'GET' && url.pathname === '/last') return json(req, res, 200, currentLast());
      if (req.method === 'GET' && url.pathname === '/latency') return json(req, res, 200, summary());
      if (req.method === 'GET' && url.pathname === '/health') return json(req, res, 200, { ok: true, auth: Boolean(token), provider, ...(STAND_INS.has(provider) ? { standIn: true } : {}), glasses: glasses.size, phones: phones.size });
      if (req.method === 'POST' && url.pathname === '/detect') return await handleDetect(req, res);
      if (req.method === 'GET' && url.pathname.startsWith('/media/') && serveFile(mediaBase, url.pathname.slice(7), res, headers, 'public, max-age=300', MEDIA_EXTS)) return;
      if (req.method === 'GET' && serveGlasses(url.pathname, res, headers)) return;
      json(req, res, 404, { error: 'not_found' });
    } catch (e) { json(req, res, 500, { error: 'server_error', message: e.message }); }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: BODY_LIMIT });
  wss.on('connection', (ws) => {
    let role = null; let authenticated = false; let missedBeats = 0;
    const failAuth = () => { sendOne(ws, { type: 'error', code: 'unauthorized', message: 'Bridge locked' }); ws.close(4401, 'Bridge locked'); };
    const helloTimer = timer(failAuth, helloTimeoutMs);
    ws.on('pong', () => { missedBeats = 0; });
    ws.on('close', () => { clearTimer(helloTimer); glasses.delete(ws); phones.delete(ws); });
    ws.on('message', (data) => {
      let message; try { message = JSON.parse(data.toString()); } catch { return; }
      if (message.type === 'hello') {
        if (!sameToken(message.token, token)) return failAuth();
        const nextRole = message.client === 'glasses' ? 'glasses' : message.client === 'phone' ? 'phone' : null;
        if (!nextRole) return;
        glasses.delete(ws); phones.delete(ws); role = nextRole; authenticated = true; clearTimer(helloTimer);
        if (role === 'glasses') {
          glasses.add(ws); const last = currentLast();
          if (last.show) sendOne(ws, { ...last.show, replay: true, ageMs: last.ageMs });
        } else phones.add(ws);
        return;
      }
      if (!authenticated) return;
      if (role === 'phone' && message.type === 'clear') { lastShow = null; lastShowAt = 0; return send(glasses, message); }
      if (role === 'phone' && ['nav', 'device', 'error'].includes(message.type)) return send(glasses, message);
      if (role === 'glasses' && message.type === 'state') return send(phones, message);
      if (role === 'glasses' && message.type === 'rendered') {
        const show = pending.get(message.reqId); if (!show) return; pending.delete(message.reqId);
        const timing = show.timings; const t_ack = Date.now();
        const pre = timing.preUploadMs ?? Math.max(0, timing.t_received - timing.t_capture);
        const record = {
          reqId: message.reqId, objectId: show.objectId, model: timing.model,
          captureToReceivedMs: pre, detectMs: timing.detectMs,
          detectedToRenderedMs: t_ack - timing.t_detected,
          totalMs: pre + (t_ack - timing.t_received), at: t_ack,
        };
        records.push(record);
        try { appendFileSync(latencyLog, JSON.stringify(record) + '\n'); } catch (e) { console.error('latency log failed', e.message); }
        send(phones, { type: 'latency', ...record });
      }
    });
    ws.beat = () => {
      if (!authenticated || ws.readyState !== 1) return;
      if (missedBeats >= 2) return ws.terminate();
      missedBeats += 1; sendOne(ws, { type: 'ping', t_sent: Date.now() }); ws.ping();
    };
  });
  timer(() => { for (const ws of wss.clients) ws.beat?.(); }, heartbeatMs, true);

  return new Promise((resolve) => {
    server.listen(port, () => resolve({
      server, port: server.address().port,
      close: () => new Promise((done) => {
        if (closing) return done(); closing = true;
        for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear();
        for (const ws of wss.clients) ws.terminate();
        wss.close(); server.close(() => done()); server.closeAllConnections();
      }),
    }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().then(({ port }) => console.log(`bridge on http://localhost:${port}  (phone: /phone, ws: /ws, provider: ${pickProvider()})`));
}
