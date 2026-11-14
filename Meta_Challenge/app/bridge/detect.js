import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OBJECTS_PATH = path.join(here, '..', 'shared', 'objects.json');
export function loadObjects() {
  return JSON.parse(readFileSync(OBJECTS_PATH, 'utf8')).objects;
}

export function pickProvider(env = process.env) {
  const p = env.DETECT_PROVIDER;
  if (p === 'anthropic' || p === 'gemini' || p === 'mock' || p === 'pi') return p;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.GEMINI_API_KEY) return 'gemini';
  return 'mock';
}

export function detectTimeout(env = process.env, provider = pickProvider(env)) {
  return Number(env.DETECT_TIMEOUT_MS) || (provider === 'pi' ? 25000 : 8000);
}

export function buildPrompt(objects, question, hasFocus = false) {
  const list = objects.map((o) => `- ${o.id}: ${o.detect_hint}`).join('\n');
  const q = question
    ? `The wearer asked: "${question}". Put a reply in "answer": at most 2 short sentences, high-school level.`
    : `If objectId is "unknown", "answer" is a 2-sentence plain explanation of the object in the photo and the physics in it. Otherwise "answer" may be an empty string.`;
  const aim = hasFocus
    ? `You get two images from smart glasses. Image 1 is the full view. Image 2 is a zoom on the middle of image 1: that is where the wearer is looking.
Classify the main object in image 2. Use image 1 only to understand what that object is. Ignore objects that are only in image 1, even if they are bigger or in the list.`
    : `You classify a photo from smart glasses against a closed set of objects.
The wearer aims by looking: classify the object at or nearest the centre of the photo.`;
  return `${aim}
Choose exactly one id, or "unknown" if it fits none:
${list}
- unknown: anything else
${q}
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
  return { objectId, confidence, answer: typeof j.answer === 'string' ? j.answer : '' };
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

async function callAnthropic({ imageBase64, focusBase64, prompt, env, timeoutMs }) {
  const model = env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
  const data = await postJson('https://api.anthropic.com/v1/messages',
    { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 300, messages: [{ role: 'user', content: [
      ...[imageBase64, focusBase64].filter(Boolean).map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
      { type: 'text', text: prompt } ] }] }, timeoutMs);
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return { text, model };
}

async function callGemini({ imageBase64, focusBase64, prompt, env, timeoutMs }) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': env.GEMINI_API_KEY },
    { contents: [{ role: 'user', parts: [...[imageBase64, focusBase64].filter(Boolean).map((data) => ({ inline_data: { mime_type: 'image/jpeg', data } })), { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 } }, timeoutMs);
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { text, model };
}

/**
 * Dev-only provider: runs the local `pi` CLI, which uses whatever model login that machine has
 * (e.g. a Claude subscription), so no API key is needed. Slow (a new process per photo) and tied
 * to one person's account: use an API key provider for the demo.
 */
function callPi({ imageBase64, focusBase64, prompt, env, timeoutMs }) {
  const model = env.PI_DETECT_MODEL || 'anthropic/claude-haiku-4-5';
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lens-'));
  const file = path.join(dir, 'photo.jpg');
  writeFileSync(file, Buffer.from(imageBase64, 'base64'));
  const files = [`@${file}`];
  if (focusBase64) {
    const focus = path.join(dir, 'focus.jpg');
    writeFileSync(focus, Buffer.from(focusBase64, 'base64'));
    files.push(`@${focus}`);
  }
  const args = ['-p', '--no-session', '--no-tools', '--no-skills', '--no-context-files', '--no-prompt-templates', '--no-mcp',
    '--thinking', 'off', '--system-prompt', 'You are an image classifier. Output JSON only.', '--model', model, ...files, prompt];
  return new Promise((resolve, reject) => {
    const child = spawn(env.PI_BIN || 'pi', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const done = (fn) => { clearTimeout(timer); rmSync(dir, { recursive: true, force: true }); fn(); };
    child.on('error', (e) => done(() => reject(codeErr('detect_failed', `pi not runnable: ${e.message}`))));
    child.on('close', (code, signal) => done(() => {
      if (signal === 'SIGKILL') return reject(codeErr('detect_timeout', `Detection timed out after ${timeoutMs} ms`));
      if (code !== 0) return reject(codeErr('detect_failed', `pi exited ${code}: ${err.slice(-200)}`));
      resolve({ text: out, model: `pi:${model}` });
    }));
  });
}

/** Returns {objectId, confidence, answer, model, detectMs, provider}. Throws Error with .code on failure. */
export async function detect({ imageBase64, focusBase64, question, forceObjectId, objects = loadObjects(), env = process.env, provider, timeoutMs }) {
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
  const prompt = buildPrompt(objects, question, Boolean(focusBase64));
  const call = prov === 'anthropic' ? callAnthropic : prov === 'pi' ? callPi : callGemini;
  const { text, model } = await call({ imageBase64, focusBase64, prompt, env, timeoutMs });
  const parsed = parseModelJson(text, objects);
  return { ...parsed, model, provider: prov, detectMs: Date.now() - t0 };
}
