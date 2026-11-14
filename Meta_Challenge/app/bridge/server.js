import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { ask as answerQuestion, detect, detectTimeout, loadObjects, pickProvider, sketch as generateSketch, STAND_INS } from './detect.js';
import { pickStep, truncateAnswer } from './ask.js';
import { validateSketch } from './sketch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 2 * 1024 * 1024;
const WS_PAYLOAD_LIMIT = 64 * 1024;
const LATENCY_LOG_LIMIT = 20 * 1024 * 1024;
const QUESTION_LIMIT = 300;
const REQUEST_ID = /^[\w-]{1,64}$/;
const STAGES = ['captureToReceivedMs', 'detectMs', 'detectedToRenderedMs', 'totalMs'];
const GLASSES_DIST = path.resolve(here, '..', 'glasses', 'dist');
const MEDIA_EXTS = new Set(['.png', '.jpg', '.mp4', '.json', '.webp']);
const LANGUAGES = new Set(['en', 'fi', 'sv', 'de', 'es', 'fr']);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ERROR_MESSAGES = {
  unauthorized: 'A valid bridge token is required.',
  bad_json: 'The request body must be valid JSON.',
  too_large: 'The request body is too large.',
  bad_request: 'The request is invalid.',
  bad_image: 'A valid JPEG image is required.',
  busy: 'The model is busy; try again shortly.',
  detect_timeout: 'The model did not answer in time.',
  detect_failed: 'The model could not answer the request.',
  server_error: 'The bridge could not complete the request.',
};

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

const PHONE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-src 'self' http://localhost:* http://127.0.0.1:*; base-uri 'none'; form-action 'none'";
// The emulator page frames the glasses app from the same origin and uses the phone camera (secure context: HTTPS or localhost).
const EMULATOR_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-src 'self'; base-uri 'none'; form-action 'none'";

function serveFile(root, rel, req, res, headers, cache, allowedExts, readFile = readFileSync) {
  let decoded;
  try { decoded = decodeURIComponent(rel).replace(/^[/\\]+/, ''); } catch { return false; }
  const file = path.resolve(root, decoded);
  if (!file.startsWith(root + path.sep) || (allowedExts && !allowedExts.has(path.extname(file).toLowerCase())) || !existsSync(file) || !statSync(file).isFile()) return false;
  let data;
  try { data = readFile(file); }
  catch {
    res.writeHead(500, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify({ error: 'server_error' }));
    return true;
  }
  const ext = path.extname(file).toLowerCase();
  const responseHeaders = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': cache, ...headers };
  if (ext === '.mp4') responseHeaders['accept-ranges'] = 'bytes';
  const range = ext === '.mp4' ? req.headers.range : null;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    let start; let end;
    if (match && (match[1] || match[2])) {
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : data.length - 1;
      } else {
        const suffix = Number(match[2]);
        start = Math.max(0, data.length - suffix);
        end = data.length - 1;
      }
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= data.length) {
      res.writeHead(416, { ...responseHeaders, 'content-range': `bytes */${data.length}` });
      res.end();
      return true;
    }
    end = Math.min(end, data.length - 1);
    const part = data.subarray(start, end + 1);
    res.writeHead(206, { ...responseHeaders, 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': part.length });
    res.end(part);
    return true;
  }
  res.writeHead(200, { ...responseHeaders, 'content-length': data.length });
  res.end(data);
  return true;
}

