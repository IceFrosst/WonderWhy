// Render every Explore chapter (scene "model3d") to per-beat clips, stills and label tracks.
// Usage: npm run render [-- --only <objectId>] [--beat <n>] [--stills-only [--strip]] [--out <mediaDir>]
//        [--spec <chapter.json> --id <name>]   (render a chapter from a file, for testing)
//        [--max-kb <kb>] [--crf <n>]           (defaults: 1024 KB per beat, 3072 for spec.style "real"; crf 18)
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {chromium} from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OBJECTS = path.resolve(ROOT, '../shared/objects.json');
const DEFAULT_OUT = path.resolve(ROOT, '../bridge/media');
const DEFAULT_MAX_KB = 1024; // per beat (was 400: bicycle beat 1 then had to drop to crf 26, visibly blocky); --max-kb overrides
const DEFAULT_MAX_KB_REAL = 3072; // spec.style "real" (MODEL3D.md v2)
const DEFAULT_CRF = 18;
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'};

function parseArgs(argv) {
  const options = {only: null, beat: null, stillsOnly: false, strip: false, out: DEFAULT_OUT, spec: null, id: null, maxKb: null, crf: DEFAULT_CRF};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--stills-only') options.stillsOnly = true;
    else if (arg === '--strip') options.strip = true;
    else if (['--only', '--beat', '--out', '--spec', '--id', '--max-kb', '--crf'].includes(arg)) {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--only') options.only = value;
      else if (arg === '--beat') options.beat = Number(value);
      else if (arg === '--max-kb') options.maxKb = Number(value);
      else if (arg === '--crf') options.crf = Number(value);
      else if (arg === '--out') options.out = path.resolve(process.cwd(), value);
      else if (arg === '--spec') options.spec = path.resolve(process.cwd(), value);
      else options.id = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let relative = decodeURIComponent(url.pathname);
      if (relative === '/' || relative === '') relative = '/page/index.html';
      const file = path.resolve(root, `.${relative}`);
      if (!file.startsWith(root + path.sep)) throw new Error('outside root');
      const body = await readFile(file);
      res.writeHead(200, {'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream'});
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function launch() {
  const args = ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
  const errors = [];
  for (const [name, extra] of [['bundled Chromium', {}], ['Google Chrome', {channel: 'chrome'}], ['Microsoft Edge', {channel: 'msedge'}]]) {
    try {
      return await chromium.launch({headless: true, args, ...extra});
    } catch (error) {
      errors.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
    }
  }
  throw new Error(`Could not launch a browser:\n${errors.join('\n')}`);
}

const fromDataUrl = url => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

function encode(target, frames, crf, loopFrom) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-c:v', 'png', '-framerate', '30', '-i', 'pipe:0',
      '-an', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-force_key_frames', `0,${loopFrom}`,
      '-movflags', '+faststart', target,
    ];
    const child = spawn('ffmpeg', args, {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = '';
    child.stderr.on('data', chunk => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`))));
    child.stdin.on('error', () => {});
    (async () => {
      for (const frame of frames) {
        if (!child.stdin.write(frame)) await new Promise(r => child.stdin.once('drain', r));
      }
      child.stdin.end();
    })();
  });
}

async function chapters(options) {
  if (options.spec) {
    const chapter = JSON.parse(await readFile(options.spec, 'utf8'));
    return [{objectId: options.id ?? path.basename(options.spec, '.json'), short: options.id ?? 'Test', chapter, test: true}];
  }
  const data = JSON.parse(await readFile(OBJECTS, 'utf8'));
  const out = [];
  for (const object of data.objects ?? []) {
    if (options.only && object.id !== options.only) continue;
    for (const chapter of object.chapters ?? []) {
      if (chapter.lens === 'explore' && chapter.scene === 'model3d') out.push({objectId: object.id, short: object.short ?? object.label, chapter});
    }
  }
  if (options.only && !out.length) throw new Error(`No explore chapter for ${options.only}`);
  return out;
}

async function mergeManifest(objectDir, objectId, entry) {
  const target = path.join(objectDir, 'manifest.json');
  let manifest = {objectId, lenses: {}};
  try {
    manifest = JSON.parse(await readFile(target, 'utf8'));
  } catch {
    // no manifest yet
  }
  manifest.lenses ??= {};
  const key = `${objectId}.explore`;
  const lenses = {[key]: entry};
  for (const [name, value] of Object.entries(manifest.lenses)) if (name !== key) lenses[name] = value;
  manifest.lenses = lenses;
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function renderChapter(page, job, options) {
  const {objectId, chapter} = job;
  const loaded = await page.evaluate(spec => window.R3D.load(spec), chapter.spec);
  for (const warning of loaded.warnings) console.warn(`  WARNING ${objectId}: ${warning}`);
  const real = chapter.spec?.style === 'real';
  const maxKb = options.maxKb ?? (real ? DEFAULT_MAX_KB_REAL : DEFAULT_MAX_KB);
  const captions = chapter.captions ?? [];
  const beats = loaded.beats;
  console.log(`${objectId}.explore: ${loaded.parts} parts, ${beats} beats, model radius ${loaded.radius.toFixed(2)}, style ${real ? 'real' : 'lines'}`);
  const objectDir = path.join(options.out, objectId);
  const dir = path.join(objectDir, 'explore');
  if (options.beat === null && !options.stillsOnly) await rm(dir, {recursive: true, force: true});
  await mkdir(dir, {recursive: true});

  const tracks = [];
  const files = [];
  const report = [];
  const labelText = Object.fromEntries((chapter.spec.parts ?? []).map(part => [part.id, part.label ?? part.id]));
  for (let b = 0; b < beats; b++) {
    const n = b + 1;
    const plan = await page.evaluate(i => window.R3D.plan(i), b);
    const labelData = await page.evaluate(i => window.R3D.labels(i), b);
    for (const warning of labelData.warnings) console.warn(`  warning: beat ${n}: ${warning}`);
    const dims = await page.evaluate(i => window.R3D.dims(i), b);
    const beatSpec = chapter.spec.beats[b] ?? {};
    const number = beatSpec.number ?? null;
    const focus = new Set(beatSpec.focus ?? []);
    tracks.push({
      dur: plan.dur,
      loopFrom: plan.loopFrom,
      labels: labelData.labels.map(label => ({part: label.part, side: label.side, focus: focus.has(label.part), anchor: label.anchor})),
      number,
      ...(dims.length ? {dims} : {}),
    });
    files.push({clip: `explore/b${n}.mp4`, still: `explore/s${n}.png`, clean: `explore/c${n}.png`});
    if (options.beat !== null && options.beat !== n) continue;

    const started = Date.now();
    const restLabels = labelData.labels.map(label => {
      const at = label.anchor.find(p => Math.abs(p[0] - plan.loopFrom) < 1e-6) ?? label.anchor[0];
      return {side: label.side, text: labelText[label.part], focus: focus.has(label.part), x: at[1], y: at[2]};
    });
    const card = await page.evaluate(
      ([i, meta]) => window.R3D.card(i, meta),
      [b, {title: job.short, caption: captions[b] ?? '', beat: b, beats, labels: restLabels, number}],
    );
    await writeFile(path.join(dir, `s${n}.png`), fromDataUrl(card));
    const clean = await page.evaluate(([i, t]) => window.R3D.frameAt(i, t), [b, plan.loopFrom]);
    await writeFile(path.join(dir, `c${n}.png`), fromDataUrl(clean));
    const light = await page.evaluate(i => window.R3D.brightness(i), b);
    if (options.strip && options.stillsOnly) {
      const sheet = await page.evaluate(i => window.R3D.strip(i), b);
      await writeFile(path.join(dir, `k${n}.png`), fromDataUrl(sheet));
    }
    if (options.stillsOnly) {
      console.log(`  beat ${n}: stills only (mean brightness ${(light.mean * 100).toFixed(1)}%, lit ${(light.lit * 100).toFixed(1)}%)`);
      continue;
    }

    const frames = [];
    for (let i = 0; i < plan.frames; i += 15) {
      const count = Math.min(15, plan.frames - i);
      const urls = await page.evaluate(([bb, i0, c]) => window.R3D.frames(bb, i0, c), [b, i, count]);
      for (const url of urls) frames.push(fromDataUrl(url));
    }
    const seam = await page.evaluate(([i, a, e]) => window.R3D.diff(i, a, e), [b, plan.loopFrom, plan.dur]);
    const target = path.join(dir, `b${n}.mp4`);
    let crf = options.crf;
    let bytes = 0;
    for (;;) {
      await encode(target, frames, crf, plan.loopFrom);
      bytes = (await stat(target)).size;
      if (bytes <= maxKb * 1024 || crf >= 36) break;
      crf += 2;
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (bytes > maxKb * 1024) console.warn(`  WARNING ${objectId}: beat ${n} is ${Math.round(bytes / 1024)} KB, over ${maxKb} KB even at crf ${crf}`);
    if (seam.max > 1) console.warn(`  WARNING ${objectId}: beat ${n} loop seam max diff ${seam.max} (should be 0 or 1)`);
    report.push({beat: n, kb: Math.round(bytes / 1024), crf, seam: seam.max, seconds});
    console.log(
      `  beat ${n}: ${plan.frames} frames, ${Math.round(bytes / 1024)} KB (crf ${crf}), loop seam max diff ${seam.max}, ` +
        `brightness ${(light.mean * 100).toFixed(1)}% (lit ${(light.lit * 100).toFixed(1)}%), ${seconds} s`,
    );
  }

  if (options.beat === null && !options.stillsOnly) {
    await writeFile(path.join(dir, 'tracks.json'), `${JSON.stringify({objectId, size: 600, fps: 30, beats: tracks}, null, 2)}\n`, 'utf8');
    if (!job.test) {
      await mergeManifest(objectDir, objectId, {
        kind: 'explore',
        title: chapter.title ?? 'How it works',
        beats: files,
        stills: files.map(file => file.still),
        clean: files.map(file => file.clean),
        tracks: 'explore/tracks.json',
        captions,
        size: 600,
        fps: 30,
      });
    }
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.strip && !options.stillsOnly) console.warn('--strip only works with --stills-only; ignored');
  const jobs = await chapters(options);
  if (!jobs.length) {
    console.log('No explore chapters to render.');
    return;
  }
  const server = await serve(ROOT);
  let browser;
  const started = Date.now();
  try {
    browser = await launch();
    const page = await browser.newPage({viewport: {width: 600, height: 600}, deviceScaleFactor: 1});
    page.on('pageerror', error => console.error(`page error: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') console.error(`page ${message.type()}: ${message.text()}`);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/page/index.html`);
    await page.waitForFunction(() => window.R3D_READY === true, null, {timeout: 30000});
    const info = await page.evaluate(() => window.R3D.init());
    console.log(`WebGL: ${info.renderer}`);
    for (const job of jobs) await renderChapter(page, job, options);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
