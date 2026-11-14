// Render two 72-view atlases for the isolated kettle demo; does not touch bridge media.
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(process.argv[2] ?? path.join(root, '../turntable'));
const {objects} = JSON.parse(await readFile(path.join(root, '../shared/objects.json'), 'utf8'));
const spec = objects.find(o => o.id === 'kettle').chapters.find(c => c.scene === 'model3d').spec;
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(root + path.sep) || !['.html', '.js'].includes(path.extname(file))) throw Error();
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'text/html'});
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
const scratch = await mkdtemp(path.join(tmpdir(), 'lens-turntable-'));
let browser;
try {
  await mkdir(dest, {recursive: true});
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    ...(process.env.LENS_CHROMIUM ? {executablePath: process.env.LENS_CHROMIUM} : {channel: 'chrome'}),
    args: ['--enable-webgl', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/page/index.html`);
  await page.waitForFunction(() => window.R3D_READY);
  await page.evaluate(() => window.R3D.init());
  for (const [name, beatIndex] of [['assembled', 0], ['exploded', 1]]) {
    // The existing renderer accepts at most six beats. Use six static camera poses per batch.
    const {camera, explode, focus, ghost} = spec.beats[beatIndex];
    for (let start = 0; start < 72; start += 6) {
      const beats = Array.from({length: 6}, (_, i) => ({
        camera: {...camera, yaw: -30 + (start + i) * 5, zoom: name === 'assembled' ? 1.15 : 0.94},
        explode, focus, ghost,
      }));
      const frames = await page.evaluate(({parts, beats}) => {
        const loaded = window.R3D.load({parts, beats});
        if (loaded.beats !== beats.length || loaded.parts < 1) throw Error('Invalid kettle model');
        return beats.map((_, i) => window.R3D.frameAt(i, window.R3D.plan(i).loopFrom));
      }, {parts: spec.parts, beats});
      await Promise.all(frames.map((url, i) => writeFile(path.join(scratch, `angle-${start + i}.png`), Buffer.from(url.split(',')[1], 'base64'))));
    }
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-filter_threads', '1',
      '-framerate', '1', '-i', path.join(scratch, 'angle-%d.png'), '-vf', 'scale=240:240:flags=lanczos,tile=9x8',
      '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', path.join(dest, `${name}.webp`)]);
    console.log(`Rendered ${name}.webp (72 views, 5° apart)`);
  }
} finally {
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await rm(scratch, {recursive: true, force: true});
}