function serveGlasses(pathname, req, res, headers, readFile) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  return serveFile(GLASSES_DIST, rel, req, res, headers, rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', undefined, readFile);
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

function plainRecord(value) {
  if (!record(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function copyTranslationData(value, depth = 1) {
  if (depth > 6) return undefined;
  if (typeof value === 'string') return value.slice(0, 80);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const result = [];
    for (const item of value.slice(0, 64)) {
      const copied = copyTranslationData(item, depth + 1);
      if (copied === undefined) return undefined;
      result.push(copied);
    }
    return result;
  }
  if (!plainRecord(value)) return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const copied = copyTranslationData(item, depth + 1);
    if (copied !== undefined) Object.defineProperty(result, key, { value: copied, enumerable: true, writable: true, configurable: true });
  }
  return result;
}

function mergeSpecText(base, translated) {
  if (Array.isArray(base)) {
    if (!Array.isArray(translated) || translated.length !== base.length) return base;
    return base.map((item, index) => mergeSpecText(item, translated[index]));
  }
  if (plainRecord(base)) {
    if (!plainRecord(translated)) return base;
    const result = { ...base };
    for (const key of Object.keys(base)) {
      if (Object.hasOwn(translated, key)) {
        Object.defineProperty(result, key, { value: mergeSpecText(base[key], translated[key]), enumerable: true, writable: true, configurable: true });
      }
    }
    return result;
  }
  if (typeof base === 'string' && typeof translated === 'string') return translated;
  if (typeof base === 'number' && typeof translated === 'number' && Number.isFinite(translated)) return translated;
  return base;
}

function translatedKnobLabels(translatedChapter, chapter) {
  if (!Array.isArray(translatedChapter?.knobs)) return undefined;
  const count = Array.isArray(chapter?.captions) ? chapter.captions.length : 0;
  if (translatedChapter.knobs.length !== count || !translatedChapter.knobs.every((label) => label === null || typeof label === 'string')) return undefined;
  return translatedChapter.knobs.slice();
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
  askFn = answerQuestion,
  provider = pickProvider(),
  allowOpen = process.env.LENS_ALLOW_OPEN === '1',
  maxInflight = positive(process.env.MAX_INFLIGHT, 4),
  maxSockets = positive(process.env.MAX_SOCKETS, 50),
  detectTimeoutMs = detectTimeout(process.env, provider),
  sketchProvider = process.env.SKETCH_PROVIDER || '',
  sketchFn = generateSketch,
  sketchTimeoutMs,
  mediaRoot = path.join(here, 'media'),
  i18nRoot = path.join(here, '..', 'shared', 'i18n'),
  readFileFn = readFileSync,
} = {}) {
  if ((provider === 'anthropic' || provider === 'gemini') && !token && !allowOpen) {
    throw new Error('LENS_TOKEN is required when using a paid model provider; set LENS_ALLOW_OPEN=1 only for an intentional open deployment');
  }
  maxInflight = Math.max(1, Math.floor(maxInflight));
  maxSockets = Math.max(1, Math.floor(maxSockets));
  const byId = new Map(objects.map((o) => [o.id, o]));
  const mediaBase = path.resolve(mediaRoot);
  const i18nBase = path.resolve(i18nRoot);
  const translations = new Map();
  const originAllowlist = new Set(String(allowedOrigins).split(',').map((s) => s.trim()).filter(Boolean));
  const requestedSketchMode = sketchProvider === 'fixture' || sketchProvider === 'auto' ? sketchProvider : 'off';
  const sketchMode = requestedSketchMode === 'auto' && provider === 'mock' ? 'off' : requestedSketchMode;
  const sketchDeadlineMs = positive(sketchTimeoutMs ?? process.env.SKETCH_TIMEOUT_MS, STAND_INS.has(provider) ? 60000 : 20000);
  const glasses = new Set(); const phones = new Set();
  const pending = new Map(); const records = []; const requests = []; const timers = new Set();
  let lastProvider = null; let lastShow = null; let lastShowAt = 0; let closing = false;
  let requestSequence = 0; let latestFinishedSequence = 0; let clearGeneration = 0; let inflight = 0;
  let latencyBytes = 0; let latencyWarning = false; let latencyWrites = Promise.resolve();
  try { latencyBytes = statSync(latencyLog).size; } catch { /* new log */ }

  const timer = (fn, ms, interval = false) => {
    const t = interval ? setInterval(fn, ms) : setTimeout(() => { timers.delete(t); fn(); }, ms);
    t.unref(); timers.add(t); return t;
  };
  const clearTimer = (t) => { if (!t) return; clearTimeout(t); clearInterval(t); timers.delete(t); };
  const sendOne = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const send = (set, msg) => { const text = JSON.stringify(msg); for (const ws of set) if (ws.readyState === 1) ws.send(text); };
  const both = (msg) => { send(glasses, msg); send(phones, msg); };

  const requestContext = () => ({ sequence: ++requestSequence, clearGeneration });
  const currentResult = (context) => context.clearGeneration === clearGeneration && context.sequence >= latestFinishedSequence;
  const finishSequence = (context) => { latestFinishedSequence = Math.max(latestFinishedSequence, context.sequence); };
  const withModelSlot = async (counts, fn) => {
    if (!counts) return fn();
    if (inflight >= maxInflight) { const error = new Error('Model capacity is busy'); error.code = 'busy'; throw error; }
    inflight += 1;
    try { return await fn(); } finally { inflight -= 1; }
  };

  function queueLatency(line) {
    const bytes = Buffer.byteLength(line);
    latencyWrites = latencyWrites.then(async () => {
      if (latencyBytes + bytes > LATENCY_LOG_LIMIT) {
        if (!latencyWarning) { latencyWarning = true; console.warn('latency log limit reached; further records are not written'); }
        return;
      }
      try { await appendFile(latencyLog, line); latencyBytes += bytes; }
      catch (e) { console.error('latency log failed', e.message); }
    });
  }

  function runSketch(args) {
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = timer(() => {
        const error = new Error(`Sketch timed out after ${sketchDeadlineMs} ms`);
        error.code = 'sketch_timeout'; reject(error);
      }, sketchDeadlineMs);
    });
    const work = sketchMode === 'fixture'
      ? new Promise((resolve, reject) => timer(() => {
        try {
          const fixture = JSON.parse(readFileSync(path.join(here, 'fixtures', 'sketch-stapler.json'), 'utf8'));
          resolve({ sketch: fixture, model: 'fixture', ms: 300 });
        } catch (error) { reject(error); }
      }, 300))
      : withModelSlot(provider !== 'mock', () => Promise.resolve().then(() => sketchFn(args)));
    return Promise.race([work, deadline]).then((result) => {
      const cleaned = validateSketch(result?.sketch ?? result);
      if (!cleaned) { const error = new Error('Invalid sketch'); error.code = 'sketch_failed'; throw error; }
      return { sketch: cleaned, model: result?.model || (sketchMode === 'fixture' ? 'fixture' : 'unknown'), ms: result?.ms };
    }).finally(() => clearTimer(timeout));
  }

  function finishSketch(reqId, args, context) {
    return runSketch(args).then(({ sketch }) => {
      if (!currentResult(context)) return { sketch, stale: true };
      if (lastShow?.reqId === reqId) {
        const { sketchPending: _pending, sketchError: _error, ...remembered } = lastShow;
        lastShow = { ...remembered, sketch };
      }
      both({ type: 'sketch', reqId, sketch, ...(sketchMode === 'auto' && STAND_INS.has(provider) ? { standIn: true } : {}) });
      return { sketch };
    }, () => {
      if (!currentResult(context)) return { error: 'sketch_failed', stale: true };
      if (lastShow?.reqId === reqId) {
        const { sketchPending: _pending, ...remembered } = lastShow;
        lastShow = remembered;
      }
      both({ type: 'sketch', reqId, error: 'sketch_failed' });
      return { error: 'sketch_failed' };
    });
  }

  function cors(req) {
    const headers = { ...SECURITY_HEADERS, 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type, x-lens-token', vary: 'Origin' };
    if (!token) headers['access-control-allow-origin'] = '*';
    else {
      const origin = req.headers.origin;
      const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
      const own = req.headers.host ? `${proto}://${req.headers.host}` : '';
      if (origin && (origin === own || originAllowlist.has(origin))) headers['access-control-allow-origin'] = origin;
    }
    return headers;
  }
  const json = (req, res, code, obj, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...cors(req), ...extra }); res.end(JSON.stringify(obj)); };
  const knownRequestIds = new WeakMap();
  const requestError = (req, res, status, error, reqId = requestId(), extra = {}, message = ERROR_MESSAGES[error] || ERROR_MESSAGES.server_error) => {
    knownRequestIds.set(req, reqId);
    return json(req, res, status, { error, message, reqId }, extra);
  };
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
      const specText = plainRecord(translatedChapter.spec) ? copyTranslationData(translatedChapter.spec) : undefined;
      const knobLabels = translatedKnobLabels(translatedChapter, chapter);
      const knobs = knobLabels && Array.isArray(chapter.knobs) && chapter.knobs.length === knobLabels.length
        ? chapter.knobs.map((knob, index) => (record(knob) && typeof knobLabels[index] === 'string' ? { ...knob, label: knobLabels[index] } : knob))
        : chapter.knobs;
      return {
        ...chapter,
        ...(typeof translatedChapter.title === 'string' ? { title: translatedChapter.title } : {}),
        ...(typeof translatedChapter.lead === 'string' ? { lead: translatedChapter.lead } : {}),
        ...(captions !== undefined ? { captions } : {}),
        ...(specText !== undefined && chapter.spec !== undefined ? { spec: mergeSpecText(chapter.spec, specText) } : {}),
        ...(knobs !== undefined ? { knobs } : {}),
      };
    }) : obj.chapters;
    return {
      ...obj,
      ...(typeof translated.label === 'string' ? { label: translated.label } : {}),
      ...(typeof translated.answer === 'string' ? { answer: translated.answer } : {}),
      ...(typeof translated.tagline === 'string' ? { tagline: translated.tagline } : {}),
      ...(typeof translated.short === 'string' ? { short: translated.short } : {}),
      ...(chapters !== undefined ? { chapters } : {}),
    };
  }

  let pendingCapture = null;
  let captureSeq = 0;

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
    const requestDetectMs = requests.map((item) => item.detectMs).filter((value) => typeof value === 'number');
    out.requests = {
      count: requests.length,
      detectMs: { p50: pct(requestDetectMs, 50), p90: pct(requestDetectMs, 90) },
      byProvider: requests.reduce((counts, item) => {
        if (item.provider) counts[item.provider] = (counts[item.provider] || 0) + 1;
        return counts;
      }, {}),
      byObject: requests.reduce((counts, item) => {
        if (item.objectId) counts[item.objectId] = (counts[item.objectId] || 0) + 1;
        return counts;
      }, {}),
    };
    return out;
  }

  function logValue(value) {
    return String(value ?? '-').replace(/[^A-Za-z0-9._:-]/g, '_');
  }

  function finishRequest(kind, { reqId, objectId, confidence, detectMs, requestProvider, model, error }) {
    const item = {
      reqId, kind, objectId: objectId || null, provider: requestProvider || null,
      detectMs: Number.isFinite(detectMs) ? Math.max(0, detectMs) : null,
      error: error || null, at: Date.now(),
    };
    requests.push(item); if (requests.length > 500) requests.shift();
    if (error) console.log(`error ${logValue(reqId).slice(0, 8)} ${logValue(error)} ${logValue(item.detectMs)}ms ${logValue(model || requestProvider)}`);
    else console.log(`${kind} ${logValue(reqId).slice(0, 8)} ${logValue(objectId)} ${logValue(confidence)} ${logValue(item.detectMs)}ms ${logValue(model || requestProvider)}`);
  }

  function finishLatency(reqId, renderMs) {
    const show = pending.get(reqId); if (!show) return null;
    pending.delete(reqId);
    const timing = show.timings; const t_ack = Date.now();
    const pre = typeof timing.preUploadMs === 'number' ? timing.preUploadMs : null;
    const serverRenderMs = Math.max(0, t_ack - timing.t_detected);
    const renderedMs = typeof renderMs === 'number' && Number.isFinite(renderMs) && renderMs >= 0 ? renderMs : serverRenderMs;
    const latency = {
      reqId, objectId: show.objectId, model: timing.model,
      captureToReceivedMs: pre, detectMs: timing.detectMs,
      detectedToRenderedMs: renderedMs,
      totalMs: (pre ?? 0) + Math.max(0, timing.t_detected - timing.t_received) + renderedMs, at: t_ack,
    };
    records.push(latency); if (records.length > 500) records.shift();
    queueLatency(JSON.stringify(latency) + '\n');
    send(phones, { type: 'latency', ...latency });
    return latency;
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

  function objectFields(obj, translated, lang) {
    if (!obj || !Array.isArray(obj.chapters) || !obj.chapters.length) return {};
    const lenses = obj.chapters.map((chapter) => {
      const translatedChapter = lang !== 'en' && record(translated?.chapters) && record(translated.chapters[chapter.lens])
        ? translated.chapters[chapter.lens]
        : null;
      const specText = plainRecord(translatedChapter?.spec) ? copyTranslationData(translatedChapter.spec) : undefined;
      const knobLabels = translatedKnobLabels(translatedChapter, chapter);
      return {
        id: `${obj.id}.${chapter.lens}`, kind: chapter.lens, title: chapter.title,
        ...(typeof chapter.lead === 'string' && chapter.lead ? { lead: chapter.lead } : {}),
        steps: Array.isArray(chapter.captions) ? chapter.captions : [],
        ...(specText !== undefined ? { specText } : {}),
        ...(knobLabels !== undefined ? { knobLabels } : {}),
      };
    });
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

  function libraryPresentation(objectId, lang) {
    const object = byId.get(objectId);
    const translation = loadTranslation(lang);
    const translated = object ? translationFor(translation, object.id) : null;
    const libraryObject = translated ? mergeObject(object, translated) : object;
    const libraryLang = object ? (translated ? lang : 'en') : (translation ? lang : 'en');
    return {
      object, translated, libraryObject, libraryLang, translation,
      fields: {
        label: libraryObject ? libraryObject.label : (typeof translation?.unknown_label === 'string' ? translation.unknown_label : 'Unknown object'),
        lang: libraryLang,
        ...objectFields(libraryObject, translated, libraryLang), ...mediaFields(objectId),
      },
    };
  }

  function askObject(object, libraryObject, translated) {
    if (!translated || !Array.isArray(object?.chapters) || !Array.isArray(libraryObject?.chapters)) return object;
    return {
      ...libraryObject,
      chapters: libraryObject.chapters.map((chapter, index) => ({
        ...chapter,
        englishTitle: object.chapters[index]?.title,
        englishLead: object.chapters[index]?.lead,
        englishCaptions: object.chapters[index]?.captions,
      })),
    };
  }

  function runDetect(args) {
    let timeout;
    const deadline = new Promise((_, reject) => { timeout = timer(() => { const e = new Error(`Detection timed out after ${detectTimeoutMs} ms`); e.code = 'detect_timeout'; reject(e); }, detectTimeoutMs); });
    const work = withModelSlot(!args.forceObjectId && provider !== 'mock', () => Promise.resolve().then(() => detectFn(args)));
    return Promise.race([work, deadline]).finally(() => clearTimer(timeout));
  }

  function runAsk(args) {
    let timeout;
    const deadline = new Promise((_, reject) => { timeout = timer(() => { const e = new Error(`Detection timed out after ${detectTimeoutMs} ms`); e.code = 'detect_timeout'; reject(e); }, detectTimeoutMs); });
    const work = withModelSlot(provider !== 'mock', () => Promise.resolve().then(() => askFn(args)));
    return Promise.race([work, deadline]).finally(() => clearTimer(timeout));
  }

  function requestId(value) {
    return typeof value === 'string' && REQUEST_ID.test(value) ? value : randomUUID();
  }

  async function bodyObject(req, res, detailedErrors = false) {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch (e) {
      const error = e.status ? 'too_large' : 'bad_json';
      if (detailedErrors) requestError(req, res, e.status || 400, error);
      else json(req, res, e.status || 400, { error });
      return null;
    }
    if (!record(body)) {
      if (detailedErrors) requestError(req, res, 400, 'bad_json');
      else json(req, res, 400, { error: 'bad_json' });
      return null;
    }
    return body;
  }

  async function handleDetect(req, res) {
    const context = requestContext();
    const body = await bodyObject(req, res, true); if (!body) { finishSequence(context); return; }
    const reqId = requestId(body.reqId);
    knownRequestIds.set(req, reqId);
    const lang = normalizeLang(body.lang);
    // null means "no question": the Android app sends `"question": null` with every photo (found on real glasses, 14 Nov).
    if (body.question != null && typeof body.question !== 'string') { finishSequence(context); return requestError(req, res, 400, 'bad_request', reqId); }
    const question = typeof body.question === 'string' ? body.question.trim().slice(0, QUESTION_LIMIT) : '';
    const forceObjectId = typeof body.forceObjectId === 'string' ? body.forceObjectId : null;
    if (body.forceObjectId !== undefined && (!forceObjectId || (forceObjectId !== 'unknown' && !byId.has(forceObjectId)))) {
      finishSequence(context);
      return requestError(req, res, 400, 'bad_request', reqId);
    }
    const t_received = Date.now(); const t_capture = Number(body.t_capture) || t_received;
    const preUploadMs = typeof body.preUploadMs === 'number' && Number.isFinite(body.preUploadMs) && body.preUploadMs >= 0 ? body.preUploadMs : null;
    both({ type: 'detecting', reqId, timeoutMs: detectTimeoutMs + 2000, t_sent: Date.now() });
    if (!forceObjectId && provider !== 'mock' && !validJpegBase64(body.imageBase64)) {
      finishSequence(context);
      finishRequest('detect', { reqId, detectMs: Date.now() - t_received, requestProvider: provider, model: provider, error: 'bad_image' });
      both({ type: 'error', code: 'bad_image', message: 'A valid JPEG image is required', reqId });
      return requestError(req, res, 400, 'bad_image', reqId);
    }
    try {
      // Optional centre crop ("aim"): the model classifies what is in it. A broken crop is dropped, not fatal.
      const focusBase64 = validJpegBase64(body.focusBase64) ? body.focusBase64 : undefined;
      const result = await runDetect({ imageBase64: body.imageBase64, focusBase64, question, forceObjectId, lang, objects, provider, timeoutMs: detectTimeoutMs });
      if (result.provider !== 'forced') lastProvider = { provider: result.provider, model: result.model };
      const t_detected = Date.now(); const presentation = libraryPresentation(result.objectId, lang);
      const obj = presentation.object;
      const show = {
        type: 'show', reqId, objectId: result.objectId,
        ...presentation.fields, confidence: result.confidence,
        ...(question ? { question } : {}),
        ...(result.answer ? { answer: result.answer } : {}),
        ...(!forceObjectId && result.provider !== 'forced' && result.objectId !== 'unknown' && obj && result.confidence < minConfidence ? { lowConfidence: true } : {}),
        ...(STAND_INS.has(result.provider) ? { standIn: true } : {}),
        timings: { t_capture, t_received, t_detected, preUploadMs, detectMs: result.detectMs, model: result.model },
        t_sent: Date.now(),
      };
      const shouldSketch = sketchMode !== 'off' && result.objectId === 'unknown' && !forceObjectId && validJpegBase64(body.imageBase64);
      if (shouldSketch) show.sketchPending = true;
      pending.set(reqId, show); if (pending.size > 200) pending.delete(pending.keys().next().value);
      const fresh = currentResult(context);
      finishSequence(context);
      if (fresh) { lastShow = show; lastShowAt = Date.now(); both(show); }
      finishRequest('detect', {
        reqId, objectId: result.objectId, confidence: result.confidence, detectMs: result.detectMs,
        requestProvider: result.provider, model: result.model,
      });
      if (!shouldSketch) return json(req, res, 200, show);
      const outcome = finishSketch(reqId, {
        imageBase64: body.imageBase64, focusBase64, hint: result.answer || '', lang,
        objects, env: process.env, provider, timeoutMs: sketchDeadlineMs,
      }, context);
      if (!body.waitSketch) return json(req, res, 200, show);
      const settled = await outcome;
      const { sketchPending: _pending, ...responseShow } = show;
      if (settled.sketch) responseShow.sketch = settled.sketch;
      else responseShow.sketchError = 'sketch_failed';
      return json(req, res, 200, responseShow);
    } catch (e) {
      finishSequence(context);
      if (e.code === 'busy') {
        finishRequest('detect', { reqId, detectMs: Date.now() - t_received, requestProvider: provider, model: provider, error: 'busy' });
        both({ type: 'error', code: 'busy', message: 'Model capacity is busy', reqId });
        return requestError(req, res, 429, 'busy', reqId, { 'retry-after': '2' });
      }
      const code = e.code === 'detect_timeout' ? 'detect_timeout' : 'detect_failed';
      finishRequest('detect', { reqId, detectMs: Date.now() - t_received, requestProvider: provider, model: provider, error: code });
      both({ type: 'error', code, message: e.message, reqId });
      requestError(req, res, 502, code, reqId);
    }
  }

  async function handleAsk(req, res) {
    const context = requestContext();
    const body = await bodyObject(req, res, true); if (!body) { finishSequence(context); return; }
    const reqId = requestId(body.reqId);
    knownRequestIds.set(req, reqId);
    const lang = normalizeLang(body.lang);
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const object = typeof body.aboutObjectId === 'string' ? byId.get(body.aboutObjectId) : null;
    const t_received = Date.now();
    both({ type: 'detecting', reqId, timeoutMs: detectTimeoutMs + 2000, t_sent: Date.now() });
    if (!question || question.length > QUESTION_LIMIT || !object) {
      finishSequence(context);
      const message = !object ? 'A library aboutObjectId is required' : `Question must be 1 to ${QUESTION_LIMIT} characters`;
      finishRequest('ask', { reqId, detectMs: Date.now() - t_received, requestProvider: provider, model: provider, error: 'bad_request' });
      both({ type: 'error', code: 'bad_request', message, reqId });
      return requestError(req, res, 400, 'bad_request', reqId, {}, `${message}.`);
    }
    try {
      const presentation = libraryPresentation(object.id, lang);
      const scoringObject = askObject(object, presentation.libraryObject, presentation.translated);
      const result = await runAsk({ object: scoringObject, question, lang, env: process.env, provider, timeoutMs: detectTimeoutMs });
      let lensId = result?.lensId;
      let step = result?.step;
      let chapter = object.chapters?.find((item) => `${object.id}.${item.lens}` === lensId);
      let matched = Boolean(chapter && Number.isInteger(step) && step >= 1 && step <= (chapter.captions?.length || 0));
      const rawAnswer = typeof result?.answer === 'string' ? result.answer.trim() : '';
      if (rawAnswer && !matched) {
        const local = pickStep(scoringObject, question);
        lensId = local?.lensId || null;
        step = local?.step || null;
        chapter = object.chapters?.find((item) => `${object.id}.${item.lens}` === lensId);
        matched = Boolean(chapter && Number.isInteger(step) && step >= 1 && step <= (chapter.captions?.length || 0));
      }
      const noMatch = !rawAnswer || !matched;
      const t_detected = Date.now();
      const model = typeof result?.model === 'string' ? result.model : 'unknown';
      const detectMs = Number.isFinite(result?.ms) ? result.ms : t_detected - t_received;
      if (result?.provider) lastProvider = { provider: result.provider, model };
      const answer = noMatch
        ? (typeof presentation.fields.summary === 'string' ? presentation.fields.summary : '')
        : (model === 'local-match' ? rawAnswer.slice(0, 300) : truncateAnswer(rawAnswer));
      const show = {
        type: 'show', reqId, objectId: object.id,
        ...presentation.fields, confidence: 1, question,
        answer,
        ...(!noMatch ? { lensHint: { id: lensId, step } } : { noMatch: true }),
        ...(STAND_INS.has(result?.provider) ? { standIn: true } : {}),
        timings: {
          t_capture: t_received, t_received, t_detected, preUploadMs: null,
          detectMs, model,
        },
        t_sent: Date.now(),
      };
      pending.set(reqId, show); if (pending.size > 200) pending.delete(pending.keys().next().value);
      const fresh = currentResult(context);
      finishSequence(context);
      if (fresh) { lastShow = show; lastShowAt = Date.now(); both(show); }
      finishRequest('ask', {
        reqId, objectId: object.id, confidence: 1, detectMs,
        requestProvider: result?.provider || provider, model,
      });
      return json(req, res, 200, show);
    } catch (e) {
      finishSequence(context);
      if (e.code === 'busy') {
        finishRequest('ask', { reqId, detectMs: Date.now() - t_received, requestProvider: provider, model: provider, error: 'busy' });
        both({ type: 'error', code: 'busy', message: 'Model capacity is busy', reqId });
        return requestError(req, res, 429, 'busy', reqId, { 'retry-after': '2' });
      }
      const code = e.code === 'detect_timeout' ? 'detect_timeout' : 'detect_failed';
      finishRequest('ask', { reqId, detectMs: Date.now() - t_received, requestProvider: provider, model: provider, error: code });
      both({ type: 'error', code, message: e.message, reqId });
      return requestError(req, res, 502, code, reqId);
    }
  }

  async function handleRendered(req, res) {
    const body = await bodyObject(req, res); if (!body) return;
    const latency = finishLatency(body.reqId, body.renderMs);
    if (!latency) return json(req, res, 404, { error: 'unknown_request' });
    return json(req, res, 200, { ok: true, ...latency });
  }

  const server = http.createServer(async (req, res) => {
    const endpointRoute = String(req.url || '').split('?', 1)[0];
    const detailedRoute = endpointRoute === '/ask' || endpointRoute === '/detect';
    try {
      let url;
      try { url = new URL(req.url, 'http://x'); }
      catch {
        if (detailedRoute) return requestError(req, res, 400, 'bad_request');
        return json(req, res, 400, { error: 'bad_request' });
      }
      const headers = cors(req);
      if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
      const protectedRoute = (req.method === 'POST' && ['/detect', '/ask', '/rendered'].includes(url.pathname)) || (req.method === 'GET' && ['/last', '/latency', '/capture'].includes(url.pathname));
      if (protectedRoute && !authorized(req)) {
        if (detailedRoute) return requestError(req, res, 401, 'unauthorized');
        return json(req, res, 401, { error: 'unauthorized' });
      }
      if (req.method === 'GET' && url.pathname === '/phone') {
        let page;
        try { page = readFileFn(path.join(here, 'public', 'phone.html')); }
        catch { return json(req, res, 500, { error: 'server_error' }); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PHONE_CSP, ...headers });
        return res.end(page);
      }
      if (req.method === 'GET' && url.pathname === '/emulator') {
        let page;
        try { page = readFileFn(path.join(here, 'public', 'emulator.html')); }
        catch { return json(req, res, 500, { error: 'server_error' }); }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': EMULATOR_CSP, 'permissions-policy': 'camera=(self), fullscreen=(self)', 'cache-control': 'no-cache', ...headers });
        return res.end(page);
      }
      if (req.method === 'GET' && url.pathname === '/objects') {
        if (!url.searchParams.has('lang')) return json(req, res, 200, { objects });
        const lang = normalizeLang(url.searchParams.get('lang'));
        const translation = loadTranslation(lang);
        const localized = translation ? objects.map((obj) => mergeObject(obj, translationFor(translation, obj.id))) : objects;
        return json(req, res, 200, { objects: localized, lang: translation ? lang : 'en' });
      }
      if (req.method === 'GET' && url.pathname === '/last') return json(req, res, 200, currentLast());
      // Camera-only mode: the phone app polls this; a request from the Web App younger than 10 s is handed out once.
      if (req.method === 'GET' && url.pathname === '/capture') {
        const after = Number(url.searchParams.get('after')) || 0;
        const fresh = pendingCapture && pendingCapture.id > after && Date.now() - pendingCapture.at < 10000;
        return json(req, res, 200, fresh ? { capture: true, id: pendingCapture.id } : { capture: false, id: pendingCapture ? pendingCapture.id : 0 });
      }
      if (req.method === 'GET' && url.pathname === '/latency') return json(req, res, 200, summary());
      if (req.method === 'GET' && url.pathname === '/health') return json(req, res, 200, { ok: true, auth: Boolean(token), ...(!token ? { open: true } : {}), provider, sketch: sketchMode, ...(STAND_INS.has(provider) ? { standIn: true } : {}), glasses: glasses.size, phones: phones.size });
      if (req.method === 'POST' && url.pathname === '/detect') return await handleDetect(req, res);
      if (req.method === 'POST' && url.pathname === '/ask') return await handleAsk(req, res);
      if (req.method === 'POST' && url.pathname === '/rendered') return await handleRendered(req, res);
      if (req.method === 'GET' && url.pathname.startsWith('/media/') && serveFile(mediaBase, url.pathname.slice(7), req, res, headers, 'public, max-age=300', MEDIA_EXTS, readFileFn)) return;
      if (req.method === 'GET' && serveGlasses(url.pathname, req, res, headers, readFileFn)) return;
      if (detailedRoute) requestError(req, res, 404, 'bad_request');
      else json(req, res, 404, { error: 'not_found' });
    } catch (e) {
      if (!res.headersSent && detailedRoute) requestError(req, res, 500, 'server_error', knownRequestIds.get(req) || requestId());
      else if (!res.headersSent) json(req, res, 500, { error: 'server_error' });
      else res.destroy();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: WS_PAYLOAD_LIMIT });
  wss.on('connection', (ws) => {
    ws.on('error', () => {});
    if (wss.clients.size > maxSockets) { ws.close(1013, 'Try again later'); return; }
    let role = null; let authenticated = false; let missedBeats = 0;
    const failAuth = () => { sendOne(ws, { type: 'error', code: 'unauthorized', message: 'Bridge locked' }); ws.close(4401, 'Bridge locked'); };
    const helloTimer = timer(failAuth, helloTimeoutMs);
    ws.on('pong', () => { missedBeats = 0; });
    ws.on('close', () => { clearTimer(helloTimer); glasses.delete(ws); phones.delete(ws); });
    ws.on('message', (data) => {
      try {
        let message; try { message = JSON.parse(data.toString()); } catch { return; }
        if (!record(message)) return;
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
        if (role === 'phone' && message.type === 'clear') {
          clearGeneration += 1; lastShow = null; lastShowAt = 0; return send(glasses, message);
        }
        if (role === 'phone' && ['nav', 'device', 'error'].includes(message.type)) return send(glasses, message);
        if (role === 'glasses' && message.type === 'state') return send(phones, message);
        // Camera-only mode: the Web App asks for a photo; phone apps poll GET /capture (or get it over a socket).
        if (role === 'glasses' && message.type === 'capture') { pendingCapture = { id: ++captureSeq, at: Date.now() }; return send(phones, { type: 'capture', id: pendingCapture.id }); }
        if (role === 'glasses' && message.type === 'rendered') finishLatency(message.reqId);
      } catch { /* ignore malformed or hostile frames */ }
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
        wss.close(); server.close(() => latencyWrites.finally(done)); server.closeAllConnections();
      }),
    }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.on('unhandledRejection', () => console.error('unhandled rejection'));
  process.on('uncaughtException', () => console.error('uncaught exception'));
  start().then(({ port }) => console.log(`bridge on http://localhost:${port}  (phone: /phone, ws: /ws, provider: ${pickProvider()})`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
