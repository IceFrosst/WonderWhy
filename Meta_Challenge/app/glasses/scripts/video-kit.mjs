import {spawn} from 'node:child_process';
import {mkdir, mkdtemp, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = path.join(ROOT, 'video-kit');
const FPS = 30;
const BATCH_SIZE = 30;

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: npm run export:video -- [--only <objectId>] [--size <n>] [--seconds <n>] [--no-clean] [--out <dir>]');
  process.exitCode = 1;
}

function parseArgs(args) {
  const options = {only: null, size: 1080, seconds: 4, clean: true, out: DEFAULT_OUT};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--no-clean') options.clean = false;
    else if (['--only', '--size', '--seconds', '--out'].includes(arg)) {
      const value = args[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === '--only') options.only = value;
      else if (arg === '--out') options.out = path.resolve(process.cwd(), value);
      else {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) throw new Error(`${arg} must be a positive number`);
        if (arg === '--size') {
          if (!Number.isInteger(number) || number < 16 || number % 2 !== 0) {
            throw new Error('--size must be an even integer of at least 16');
          }
          options.size = number;
        } else options.seconds = number;
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function launchBrowser() {
  const attempts = [
    ['bundled Chromium', {}],
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

function waitForExit(child, label) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited ${code}: ${stderr.trim()}`));
    });
  });
}

async function writeToStdin(stream, bytes) {
  if (stream.write(bytes)) return;
  await new Promise((resolve, reject) => {
    const drained = () => {
      stream.off('error', failed);
      resolve();
    };
    const failed = error => {
      stream.off('drain', drained);
      reject(error);
    };
    stream.once('drain', drained);
    stream.once('error', failed);
  });
}

async function encodeClip(page, lens, options, target, clean) {
  const startName = clean ? 'sceneClipStart' : 'cardClipStart';
  const nextName = clean ? 'sceneClipNext' : 'cardClipNext';
  const endName = clean ? 'sceneClipEnd' : 'cardClipEnd';
  const started = await page.evaluate(
    ({name, args}) => window.__lensExport[name](args),
    {
      name: startName,
      args: {
        objectId: lens.objectId,
        chapterIndex: lens.chapterIndex,
        size: options.size,
        fps: FPS,
        secondsPerStep: options.seconds,
        crossfade: 0.25,
      },
    },
  );
  if (started === null) return false;

  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-profile:v', 'high', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target,
  ];
  const child = spawn('ffmpeg', args, {stdio: ['pipe', 'ignore', 'pipe']});
  let exitError;
  const exited = waitForExit(child, 'ffmpeg').catch(error => { exitError = error; });
  let writeError;
  try {
    let written = 0;
    while (written < started.totalFrames) {
      const frames = await page.evaluate(
        ({name, handle, count}) => window.__lensExport[name](handle, count),
        {name: nextName, handle: started.handle, count: Math.min(BATCH_SIZE, started.totalFrames - written)},
      );
      if (!frames.length) throw new Error(`${lens.lensId} returned no frames before completion`);
      for (const frame of frames) await writeToStdin(child.stdin, dataUrlBuffer(frame));
      written += frames.length;
    }
    child.stdin.end();
  } catch (error) {
    writeError = error;
    child.stdin.destroy();
    child.kill();
  } finally {
    await page.evaluate(({name, handle}) => window.__lensExport[name](handle), {name: endName, handle: started.handle});
  }
  await exited;
  if (exitError && !writeError) throw exitError;
  if (writeError) throw writeError;
  return true;
}

async function runFfmpeg(args, label) {
  const child = spawn('ffmpeg', args, {stdio: ['ignore', 'ignore', 'pipe']});
  await waitForExit(child, label);
}

async function makeContactSheet(temp, count, target) {
  const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  await runFfmpeg([
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '1', '-start_number', '0', '-i', path.join(temp, '%04d.png'),
    '-frames:v', '1',
    '-vf', `tile=${columns}x${rows}:nb_frames=${count}:padding=12:margin=12:color=0x14181d`,
    target,
  ], 'contact-sheet ffmpeg');
}

function formatDuration(seconds) {
  return `${Number(seconds.toFixed(3))} s`;
}

function suggestedSequences(steps, seconds) {
  const preferred = [
    ['ball', 'motion', 1],
    ['ball', 'whatif', 2],
    ['kettle', 'number', 2],
    ['kettle', 'whatif', 2],
    ['bicycle', 'motion', 1],
  ];
  const rank = step => {
    const index = preferred.findIndex(item => item[0] === step.objectId && item[1] === step.kind && item[2] === step.step);
    return index < 0 ? preferred.length : index;
  };
  const ordered = [...steps].sort((a, b) => rank(a) - rank(b));
  const names = ['Cause to consequence', 'Hidden systems', 'A number to remember'];
  return names.map((name, sequenceIndex) => {
    const shots = [];
    for (let index = 0; index < 5; index++) {
      const step = ordered[(sequenceIndex * 5 + index) % ordered.length];
      const start = (step.step - 1) * seconds;
      const end = Math.min(start + 3, step.step * seconds);
      shots.push(`${step.objectId} ${step.kind} step ${step.step} (${start.toFixed(1)}-${end.toFixed(1)} s${end - start < 3 ? ', hold the last frame' : ''})`);
    }
    return {name, shots};
  });
}

function makeIndex(records, stepRecords, seconds) {
  const lines = [
    '# Physics Lens video kit',
    '',
    '| File | Duration | Purpose |',
    '| --- | ---: | --- |',
  ];
  for (const record of records) {
    lines.push(`| [${record.relative}](${record.relative.replaceAll(' ', '%20')}) | ${record.duration ?? '-'} | ${record.purpose} |`);
  }
  lines.push('', '## Suggested 15-second sequences', '');
  lines.push('Use each listed excerpt for 3 seconds; where noted, freeze its final frame to reach 3 seconds.');
  for (const sequence of suggestedSequences(stepRecords, seconds)) {
    lines.push('', `### ${sequence.name}`, '');
    sequence.shots.forEach((shot, index) => lines.push(`${index + 1}. ${shot}`));
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const startedAt = Date.now();
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
    return;
  }
  if (!await commandAvailable('ffmpeg')) throw new Error('ffmpeg is required on PATH');

  let server;
  let browser;
  let contactTemp;
  try {
    server = await createServer({
      root: ROOT,
      logLevel: 'error',
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
        watch: {ignored: [`${options.out.replaceAll('\\', '/')}/**`]},
      },
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

    const clipsDir = path.join(options.out, 'clips');
    const stillsDir = path.join(options.out, 'stills');
    await mkdir(options.out, {recursive: true});
    await rm(clipsDir, {recursive: true, force: true});
    await rm(stillsDir, {recursive: true, force: true});
    await rm(path.join(options.out, 'contact-sheet.png'), {force: true});
    await rm(path.join(options.out, 'index.md'), {force: true});
    await mkdir(clipsDir, {recursive: true});
    await mkdir(stillsDir, {recursive: true});
    contactTemp = await mkdtemp(path.join(tmpdir(), 'physics-lens-contact-'));

    const records = [];
    const stepRecords = [];
    let contactCount = 0;
    for (const lens of lenses) {
      const first = await page.evaluate(
        args => window.__lensExport.still(args),
        {objectId: lens.objectId, chapterIndex: lens.chapterIndex, step: 1, size: options.size, settle: 2},
      );
      if (first === null) {
        console.warn(`warning: ${lens.lensId} skipped; scene factory returned null`);
        continue;
      }
      for (let step = 1; step <= lens.captions.length; step++) {
        const full = step === 1 ? first : await page.evaluate(
          args => window.__lensExport.still(args),
          {objectId: lens.objectId, chapterIndex: lens.chapterIndex, step, size: options.size, settle: 2},
        );
        if (full === null) throw new Error(`${lens.lensId} became unavailable while rendering stills`);
        const relative = `stills/${lens.objectId}-${lens.kind}-s${step}-${options.size}.png`;
        await writeFile(path.join(options.out, ...relative.split('/')), dataUrlBuffer(full));
        console.log(relative);
        records.push({relative, duration: null, purpose: `Captioned card still, step ${step}`});
        stepRecords.push({objectId: lens.objectId, kind: lens.kind, step});

        const contact = options.size === 600 ? full : await page.evaluate(
          args => window.__lensExport.still(args),
          {objectId: lens.objectId, chapterIndex: lens.chapterIndex, step, size: 600, settle: 2},
        );
        if (contact === null) throw new Error(`${lens.lensId} became unavailable for the contact sheet`);
        await writeFile(path.join(contactTemp, `${String(contactCount).padStart(4, '0')}.png`), dataUrlBuffer(contact));
        contactCount++;
      }

      const frameSeconds = Math.max(1, Math.round(FPS * options.seconds)) / FPS;
      const duration = lens.captions.length * frameSeconds;
      const cardRelative = `clips/${lens.objectId}-${lens.kind}-${options.size}.mp4`;
      if (!await encodeClip(page, lens, options, path.join(options.out, ...cardRelative.split('/')), false)) {
        console.warn(`warning: ${lens.lensId} skipped; scene factory returned null`);
        continue;
      }
      console.log(cardRelative);
      records.push({relative: cardRelative, duration: formatDuration(duration), purpose: 'Captioned product card clip'});

      if (options.clean) {
        const cleanRelative = `clips/${lens.objectId}-${lens.kind}-${options.size}-clean.mp4`;
        if (!await encodeClip(page, lens, options, path.join(options.out, ...cleanRelative.split('/')), true)) {
          throw new Error(`${lens.lensId} became unavailable while rendering its clean clip`);
        }
        console.log(cleanRelative);
        records.push({relative: cleanRelative, duration: formatDuration(duration), purpose: 'Scene-only editor clip'});
      }
    }

    if (!contactCount) throw new Error('No renderable lenses were found');
    const contactTarget = path.join(options.out, 'contact-sheet.png');
    await makeContactSheet(contactTemp, contactCount, contactTarget);
    console.log('contact-sheet.png');
    records.push({relative: 'contact-sheet.png', duration: null, purpose: 'Overview of every 600x600 card still'});

    const frameSeconds = Math.max(1, Math.round(FPS * options.seconds)) / FPS;
    const indexContents = makeIndex(records, stepRecords, frameSeconds);
    await writeFile(path.join(options.out, 'index.md'), indexContents, 'utf8');
    console.log('index.md');

    let totalBytes = Buffer.byteLength(indexContents);
    for (const record of records) totalBytes += (await stat(path.join(options.out, ...record.relative.split('/')))).size;
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    console.log(`Total: ${records.length + 1} files, ${totalBytes} bytes, ${elapsedSeconds.toFixed(1)} seconds`);
  } finally {
    if (contactTemp) await rm(contactTemp, {recursive: true, force: true});
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
