import {spawn} from 'node:child_process';
import {mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.resolve(ROOT, '../bridge/media');
const OBJECTS_JSON = path.resolve(ROOT, '../shared/objects.json');

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: npm run export:media -- [--only <objectId>] [--no-clips] [--no-clean] [--size <n>] [--clip-size <n>] [--out <dir>]');
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {only: null, clips: true, clean: true, size: 600, clipSize: 264, out: DEFAULT_OUT};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--no-clips') options.clips = false;
    else if (arg === '--no-clean') options.clean = false;
    else if (['--only', '--size', '--clip-size', '--out'].includes(arg)) {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--only') options.only = value;
      else if (arg === '--out') options.out = path.resolve(process.cwd(), value);
      else {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 16) throw new Error(`${arg} must be an integer of at least 16`);
        if (arg === '--size') options.size = number;
        else options.clipSize = number;
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function launchBrowser() {
  const attempts = [
    ['bundled Chromium', {}],
    ['system Chromium (CHROMIUM_PATH)', {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium'}],
    ['Google Chrome', {channel: 'chrome'}],
    ['Microsoft Edge', {channel: 'msedge'}],
  ];
  const errors = [];
  for (const [name, options] of attempts) {
    try {
      return await chromium.launch({headless: true, ...options});
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }
  throw new Error(`Could not launch a browser:\n${errors.join('\n')}`);
}

function commandAvailable(command) {
  return new Promise(resolve => {
    try {
      const child = spawn(command, ['-version'], {stdio: 'ignore'});
      child.once('error', () => resolve(false));
      child.once('exit', code => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

function dataUrlBuffer(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Browser returned an invalid data URL');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

async function writeVideo(target, frameUrls, fps) {
  await new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0',
      '-an', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', target,
    ];
    const child = spawn('ffmpeg', args, {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = '';
    let settled = false;
    const fail = error => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', fail);
    child.once('exit', code => {
      if (code === 0 && !settled) {
        settled = true;
        resolve();
      } else if (code !== 0) fail(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
    (async () => {
      try {
        for (const frame of frameUrls) {
          if (!child.stdin.write(dataUrlBuffer(frame))) {
            await new Promise(resolveDrain => child.stdin.once('drain', resolveDrain));
          }
        }
        child.stdin.end();
      } catch (error) {
        child.stdin.destroy();
        fail(error);
      }
    })();
  });
}

async function fileSize(target) {
  return (await stat(target)).size;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
    return;
  }

  let server;
  let browser;
  try {
    server = await createServer({
      root: ROOT,
      logLevel: 'error',
      server: {host: '127.0.0.1', port: 0, strictPort: false},
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not report its listening port');
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/export.html`, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => Boolean(window.__lensExport));

    const allLenses = await page.evaluate(() => window.__lensExport.list());
    const objectChapter = new Map();
    const lenses = [];
    for (const lens of allLenses) {
      const chapterIndex = objectChapter.get(lens.objectId) ?? 0;
      objectChapter.set(lens.objectId, chapterIndex + 1);
      if (!options.only || lens.objectId === options.only) lenses.push({...lens, chapterIndex});
    }
    if (options.only && !lenses.length) throw new Error(`Unknown object id: ${options.only}`);
    // Explore chapters (scene "model3d") are rendered by render3d, not here.
    const objectsJson = JSON.parse(await readFile(OBJECTS_JSON, 'utf8'));
    const model3d = new Set(objectsJson.objects.flatMap(object => (object.chapters ?? [])
      .map((chapter, index) => chapter.scene === 'model3d' ? `${object.id}:${index}` : null)
      .filter(Boolean)));

    await mkdir(options.out, {recursive: true});
    let ffmpegAvailable = options.clips && await commandAvailable('ffmpeg');
    if (options.clips && !ffmpegAvailable) console.warn('warning: ffmpeg is not on PATH; clips will be skipped');
    const manifests = new Map();
    let totalFiles = 0;
    let totalBytes = 0;
    let stillCount = 0;
    let clipCount = 0;

    for (const lens of lenses) {
      if (model3d.has(`${lens.objectId}:${lens.chapterIndex}`)) {
        console.log(`${lens.lensId}: skipped (model3d, rendered by render3d)`);
        continue;
      }
      const objectDir = path.join(options.out, lens.objectId);
      const lensDir = path.join(objectDir, lens.kind);
      await mkdir(objectDir, {recursive: true});
      await rm(lensDir, {recursive: true, force: true});

      const first = await page.evaluate(
        args => window.__lensExport.still(args),
        {objectId: lens.objectId, chapterIndex: lens.chapterIndex, step: 1, size: options.size, settle: 2},
      );
      if (first === null) {
        console.warn(`warning: ${lens.lensId} skipped; scene factory returned null`);
        continue;
      }
      await mkdir(lensDir, {recursive: true});
      const stills = [];
      const clean = [];
      for (let step = 1; step <= lens.captions.length; step++) {
        const dataUrl = step === 1 ? first : await page.evaluate(
          args => window.__lensExport.still(args),
          {objectId: lens.objectId, chapterIndex: lens.chapterIndex, step, size: options.size, settle: 2},
        );
        if (dataUrl === null) throw new Error(`${lens.lensId} became unavailable while rendering stills`);
        const relative = `${lens.kind}/s${step}.png`;
        const target = path.join(objectDir, ...relative.split('/'));
        const bytes = dataUrlBuffer(dataUrl);
        await writeFile(target, bytes);
        totalFiles++;
        totalBytes += bytes.length;
        stillCount++;
        stills.push(relative);

        if (options.clean) {
          const cleanDataUrl = await page.evaluate(
            args => window.__lensExport.sceneStill(args),
            {objectId: lens.objectId, chapterIndex: lens.chapterIndex, step, size: options.size, settle: 2},
          );
          if (cleanDataUrl === null) throw new Error(`${lens.lensId} became unavailable while rendering clean stills`);
          const cleanRelative = `${lens.kind}/c${step}.png`;
          const cleanTarget = path.join(objectDir, ...cleanRelative.split('/'));
          const cleanBytes = dataUrlBuffer(cleanDataUrl);
          await writeFile(cleanTarget, cleanBytes);
          totalFiles++;
          totalBytes += cleanBytes.length;
          stillCount++;
          clean.push(cleanRelative);
        }
      }

      let clip;
      if (ffmpegAvailable) {
        const frames = await page.evaluate(
          args => window.__lensExport.clip(args),
          {objectId: lens.objectId, chapterIndex: lens.chapterIndex, size: options.clipSize, fps: 15, secondsPerStep: 3},
        );
        if (frames === null) throw new Error(`${lens.lensId} became unavailable while rendering its clip`);
        clip = `${lens.kind}/clip.mp4`;
        const target = path.join(objectDir, ...clip.split('/'));
        await writeVideo(target, frames, 15);
        const bytes = await fileSize(target);
        totalFiles++;
        totalBytes += bytes;
        clipCount++;
      }

      let manifest = manifests.get(lens.objectId);
      if (!manifest) {
        manifest = {objectId: lens.objectId, lenses: {}};
        manifests.set(lens.objectId, manifest);
      }
      manifest.lenses[lens.lensId] = {
        kind: lens.kind,
        title: lens.title,
        stills,
        ...(options.clean ? {clean} : {}),
        ...(clip ? {clip} : {}),
        captions: lens.captions,
        size: options.size,
        clipSize: options.clipSize,
        fps: 15,
        secondsPerStep: 3,
      };
      console.log(`${lens.lensId}: ${stills.length} stills${clip ? ', 1 clip' : ', no clip'}`);
    }

    for (const [objectId, manifest] of manifests) {
      const target = path.join(options.out, objectId, 'manifest.json');
      // Keep the Explore entries render3d merged into the manifest.
      try {
        const previous = JSON.parse(await readFile(target, 'utf8'));
        const kept = Object.entries(previous.lenses ?? {}).filter(([key]) => key.endsWith('.explore'));
        if (kept.length) manifest.lenses = {...Object.fromEntries(kept), ...manifest.lenses};
      } catch {
        // no previous manifest
      }
      const contents = `${JSON.stringify(manifest, null, 2)}\n`;
      await writeFile(target, contents, 'utf8');
      totalFiles++;
      totalBytes += Buffer.byteLength(contents);
    }
    console.log(`Total: ${totalFiles} files (${stillCount} stills, ${clipCount} clips), ${totalBytes} bytes`);
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      if (server) await server.close();
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
