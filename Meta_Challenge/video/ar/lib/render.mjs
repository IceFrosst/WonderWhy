// Shared renderer for the AR versions (video/ar/<V>/index.html).
//   node lib/render.mjs <V>                 full render -> out/<V>.mp4 + out/<V>_sheet.png
//   node lib/render.mjs <V> --at 0,1.5,4.2  stills only  -> out/snap/<V>_<t>.jpg
// Serves the whole Meta_Challenge folder, so pages can import /app/render3d/page/scene.js and
// /app/shared/objects.json. Browser: $CHROME_PATH, else Playwright's 'chrome' channel, else its bundled Chromium.
// The page (<V>/index.html) exposes window.renderFrame(t) (may return a promise) and sets window.ready = true.
// Frames are stepped at config.fps, screenshotted and piped straight into ffmpeg (H.264, yuv420p). Silent.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

import { fileURLToPath } from 'node:url';
const LIB = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(LIB, '..'), SERVE = path.resolve(ROOT, '../..');
let chromium;
for (const base of [ROOT, path.resolve(ROOT, '..'), path.join(SERVE, 'app/render3d'), path.join(SERVE, 'app/glasses')]) {
  for (const mod of ['playwright', 'playwright-core']) {
    try { chromium = createRequire(path.join(base, 'x.js'))(mod).chromium; break; } catch (e) { /* try next */ }
  }
  if (chromium) break;
}
if (!chromium) { console.error('playwright not found: run npm install in app/render3d'); process.exit(1); }

const args = process.argv.slice(2), V = args[0];
const opt = k => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
const VDIR = path.join(ROOT, V), OUT = path.join(ROOT, 'out');
const cfg = JSON.parse(fs.readFileSync(path.join(VDIR, 'config.json'), 'utf8'));
const FPS = cfg.fps || 30, Wd = cfg.width || 1920, Ht = cfg.height || 1080, N = Math.round(cfg.duration * FPS);
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();

// ---- footage: extract every slot that has a real file to <V>/frames/<key>/%05d.jpg -------------------------
const RAW = process.env.WONDERWHY_RAW || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Videos/wonderwhy/raw');
const findRaw = (name, dir = RAW) => {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const e of ents) if (e.isFile() && e.name === name) return path.join(dir, e.name);
  for (const e of ents) if (e.isDirectory()) { const r = findRaw(name, path.join(dir, e.name)); if (r) return r; }
  return null;
};
const FR = path.join(VDIR, 'frames'), manifest = {};
fs.rmSync(FR, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });
for (const [key, f] of Object.entries(cfg.footage || {})) {
  if (!f || (!f.path && !f.raw)) { console.log(`footage ${key}: no path -> placeholder`); continue; }
  // f.path (relative to the version folder) wins; else f.raw is a file name found anywhere under $WONDERWHY_RAW.
  let src = f.path ? (path.isAbsolute(f.path) ? f.path : path.resolve(VDIR, f.path)) : '';
  if (!fs.existsSync(src) && f.raw) src = findRaw(f.raw) || src;
  if (!src || !fs.existsSync(src)) { console.log(`footage ${key}: ${f.path || f.raw} not found -> placeholder`); continue; }
  const dir = path.join(FR, key); fs.mkdirSync(dir, { recursive: true });
  const dur = f.duration || cfg.duration, speed = f.speed || 1;
  // f.vf: optional ffmpeg filter that crops/rotates the raw clip to the frame (e.g. a 16:9 window of a portrait clip).
  const fit = f.vf || `scale=${Wd}:${Ht}:force_original_aspect_ratio=increase,crop=${Wd}:${Ht}`;
  const vf = `setpts=PTS/${speed},fps=${FPS},${fit},scale=${Wd}:${Ht}`;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(f.in || 0), '-t', String(dur * speed), '-i', src, '-an', '-vf', vf, '-q:v', '3', path.join(dir, '%05d.jpg')], { stdio: 'inherit' });
  const n = fs.readdirSync(dir).length;
  if (r.status === 0 && n) { manifest[key] = { frames: n, fps: FPS }; console.log(`footage ${key}: ${n} frames from ${f.path || src}`); }
}
fs.writeFileSync(path.join(FR, 'footage.json'), JSON.stringify(manifest));

