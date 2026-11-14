import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSketchPrompt, parseSketchReply } from './sketch.js';
import { buildAskPrompt, parseAskReply, pickStep } from './ask.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OBJECTS_PATH = path.join(here, '..', 'shared', 'objects.json');
export function loadObjects() {
  return JSON.parse(readFileSync(OBJECTS_PATH, 'utf8')).objects;
}

export function pickProvider(env = process.env) {
  const p = env.DETECT_PROVIDER;
  if (p === 'anthropic' || p === 'gemini' || p === 'mock' || p === 'pi' || p === 'claude') return p;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

export function detectTimeout(env = process.env, provider = pickProvider(env)) {
  return Number(env.DETECT_TIMEOUT_MS) || (provider === 'claude' ? 60000 : provider === 'pi' ? 25000 : 8000);
}

const LANGUAGE_NAMES = { fi: 'Finnish', sv: 'Swedish', de: 'German', es: 'Spanish', fr: 'French' };

export function buildPrompt(objects, question, hasFocus = false, lang = 'en') {
  const list = objects.map((o) => `- ${o.id}: ${o.detect_hint}`).join('\n');
  const q = question
    ? `The wearer asked: "${question}". Put a reply in "answer": at most 2 short sentences, high-school level.`
    : `If objectId is "unknown", "answer" names the object and the physics in it in at most 2 short sentences, 25 words in all, with no description of the surroundings. Otherwise "answer" may be an empty string.`;
  const aim = hasFocus
    ? `You get two images from smart glasses. Image 1 is the full view. Image 2 is a zoom on the middle of image 1: that is where the wearer is looking.
Classify the main object in image 2. Use image 1 only to understand what that object is. Ignore objects that are only in image 1, even if they are bigger or in the list.`
    : `You classify a photo from smart glasses against a closed set of objects.
The wearer aims by looking: classify the object at or nearest the centre of the photo.`;
  const language = LANGUAGE_NAMES[lang]
    ? `\nWrite the "answer" field in ${LANGUAGE_NAMES[lang]}, and keep "objectId" exactly as listed.`
    : '';
  return `${aim}
Choose exactly one id, or "unknown" if it fits none:
${list}
- unknown: anything else
${q}${language}
Reply with strict JSON only, no markdown: {"objectId": string, "confidence": number 0-1, "answer": string}`;
}

export function parseModelJson(text, objects) {
  let s = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw codeErr('detect_failed', 'No JSON in model reply');
  let j;
  try { j = JSON.parse(s.slice(a, b + 1)); } catch { throw codeErr('detect_failed', 'Bad JSON from model'); }
  const ids = new Set(objects.map((o) => o.id));
  const objectId = ids.has(j.objectId) ? j.objectId : 'unknown';
  let confidence = Number(j.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  const answer = typeof j.answer === 'string'
    ? j.answer.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    : '';
  return { objectId, confidence, answer };
}

function codeErr(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function postJson(url, headers, body, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ac.signal });
    if (!r.ok) throw codeErr('detect_failed', `Provider HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } catch (e) {
    if (e.code) throw e;
    if (e.name === 'AbortError') throw codeErr('detect_timeout', `Detection timed out after ${timeoutMs} ms`);
    throw codeErr('detect_failed', e.message);
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropic({ imageBase64, focusBase64, prompt, env, timeoutMs, maxTokens }) {
  const model = env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
  const data = await postJson('https://api.anthropic.com/v1/messages',
    { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: maxTokens || 300, messages: [{ role: 'user', content: [
      ...[imageBase64, focusBase64].filter(Boolean).map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
      { type: 'text', text: prompt } ] }] }, timeoutMs);
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { text, model };
}

async function callGemini({ imageBase64, focusBase64, prompt, env, timeoutMs, maxTokens }) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': env.GEMINI_API_KEY },
    { contents: [{ role: 'user', parts: [...[imageBase64, focusBase64].filter(Boolean).map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })), { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}) } }, timeoutMs);
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { text, model };
}

/**
 * Dev-only provider: runs the local `pi` CLI, which uses whatever model login that machine has
 * (e.g. a Claude subscription), so no API key is needed. Slow (a new process per photo) and tied
 * to one person's account: use an API key provider for the demo.
 */
function callPi({ imageBase64, focusBase64, prompt, env, timeoutMs, purpose }) {
  const model = env.PI_DETECT_MODEL || 'anthropic/claude-haiku-4-5';
  let dir;
  const cleanup = () => { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } };
  const files = [];
  try {
    dir = mkdtempSync(path.join(os.tmpdir(), 'lens-'));
    if (imageBase64) {
      const file = path.join(dir, 'photo.jpg');
      writeFileSync(file, Buffer.from(imageBase64, 'base64'));
      files.push(`@${file}`);
    }
    if (focusBase64) {
      const focus = path.join(dir, 'focus.jpg');
      writeFileSync(focus, Buffer.from(focusBase64, 'base64'));
      files.push(`@${focus}`);
    }
  } catch (error) {
    cleanup();
    return Promise.reject(codeErr('detect_failed', `pi setup failed: ${error.message}`));
  }
  const systemPrompt = purpose === 'sketch' ? 'You explain photographed objects with validated JSON only.'
    : purpose === 'ask' ? 'You answer questions from supplied text. Output JSON only.'
      : 'You are an image classifier. Output JSON only.';
  const args = ['-p', '--no-session', '--no-tools', '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-mcp',
    '--thinking', 'off', '--system-prompt', systemPrompt, '--model', model, ...files, prompt];
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(env.PI_BIN || 'pi', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { cleanup(); reject(codeErr('detect_failed', `pi not runnable: ${error.message}`)); return; }
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    let settled = false;
    const done = (fn) => { if (settled) return; settled = true; clearTimeout(timer); cleanup(); fn(); };
    child.on('error', (e) => done(() => reject(codeErr('detect_failed', `pi not runnable: ${e.message}`))));
    child.on('close', (code, signal) => done(() => {
      if (signal === 'SIGKILL') return reject(codeErr('detect_timeout', `Detection timed out after ${timeoutMs} ms`));
      if (code !== 0) return reject(codeErr('detect_failed', `pi exited ${code}: ${err.slice(-200)}`));
      resolve({ text: out, model: `pi:${model}` });
    }));
  });
}

/** Providers that run on one person's own model login. Dev only: never the demo path, never on a shared server. */
export const STAND_INS = new Set(['pi', 'claude']);

/**
 * Dev-only stand-in: runs the local `claude` command (Claude Code) in print mode, with the login of
 * whoever runs the bridge. It reads the photo from a temp folder with its Read tool. Slow (a new
 * process per photo, several seconds) and it spends that person's subscription, so it must be chosen
 * explicitly with DETECT_PROVIDER=claude and must never run on the droplet.
 */
function callClaudeCli({ imageBase64, focusBase64, prompt, env, timeoutMs, purpose }) {
  // The model name goes on a shell command line on Windows, so keep it to a safe alphabet.
  const model = /^[A-Za-z0-9._-]{1,64}$/.test(env.CLAUDE_DETECT_MODEL || '') ? env.CLAUDE_DETECT_MODEL : 'haiku';
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lens-'));
  if (imageBase64) writeFileSync(path.join(dir, 'photo.jpg'), Buffer.from(imageBase64, 'base64'));
  if (focusBase64) writeFileSync(path.join(dir, 'focus.jpg'), Buffer.from(focusBase64, 'base64'));
  const role = purpose === 'sketch' ? 'You explain photographed objects.'
    : purpose === 'ask' ? 'You answer questions from supplied text.'
      : 'You are an image classifier.';
  const ask = imageBase64
    ? `${role} Read ${focusBase64 ? 'photo.jpg (image 1) and focus.jpg (image 2)' : 'photo.jpg'} in the current folder with the Read tool, then reply with the JSON only.\n\n${prompt}`
    : `${role} Reply with the JSON only.\n\n${prompt}`;
  // No argument contains a space: on Windows the command is a .cmd shim and needs a shell.
  const args = ['-p', '--model', model, '--tools', 'Read', '--allowedTools', 'Read(./*.jpg)', '--strict-mcp-config', '--output-format', 'text'];
  const win = process.platform === 'win32';
  return new Promise((resolve, reject) => {
    const child = spawn(env.CLAUDE_BIN || 'claude', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'], shell: win });
    let out = '', err = '', timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (win && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const done = (fn) => { clearTimeout(timer); try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp folder still busy */ } fn(); };
    child.on('error', (e) => done(() => reject(codeErr('detect_failed', `claude not runnable: ${e.message}`))));
    child.on('close', (code) => done(() => {
      if (timedOut) return reject(codeErr('detect_timeout', `Detection timed out after ${timeoutMs} ms`));
      if (code !== 0) return reject(codeErr('detect_failed', `claude exited ${code}: ${(err || out).slice(-200)}`));
      resolve({ text: out, model: `claude-cli:${model}` });
    }));
    child.stdin.on('error', () => { /* the process died first; close reports it */ });
    child.stdin.end(ask);
  });
}

/** Returns {objectId, confidence, answer, model, detectMs, provider}. Throws Error with .code on failure. */
export async function detect({ imageBase64, focusBase64, question, forceObjectId, lang = 'en', objects = loadObjects(), env = process.env, provider, timeoutMs }) {
  const t0 = Date.now();
  if (forceObjectId) {
    if (!objects.some((o) => o.id === forceObjectId) && forceObjectId !== 'unknown') throw codeErr('detect_failed', `Unknown forceObjectId ${forceObjectId}`);
    return { objectId: forceObjectId, confidence: 1, answer: '', model: 'forced', provider: 'forced', detectMs: Date.now() - t0 };
  }
  const prov = provider || pickProvider(env);
  // pi starts a process per photo, so it needs longer than a direct API call.
  timeoutMs = timeoutMs || detectTimeout(env, prov);
  if (prov === 'mock') {
    return { objectId: 'unknown', confidence: 0, answer: 'Mock mode: no model key set. Use the object buttons.', model: 'mock', provider: 'mock', detectMs: Date.now() - t0 };
  }
  if (!imageBase64) throw codeErr('detect_failed', 'No image supplied');
  if (prov === 'anthropic' && !env.ANTHROPIC_API_KEY) throw codeErr('detect_failed', 'ANTHROPIC_API_KEY not set');
  if (prov === 'gemini' && !env.GEMINI_API_KEY) throw codeErr('detect_failed', 'GEMINI_API_KEY not set');
  const prompt = buildPrompt(objects, question, Boolean(focusBase64), lang);
  const call = prov === 'anthropic' ? callAnthropic : prov === 'pi' ? callPi : prov === 'claude' ? callClaudeCli : callGemini;
  const { text, model } = await call({ imageBase64, focusBase64, prompt, env, timeoutMs, maxTokens: 300 });
  const parsed = parseModelJson(text, objects);
  return { ...parsed, model, provider: prov, detectMs: Date.now() - t0 };
}

/** Returns {answer, lensId, step, model, provider, ms}. Throws detect_failed or detect_timeout. */
export async function ask({ object, question, lang = 'en', env = process.env, provider, timeoutMs }) {
  const t0 = Date.now();
  const prov = provider || pickProvider(env);
  const local = () => {
    const match = pickStep(object, question);
    return {
      answer: match?.caption || '', lensId: match?.lensId || null, step: match?.step || null,
      model: 'local-match', provider: 'mock', ms: Date.now() - t0,
    };
  };
  const usable = prov === 'pi' || prov === 'claude'
    || (prov === 'anthropic' && Boolean(env.ANTHROPIC_API_KEY))
    || (prov === 'gemini' && Boolean(env.GEMINI_API_KEY));
  if (prov === 'mock' || !usable) return local();
  timeoutMs = timeoutMs || detectTimeout(env, prov);
  try {
    const prompt = buildAskPrompt({ object, question, lang });
    const call = prov === 'anthropic' ? callAnthropic : prov === 'pi' ? callPi : prov === 'claude' ? callClaudeCli : callGemini;
    const { text, model } = await call({ prompt, env, timeoutMs, maxTokens: 300, purpose: 'ask' });
    const parsed = parseAskReply(text, object);
    if (!parsed) throw codeErr('detect_failed', 'No usable answer in model reply');
    if (!parsed.lensId) {
      const match = pickStep(object, question);
      if (match) { parsed.lensId = match.lensId; parsed.step = match.step; }
    }
    return { ...parsed, model, provider: prov, ms: Date.now() - t0 };
  } catch (error) {
    if (error.code === 'detect_timeout') throw error;
    throw codeErr('detect_failed', error.message || 'Follow-up question failed');
  }
}

/** Returns {sketch, model, ms}. Throws sketch_failed or sketch_timeout. */
export async function sketch({ imageBase64, focusBase64, hint = '', lang = 'en', objects = loadObjects(), env = process.env, provider, timeoutMs }) {
  const t0 = Date.now();
  const prov = provider || pickProvider(env);
  timeoutMs = timeoutMs || (STAND_INS.has(prov) ? 60000 : 20000);
  try {
    if (prov === 'mock') throw codeErr('sketch_failed', 'Sketches are unavailable with the mock provider');
    if (!imageBase64) throw codeErr('sketch_failed', 'No image supplied');
    if (prov === 'anthropic' && !env.ANTHROPIC_API_KEY) throw codeErr('sketch_failed', 'ANTHROPIC_API_KEY not set');
    if (prov === 'gemini' && !env.GEMINI_API_KEY) throw codeErr('sketch_failed', 'GEMINI_API_KEY not set');
    const prompt = buildSketchPrompt({ objects, lang, hint });
    const call = prov === 'anthropic' ? callAnthropic : prov === 'pi' ? callPi : prov === 'claude' ? callClaudeCli : callGemini;
    const { text, model } = await call({ imageBase64, focusBase64, prompt, env, timeoutMs, maxTokens: 1800, purpose: 'sketch' });
    const parsed = parseSketchReply(text);
    if (!parsed) throw codeErr('sketch_failed', 'No usable sketch in model reply');
    return { sketch: parsed, model, ms: Date.now() - t0 };
  } catch (error) {
    if (error.code === 'sketch_timeout' || error.code === 'detect_timeout') throw codeErr('sketch_timeout', error.message);
    throw codeErr('sketch_failed', error.message || 'Sketch generation failed');
  }
}
