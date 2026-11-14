// Runs the photos in samples/ through the detect provider and reports accuracy and timing.
//   npm run bench                         every photo, 3 runs, 3 sizes (API-key providers: fast)
//   BENCH_N=1 BENCH_SIZES=MEDIUM npm run bench      one cheap pass (use this with a stand-in provider)
//   BENCH_FOCUS=1 ...                     also send the centre crop ("aim", middle 50% of each side)
// The expected answer is the file name up to the first "_" (ball_1.jpg -> ball). Files starting with
// "other" expect "unknown". Files starting with "aim" are not scored (look at them by hand).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { detect, loadObjects, pickProvider, STAND_INS } from './detect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'samples');
const N = Number(process.env.BENCH_N || process.argv[2]) || 3;
const PARALLEL = Number(process.env.BENCH_PARALLEL) || 3;
const FOCUS = process.env.BENCH_FOCUS === '1';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort() : [];
if (!files.length) { console.log('No .jpg files in samples/. Add photos (see samples/README.md) and rerun.'); process.exit(0); }

// sharp is a dev dependency of the glasses app; use it from there when the bridge has none.
let sharp = null;
for (const from of [path.join(here, 'package.json'), path.join(here, '..', 'glasses', 'package.json')]) {
  try { sharp = createRequire(from)('sharp'); break; } catch { /* try the next place */ }
}
if (!sharp) console.log('Note: sharp not found, so every size sends the original file and BENCH_FOCUS is off.\n');

const ids = new Set(loadObjects().map((o) => o.id));
const expected = (f) => { const p = f.split('_')[0].toLowerCase(); return p === 'aim' ? null : ids.has(p) ? p : 'unknown'; };
const prov = pickProvider();
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const ALL = { LOW: [360, 640], MEDIUM: [504, 896], HIGH: [720, 1280] };
const sizes = (process.env.BENCH_SIZES || 'LOW,MEDIUM,HIGH').split(',').map((s) => s.trim().toUpperCase()).filter((s) => ALL[s]);

async function prepare(file, w, h) {
  const original = readFileSync(path.join(dir, file));
  if (!sharp) return { image: original, focus: null };
  // Keep the whole photo (no cropping) inside the size, as the glasses camera frame would be.
  const image = await sharp(original).rotate().resize(h, h, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  if (!FOCUS) return { image, focus: null };
  const meta = await sharp(image).metadata();
  const cw = Math.round(meta.width / 2), ch = Math.round(meta.height / 2);
  const focus = await sharp(image).extract({ left: Math.round((meta.width - cw) / 2), top: Math.round((meta.height - ch) / 2), width: cw, height: ch }).jpeg({ quality: 75 }).toBuffer();
  return { image, focus };
}

console.log(`provider: ${prov}${STAND_INS.has(prov) ? ' (dev stand-in, not the demo provider)' : ''}, runs per photo and size: ${N}, aim crop: ${FOCUS && sharp ? 'on' : 'off'}`);
for (const name of sizes) {
  const [w, h] = ALL[name];
  const jobs = [];
  for (const f of files) for (let i = 0; i < N; i++) jobs.push(f);
  const times = []; const got = {}; let model = '';
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, async () => {
    while (next < jobs.length) {
      const f = jobs[next++];
      try {
        const { image, focus } = await prepare(f, w, h);
        const r = await detect({ imageBase64: image.toString('base64'), focusBase64: focus ? focus.toString('base64') : undefined });
        times.push(r.detectMs); model = r.model; (got[f] ||= []).push({ id: r.objectId, c: r.confidence });
      } catch (e) { (got[f] ||= []).push({ id: `ERR:${e.code || e.message}`, c: 0 }); }
    }
  }));
  let right = 0, scored = 0;
  console.log(`\n${name} (longest side ${h} px), model ${model || 'n/a'}: ${times.length ? `p50 ${pct(times, 0.5)} ms, p90 ${pct(times, 0.9)} ms` : 'no successful runs'}`);
  for (const f of files) {
    const want = expected(f);
    const runs = got[f] || [];
    for (const r of runs) if (want) { scored++; if (r.id === want) right++; }
    const mark = !want ? ' ' : runs.every((r) => r.id === want) ? '+' : runs.some((r) => r.id === want) ? '~' : 'x';
    console.log(`  ${mark} ${f.padEnd(22)} want ${String(want ?? '(by hand)').padEnd(9)} got ${runs.map((r) => `${r.id} ${r.c.toFixed(2)}`).join(', ')}`);
  }
  console.log(`  correct: ${right} of ${scored}${scored ? ` (${Math.round((100 * right) / scored)}%)` : ''}`);
}