// ---- static server + browser ----------------------------------------------------------------------------------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => {
  const p = path.join(SERVE, decodeURIComponent(q.url.split('?')[0]));
  if (!p.startsWith(SERVE)) { r.writeHead(403); return r.end(); }
  fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(d); } });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const bargs = ['--force-color-profile=srgb', '--font-render-hinting=none', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
let b;
for (const o of [process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH }, { channel: 'chrome' }, {}].filter(Boolean)) {
  try { b = await chromium.launch({ headless: true, args: bargs, ...o }); break; } catch (e) { console.log('browser launch failed', JSON.stringify(o), e.message.split('\n')[0]); }
}
if (!b) { console.error('no browser: set CHROME_PATH or run npx playwright install chromium'); process.exit(1); }
const pg = await b.newPage({ viewport: { width: Wd, height: Ht }, deviceScaleFactor: 1 });
let errs = 0;
pg.on('pageerror', e => { errs++; console.error('pageerror', e.message); });
pg.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) console.error('console', m.text()); });
await pg.goto(`http://127.0.0.1:${srv.address().port}/video/ar/${V}/index.html`);
await pg.waitForFunction(() => window.ready === true, null, { timeout: 120000 });
console.log('webgl:', await pg.evaluate(() => window.webglInfo || 'n/a'));
const shot = async t => { await pg.evaluate(t => window.renderFrame(t), t); return pg.screenshot({ type: 'jpeg', quality: 96 }); };
const done = async code => { await b.close(); srv.close(); process.exit(code); };

if (opt('--at')) {
  fs.mkdirSync(path.join(OUT, 'snap'), { recursive: true });
  for (const t of opt('--at').split(',').map(Number)) fs.writeFileSync(path.join(OUT, 'snap', `${V}_${t.toFixed(2).padStart(5, '0')}.jpg`), await shot(t));
  console.log(`snaps in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await done(errs ? 2 : 0);
}

// ---- full render ----------------------------------------------------------------------------------------------
const mp4 = path.join(OUT, `${V}.mp4`);
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-movflags', '+faststart', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise(r => ff.on('close', r));
for (let k = 0; k < N; k++) {
  const buf = await shot(k / FPS);
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (k % 60 === 59) console.log(`${V}: ${k + 1}/${N} frames, ${((Date.now() - t0) / (k + 1)).toFixed(0)} ms/frame`);
}
ff.stdin.end();
const code = await ffDone;
if (code !== 0) { console.error('ffmpeg failed', code); await done(3); }

// ---- contact sheet: 8 frames (config.sheet times, else evenly spaced), 4 x 2, time burnt in --------------------
const times = (cfg.sheet && cfg.sheet.length ? cfg.sheet : Array.from({ length: 8 }, (_, i) => (i + 0.5) * cfg.duration / 8)).slice(0, 8);
const sel = times.map(t => `eq(n\\,${Math.min(N - 1, Math.round(t * FPS))})`).join('+');
const font = 'fonts/Archivo.ttf'; // relative: ffmpeg runs in ROOT (a Windows drive colon would break drawtext)
const sheet = path.join(OUT, `${V}_sheet.png`);
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf',
  `select='${sel}',scale=960:540,drawtext=fontfile=${font}:text='${V}  %{pts\\:hms}':x=16:y=16:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8,tile=4x2:padding=6:color=0x202020`,
  '-fps_mode', 'vfr', '-frames:v', '1', sheet], { stdio: 'inherit', cwd: ROOT });
const secs = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(OUT, `${V}.render.json`), JSON.stringify({ variant: V, mp4, sheet, frames: N, fps: FPS, renderSeconds: +secs.toFixed(1), footage: manifest }, null, 1));
console.log(`${V}: ${N} frames -> ${mp4} in ${secs.toFixed(1)} s (sheet ${r.status === 0 ? 'ok' : 'FAILED'})`);
await done(errs ? 2 : (r.status === 0 ? 0 : 4));
