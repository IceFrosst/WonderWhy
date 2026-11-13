import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { detect, pickProvider } from './detect.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, 'samples');
const N = Number(process.env.BENCH_N || process.argv[2]) || 3;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)) : [];
if (!files.length) { console.log('No .jpg files in samples/. Add photos (see samples/README.md) and rerun.'); process.exit(0); }

const sharpOk = await import('sharp').then(() => true).catch(() => false);
if (!sharpOk) console.log('Note: sharp is not installed, so all three sizes send the original file. Resize photos to 360x640 / 504x896 / 720x1280 yourself, or `npm i -D sharp`.\n');

const prov = pickProvider();
const p = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const sizes = { LOW: [360, 640], MEDIUM: [504, 896], HIGH: [720, 1280] };
console.log(`provider: ${prov}, runs per image/size: ${N}`);
for (const [name, [w, h]] of Object.entries(sizes)) {
  const times = []; const got = {};
  for (const f of files) {
    let buf = readFileSync(path.join(dir, f));
    if (sharpOk) { const sharp = (await import('sharp')).default; buf = await sharp(buf).resize(w, h, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer(); }
    for (let i = 0; i < N; i++) {
      try {
        const r = await detect({ imageBase64: buf.toString('base64') });
        times.push(r.detectMs); (got[f] ||= []).push(r.objectId);
      } catch (e) { (got[f] ||= []).push(`ERR:${e.code}`); }
    }
  }
  console.log(`\n${name} ${w}x${h}: ${times.length ? `p50 ${p(times, 0.5)} ms, p90 ${p(times, 0.9)} ms` : 'no successful runs'}`);
  for (const [f, ids] of Object.entries(got)) console.log(`  ${f}: ${ids.join(', ')}`);
}
