import {existsSync} from 'node:fs';
import http from 'node:http';
import {createRequire} from 'node:module';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {build as viteBuild, preview as vitePreview} from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ROOT = path.resolve(ROOT, '..');
const BRIDGE_ROOT = path.join(APP_ROOT, 'bridge');
const OBJECTS_FILE = path.join(APP_ROOT, 'shared', 'objects.json');
const DIST = path.join(ROOT, 'node_modules', '.states-dist');
const DOCS = path.join(ROOT, 'docs');
const SCREENSHOTS = path.join(DOCS, 'states');
const CONFIG = path.join(ROOT, 'vite.config.ts');
const FIXTURE_MEDIA = path.join(ROOT, 'scripts', 'fixtures', 'explore-media');
const BRIDGE_MEDIA = path.join(BRIDGE_ROOT, 'media');
const MEDIA_TYPES = {'.mp4': 'video/mp4', '.png': 'image/png', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp'};
const bridgeRequire = createRequire(path.join(BRIDGE_ROOT, 'package.json'));
const {WebSocketServer} = bridgeRequire('ws');

const VIEWPORT = {width: 600, height: 600};
const TOTAL_GZIP_LIMIT = 307200;
const REQUEST_LIMIT = 15;
const FPS_LIMIT = 20;
const WAIT_MS = 5000;

function parseArgs(args) {
  const options = {only: null, build: true, headed: false};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--no-build') options.build = false;
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--only') {
      const value = args[++index];
      if (!value) throw new Error('Missing value for --only');
      options.only = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function short(value, limit = 360) {
  const clean = String(value).replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3)}...`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function captureScreenshot(page, target) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.screenshot({path: target});
      return;
    } catch (error) {
      lastError = error;
      await sleep(100 * (attempt + 1));
    }
  }
  throw lastError;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function asciiJson(value) {
  return `${JSON.stringify(value, null, 2).replace(/[^\x00-\x7f]/g, character => {
    return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
  })}\n`;
}

function markdownText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;')
    .replace(/\r?\n/g, ' ')
    .replace(/[^\x00-\x7f]/g, character => `&#${character.codePointAt(0)};`);
}

async function launchBrowser(headed) {
  const attempts = [
    ['bundled Chromium', {}],
    ['Google Chrome', {channel: 'chrome'}],
    ['Microsoft Edge', {channel: 'msedge'}],
  ];
  const errors = [];
  let fallback = null;
  // The Explore lens streams H.264; open-source Chromium builds cannot decode it, so prefer a browser that can.
  for (const [name, launchOptions] of attempts) {
    try {
      const browser = await chromium.launch({headless: !headed, ...launchOptions});
      const page = await browser.newPage();
      const h264 = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640028"') !== '');
      await page.close();
      browser.h264 = h264;
      if (h264) {
        if (fallback) await fallback.close().catch(() => {});
        return browser;
      }
      if (fallback) await browser.close().catch(() => {});
      else fallback = browser;
    } catch (error) {
      errors.push(`${name}: ${errorMessage(error).split('\n')[0]}`);
    }
  }
  if (fallback) return fallback;
  throw new Error(`Could not launch a browser:\n${errors.join('\n')}`);
}

class FakeBridge {
  constructor() {
    this.server = null;
    this.port = null;
    this.connections = new Set();
    this.frames = [];
    this.waiters = new Set();
    this.closeNextHello = null;
    this.closeHelloCount = 0;
    this.http = null;
    this.mediaRequests = [];
    this.mediaStall = null;
    this.mediaMissing = null;
  }

  /** `/media/<id>/...` like the real bridge: the Explore fixture first, then the bridge's own exported media. */
  async serveMedia(req, res) {
    const headers = {'access-control-allow-origin': '*', 'cache-control': 'no-store'};
    let rel;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/media/')) throw new Error('not media');
      rel = decodeURIComponent(url.pathname.slice('/media/'.length));
    } catch {
      res.writeHead(404, headers).end();
      return;
    }
    const parts = rel.split('/');
    if (parts.some(part => part === '' || part === '.' || part === '..' || part.includes('\\'))) {
      res.writeHead(404, headers).end();
      return;
    }
    this.mediaRequests.push(rel);
    if (this.mediaStall?.test(rel)) return; // never answers: the player must give up by itself
    const fixture = path.join(FIXTURE_MEDIA, ...parts);
    const file = existsSync(fixture) ? fixture : path.join(BRIDGE_MEDIA, ...parts);
    const type = MEDIA_TYPES[path.extname(file).toLowerCase()];
    if (this.mediaMissing?.test(rel) || !type || !existsSync(file)) {
      res.writeHead(404, headers).end();
      return;
    }
    const data = await readFile(file);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && type === 'video/mp4' && (range[1] !== '' || range[2] !== '')) {
      const start = range[1] === '' ? Math.max(0, data.length - Number(range[2])) : Number(range[1]);
      const end = range[1] !== '' && range[2] !== '' ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) {
        res.writeHead(416, {...headers, 'content-range': `bytes */${data.length}`}).end();
        return;
      }
      res.writeHead(206, {...headers, 'content-type': type, 'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1});
      res.end(data.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, {...headers, 'content-type': type, 'content-length': data.length,
      ...(type === 'video/mp4' ? {'accept-ranges': 'bytes'} : {})});
    res.end(data);
  }

  async start() {
    this.http = http.createServer((req, res) => {
      this.serveMedia(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500).end();
      });
    });
    this.server = new WebSocketServer({server: this.http, path: '/ws'});
    this.server.on('connection', socket => {
      this.connections.add(socket);
      socket.on('close', () => this.connections.delete(socket));
      socket.on('message', data => {
        let message;
        try {
          message = JSON.parse(String(data));
        } catch {
          return;
        }
        const frame = {socket, message, received: Date.now()};
        this.frames.push(frame);
        for (const waiter of [...this.waiters]) {
          if (waiter.predicate(frame)) waiter.resolve(frame);
        }
        if (message.type === 'hello' && this.closeNextHello !== null) {
          const code = this.closeNextHello;
          this.closeNextHello = null;
          socket.close(code);
        } else if (message.type === 'hello' && this.closeHelloCount > 0) {
          this.closeHelloCount--;
          socket.close(1000);
        }
      });
    });
    await new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(0, resolve);
    });
    const address = this.http.address();
    if (!address || typeof address === 'string') throw new Error('Fake bridge did not report its port');
    this.port = address.port;
  }

  waitFor(predicate, options = {}) {
    const {since = 0, timeout = WAIT_MS, description = 'bridge frame'} = options;
    const existing = this.frames.slice(since).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve: frame => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(frame);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${description}`));
      }, timeout);
      this.waiters.add(waiter);
    });
  }

  async waitForMessage(predicate, options) {
    const frame = await this.waitFor(frame => predicate(frame.message), options);
    return frame;
  }

  send(socket, message) {
    if (!socket || socket.readyState !== 1) throw new Error(`Cannot send ${message.type}; fake bridge socket is not open`);
    socket.send(JSON.stringify(message));
  }

  terminate(socket) {
    if (socket) socket.terminate();
  }

  async close() {
    for (const waiter of this.waiters) waiter.resolve({socket: null, message: {type: '__closed'}});
    this.waiters.clear();
    for (const socket of this.connections) socket.terminate();
    this.connections.clear();
    if (this.server) await new Promise(resolve => this.server.close(resolve));
    this.server = null;
    if (this.http) {
      this.http.closeAllConnections();
      await new Promise(resolve => this.http.close(resolve));
    }
    this.http = null;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

async function bundleMeasure() {
  let jsGzipBytes = 0;
  let cssGzipBytes = 0;
  for (const file of await listFiles(DIST)) {
    const extension = path.extname(file).toLowerCase();
    if (extension !== '.js' && extension !== '.css') continue;
    const bytes = gzipSync(await readFile(file)).length;
    if (extension === '.js') jsGzipBytes += bytes;
    else cssGzipBytes += bytes;
  }
  return {jsGzipBytes, cssGzipBytes, totalGzipBytes: jsGzipBytes + cssGzipBytes, requests: 0};
}

async function visibleText(page) {
  return short(await page.locator('body').innerText().catch(() => ''));
}

async function fontOffenders(page) {
  return page.evaluate(() => {
    const offenders = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const element = node.parentElement;
      if (text && element) {
        const style = getComputedStyle(element);
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && Number(style.opacity) !== 0;
        const size = Number.parseFloat(style.fontSize);
        if (visible && Number.isFinite(size) && size < 16) offenders.push({text, size});
      }
      node = walker.nextNode();
    }
    return offenders;
  });
}

async function layoutOffenders(page) {
  return page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 && !element.closest('[hidden]');
    };
    const selectors = [
      '.ex-title',
      '.ex-head > p',
      '.ex-caption',
      '.ex-follow-up',
      '.ex-read',
      '.ex-chip',
      '.ex-hint',
      '.ex-lenses',
      '.ex-lens-name',
      '.ex-tag',
      '.card > p',
      '.consent-card > h1',
      '.consent-card > p',
      '.home-intro > p',
      'button [class*="titleLabel"]',
      '.xp-name',
      '.xp-caption',
      '.xp-number-value',
      '.xp-number-label',
    ];
    const elements = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))]
      .filter(element => element instanceof HTMLElement && visible(element));
    const offenders = [];
    for (const element of elements) {
      if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
        offenders.push({kind: 'horizontal clip', text: element.textContent?.trim() || element.className});
      }
      if (element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1) {
        offenders.push({kind: 'vertical clip', text: element.textContent?.trim() || element.className});
      }
    }
    const docks = [...document.querySelectorAll('.ex-dock, .action-dock')]
      .filter(element => element instanceof HTMLElement && visible(element));
    const siblings = [...document.querySelectorAll('.ex > :not(.ex-dock), .action-page-shell > :not(.action-dock)')]
      .filter(element => element instanceof HTMLElement && visible(element) && !element.closest('.overlay'));
    for (const dock of docks) {
      const dockRect = dock.getBoundingClientRect();
      for (const element of siblings) {
        if (element.parentElement !== dock.parentElement) continue;
        const rect = element.getBoundingClientRect();
        const overlaps = rect.left < dockRect.right - 1 && rect.right > dockRect.left + 1 &&
          rect.top < dockRect.bottom - 1 && rect.bottom > dockRect.top + 1;
        if (overlaps) offenders.push({kind: 'dock overlap', text: element.textContent?.trim() || element.className});
      }
    }
    return offenders;
  });
}

// Explore lens (shared/MODEL3D.md): a fixture object whose first lens streams the beat videos in
// scripts/fixtures/explore-media/fixture3d (made by scripts/fixtures/make-explore-fixture.mjs).
const EXPLORE_STATES = [
  'explore-plays', 'explore-labels', 'explore-autoplay', 'explore-input-pause', 'explore-preload',
  'explore-number', 'explore-last-beat', 'explore-fallback', 'explore-missing', 'explore-finnish',
  'explore-sketch', 'explore-home',
];
const FIXTURE_ID = 'fixture3d';
const EXPLORE_CAPTIONS = [
  'The ring circles the core while the camera settles on it.',
  'The axle holds the ring on its path around the core.',
  'The element turns 2000 W of electricity into heat.',
];
const EXPLORE_SPEC = {
  parts: [
    {id: 'ring', label: 'Ring', prim: 'torus', r: 6, tube: 0.5, pos: [0, 0, 0], rot: [90, 0, 0], role: 'actor', explode: [0, 0, 0]},
    {id: 'core', label: 'Core', prim: 'box', size: [2, 2, 2], pos: [0, 0, 0], rot: [0, 0, 0], role: 'energy', explode: [0, 0, 0]},
    {id: 'axle', label: 'Axle', prim: 'cylinder', r: 0.3, h: 8, pos: [0, 0, 0], rot: [0, 0, 0], role: 'object', explode: [0, 0, 0]},
  ],
  beats: [
    {camera: {yaw: 30, pitch: 20, zoom: 1}, labels: ['ring', 'core'], focus: ['ring'], dur: 3},
    {camera: {yaw: 35, pitch: 25, zoom: 0.9}, labels: ['axle', 'core'], dur: 3,
      fx: [{type: 'dim', on: 'axle', text: '8 cm'}]},
    {camera: {yaw: 20, pitch: 20, zoom: 1}, labels: ['ring', 'core'], focus: ['core'], dur: 3,
      number: {value: '2000', unit: 'W', label: 'heating power'}},
  ],
};
// Pixels inside the fixture's centre square that no label line or anchor dot crosses.
const SQUARE_CLIP = {x: 304, y: 288, width: 8, height: 8};

function exploreFixtureObject(flowChapter) {
  return {
    id: FIXTURE_ID,
    label: 'Test cube',
    short: 'Cube',
    concept: '',
    tagline: '',
    answer: 'A ring turns around a cube.',
    chapters: [
      {scene: 'model3d', lens: 'explore', title: 'How it works', hint: '', captions: EXPLORE_CAPTIONS, spec: EXPLORE_SPEC},
      flowChapter,
    ],
  };
}

function trackAnchor(samples, t) {
  if (t <= samples[0][0]) return [samples[0][1], samples[0][2]];
  const last = samples[samples.length - 1];
  if (t >= last[0]) return [last[1], last[2]];
  const index = samples.findIndex(sample => sample[0] > t);
  const a = samples[index - 1];
  const b = samples[index];
  const k = (t - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** `show.media` for an object whose rendered Explore beats are in bridge/media/<id>/, or null. */
async function realExploreMedia(objectId) {
  try {
    const manifest = JSON.parse(await readFile(path.join(BRIDGE_MEDIA, objectId, 'manifest.json'), 'utf8'));
    const entry = manifest?.lenses?.[`${objectId}.explore`];
    if (!entry) return null;
    const first = [entry.videos, entry.clips, entry.beats].find(Array.isArray)?.[0];
    const firstVideo = typeof first === 'string' ? first : first?.video ?? 'explore/b1.mp4';
    if (!existsSync(path.join(BRIDGE_MEDIA, objectId, ...String(firstVideo).split('/')))) return null;
    return {base: `/media/${objectId}`, lenses: manifest.lenses};
  } catch {
    return null;
  }
}

/** Brightest channel value in a screenshot region (0 = black). */
async function regionMax(page, clip) {
  const png = await page.screenshot({clip});
  const {data} = await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let max = 0;
  for (const value of data) if (value > max) max = value;
  return max;
}

/** Labels inside the safe margin, clear of the top line, the number and the caption, and of each other. */
async function exploreLayoutProblems(page) {
  return page.evaluate(() => {
    const debug = window.__exploreDebug;
    if (!debug) return ['no Explore debug state'];
    const problems = [];
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const top = rect('.xp-top');
    const caption = rect('.xp-caption');
    const number = rect('.xp-number');
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const boxes = debug.labels.filter(label => label.alpha > 0).map(label => ({
      text: label.text,
      left: label.side === 'l' ? label.x : label.x - label.w,
      right: label.side === 'l' ? label.x + label.w : label.x,
      top: label.y - 11,
      bottom: label.y + 11,
    }));
    for (const box of boxes) {
      if (box.left < 23.5 || box.right > width - 23.5) problems.push(`label "${box.text}" leaves the 24 px margin`);
      if (top && box.top < top.bottom) problems.push(`label "${box.text}" overlaps the top line`);
      if (caption && hit(box, caption)) problems.push(`label "${box.text}" overlaps the caption`);
      if (number && hit(box, number)) problems.push(`label "${box.text}" is under the number`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (hit(boxes[i], boxes[j])) problems.push(`labels "${boxes[i].text}" and "${boxes[j].text}" overlap`);
      }
    }
    if (top && top.top < 23.5) problems.push('top line is inside the 24 px margin');
    if (caption && (caption.bottom > height - 23.5 || caption.left < 23.5 || caption.right > width - 23.5)) {
      problems.push('caption leaves the 24 px margin');
    }
    if (caption && caption.height > 2 * parseFloat(getComputedStyle(document.querySelector('.xp-caption')).lineHeight) + 1) {
      problems.push('caption is longer than 2 lines');
    }
    if (number && caption && number.bottom > caption.top) problems.push('number overlaps the caption');
    if (number && number.left < 23.5) problems.push('number leaves the 24 px margin');
    return problems;
  });
}

function stateFile(index, name) {
  return `${String(index).padStart(2, '0')}-${name}.png`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const objectsData = JSON.parse(await readFile(OBJECTS_FILE, 'utf8'));
  const objects = objectsData.objects;
  const objectIds = new Set(objects.map(object => object.id));
  const results = [];
  const fps = {};
  const failures = [];
  let bundle = {jsGzipBytes: 0, cssGzipBytes: 0, totalGzipBytes: 0, requests: 0};
  let userAgent = '';
  let previewServer;
  let browser;
  const bridge = new FakeBridge();
  let previewPort;
  let firstPaintRequests = null;

  const simpleNames = [
    'home-connected', 'home-offline', 'locked', 'looking', 'took-too-long', 'not-sure', 'unknown', 'error',
    'bridge-drop-while-looking', 'device-battery-low', 'device-thermal-hot', 'device-offline',
    'device-camera-denied', 'device-doffed', 'device-donned', 'clear', 'replay', 'heartbeat', 'token', 'token-fragment',
    'consent', 'consent-device-frame', 'follow-up', 'follow-up-bad-hint', 'demo', 'demo-button',
    'stale-request', 'sketch-immediate', 'malformed-frame', 'doffed-wake', 'demo-stops', 'flow-loss-clamp',
    'curve-bounds', 'token-foreign', 'reconnect-backoff',
    ...EXPLORE_STATES,
  ];
  const isSceneName = value => /^scene-[^-]+-[^-]+-s\d+$/.test(value || '');
  if (options.only && !simpleNames.includes(options.only) && !objectIds.has(options.only) && !isSceneName(options.only)) {
    throw new Error(`Unknown state or object id for --only: ${options.only}`);
  }

  await mkdir(SCREENSHOTS, {recursive: true});

  const addFailure = (result, message) => {
    const clean = short(message, 700);
    if (!result.failures.includes(clean)) result.failures.push(clean);
  };

  const recordResult = result => {
    result.ok = result.failures.length === 0;
    results.push(result);
    if (!result.ok) failures.push(...result.failures.map(message => `${result.name}: ${message}`));
    const detail = result.skipped ? `skipped: ${result.skipped}` : result.ok ? 'ok' : `FAIL: ${result.failures.join('; ')}`;
    console.log(`${result.name}: ${detail}`);
  };

  const openPage = async ({
    offline = false,
    token = null,
    fragmentToken = null,
    closeOnHello = null,
    closeHelloCount = 0,
    bridgeHost = 'localhost',
    params = {},
  } = {}) => {
    if (closeOnHello !== null) bridge.closeNextHello = closeOnHello;
    bridge.closeHelloCount = closeHelloCount;
    const context = await browser.newContext({viewport: VIEWPORT, deviceScaleFactor: 1});
    const page = await context.newPage();
    const consoleErrors = [];
    const requests = new Set();
    page.on('console', message => {
      if (message.type() !== 'error') return;
      // With no bridge to reach, the browser itself logs the refused WebSocket: that is the state under test.
      if (offline && /WebSocket|ERR_CONNECTION_REFUSED|ERR_UNSAFE_PORT/.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    page.on('pageerror', error => consoleErrors.push(`pageerror: ${errorMessage(error)}`));
    page.on('request', request => {
      if (request.resourceType() !== 'websocket') requests.add(request.url());
    });
    const frameStart = bridge.frames.length;
    const wsPort = offline ? 1 : bridge.port;
    const query = new URLSearchParams({bridge: `ws://${bridgeHost}:${wsPort}/ws`});
    if (token !== null) query.set('k', token);
    for (const [key, value] of Object.entries(params)) query.set(key, String(value));
    const fragment = fragmentToken !== null ? `#k=${encodeURIComponent(fragmentToken)}` : '';
    await page.goto(`http://localhost:${previewPort}/?${query}${fragment}`, {waitUntil: 'networkidle'});
    if (firstPaintRequests === null) firstPaintRequests = requests.size;
    if (!userAgent) userAgent = await page.evaluate(() => navigator.userAgent);
    let hello = null;
    if (!offline) {
      hello = await bridge.waitForMessage(message => message.type === 'hello', {
        since: frameStart,
        description: 'glasses hello',
      });
    }
    return {context, page, consoleErrors, socket: hello?.socket ?? null, frameStart};
  };

  const runState = async (name, filename, pageOptions, action) => {
    if (options.only && options.only !== name) return null;
    const result = {name, ok: false, screenshot: `states/${filename}`, failures: []};
    let session;
    try {
      session = await openPage(pageOptions);
      const check = (condition, message) => {
        if (!condition) addFailure(result, message);
      };
      const expectText = async (expected, locatorOptions = {}) => {
        try {
          await session.page.getByText(expected, locatorOptions).first().waitFor({state: 'visible', timeout: WAIT_MS});
          return true;
        } catch {
          addFailure(result, `expected visible text "${expected}", found "${await visibleText(session.page)}"`);
          return false;
        }
      };
      const checkLayout = async () => {
        const offenders = await layoutOffenders(session.page);
        for (const offender of offenders) addFailure(result, `${offender.kind}: "${short(offender.text, 100)}"`);
      };
      await action({...session, check, expectText, checkLayout, result});
    } catch (error) {
      addFailure(result, errorMessage(error));
    } finally {
      if (session?.page) {
        try {
          const layout = await layoutOffenders(session.page);
          for (const offender of layout) addFailure(result, `${offender.kind}: "${short(offender.text, 100)}"`);
          const offenders = await fontOffenders(session.page);
          if (offenders.length) {
            addFailure(result, `visible text under 16 px: ${offenders.map(item => `"${short(item.text, 60)}" (${item.size}px)`).join(', ')}`);
          }
        } catch (error) {
          addFailure(result, `text-size check failed: ${errorMessage(error)}`);
        }
        if (session.consoleErrors.length) addFailure(result, `console errors: ${session.consoleErrors.map(error => short(error, 160)).join(' | ')}`);
        if (!result.screenshotCaptured) {
          try {
            await captureScreenshot(session.page, path.join(SCREENSHOTS, filename));
          } catch (error) {
            addFailure(result, `screenshot failed: ${errorMessage(error)}`);
          }
        }
        await session.context.close().catch(error => addFailure(result, `page close failed: ${errorMessage(error)}`));
      }
      recordResult(result);
    }
    return result;
  };

  const send = (session, message) => bridge.send(session.socket, message);

  try {
    if (options.build) {
      await viteBuild({
        root: ROOT,
        configFile: CONFIG,
        logLevel: 'error',
        build: {outDir: DIST, emptyOutDir: true},
      });
    } else {
      const info = await stat(DIST).catch(() => null);
      if (!info?.isDirectory()) throw new Error(`--no-build requires an existing build at ${DIST}`);
    }
    bundle = await bundleMeasure();

    previewServer = await vitePreview({
      root: ROOT,
      configFile: CONFIG,
      logLevel: 'error',
      build: {outDir: DIST},
      preview: {host: 'localhost', port: 0, strictPort: false},
    });
    const previewAddress = previewServer.httpServer.address();
    if (!previewAddress || typeof previewAddress === 'string') throw new Error('Vite preview did not report its port');
    previewPort = previewAddress.port;
    await bridge.start();
    browser = await launchBrowser(options.headed);

    let simpleIndex = 0;
    const simple = async (name, pageOptions, action) => {
      simpleIndex++;
      return runState(name, stateFile(simpleIndex, name), pageOptions, action);
    };

    await simple('home-connected', {}, async session => {
      await session.expectText('Bridge connected', {exact: true});
      const objectButtons = await session.page.locator('.home-object-button').count();
      session.check(
        objectButtons === objects.length + 1,
        `expected ${objects.length} object buttons and one Demo button, found ${objectButtons}; text "${await visibleText(session.page)}"`,
      );
    });

    await simple('home-offline', {offline: true}, async session => {
      await session.expectText('Bridge offline (demo)', {exact: true});
      const objectButtons = await session.page.locator('.home-object-button').count();
      session.check(objectButtons === objects.length + 1, `expected ${objects.length + 1} working home buttons, found ${objectButtons}`);
      if (objectButtons) {
        await session.page.getByRole('button', {name: objects[0].label}).click();
        try {
          await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
        } catch {
          session.check(false, `first object button did not open a scene; found "${await visibleText(session.page)}"`);
        }
        await session.page.reload({waitUntil: 'networkidle'});
        await session.expectText('Bridge offline (demo)', {exact: true});
      }
    });

    await simple('locked', {closeOnHello: 4401}, async session => {
      await session.expectText('Bridge locked', {exact: true});
    });

    await simple('looking', {}, async session => {
      send(session, {type: 'detecting', reqId: 'looking-1', timeoutMs: 60000});
      await session.expectText(/^Looking/);
    });

    await simple('took-too-long', {}, async session => {
      const started = Date.now();
      send(session, {type: 'detecting', reqId: 'slow-1', timeoutMs: 0});
      await session.expectText('Took too long', {exact: true});
      session.check(Date.now() - started >= 1900, `detect timeout was not clamped to 2 s; elapsed ${Date.now() - started} ms`);
      await session.expectText('Physics Lens', {exact: true});
    });

    await simple('not-sure', {}, async session => {
      const since = bridge.frames.length;
      send(session, {type: 'show', reqId: 'unsure-1', objectId: 'guitar', label: 'Guitar string', lowConfidence: true});
      await session.expectText('Not sure', {exact: true});
      await session.expectText(/Guitar string/);
      session.check(await session.page.locator('.ex-canvas').count() === 0, 'low-confidence show opened a canvas scene');
      try {
        await bridge.waitForMessage(message => message.type === 'rendered' && message.reqId === 'unsure-1', {
          since,
          description: 'rendered acknowledgement for not-sure',
        });
      } catch (error) {
        session.check(false, errorMessage(error));
      }
    });

    await simple('unknown', {}, async session => {
      const answer = 'A stapler. A lever multiplies the force of your hand.';
      send(session, {type: 'show', reqId: 'unknown-1', objectId: 'unknown', label: 'Stapler', answer});
      await session.expectText(answer, {exact: true});
    });

    await simple('error', {}, async session => {
      send(session, {type: 'detecting', reqId: 'error-1', timeoutMs: 60000});
      await session.expectText(/^Looking/);
      send(session, {type: 'error', code: 'detect_failed', message: 'Model did not answer', reqId: 'error-1'});
      await session.expectText('Model did not answer', {exact: true});
      await session.expectText('Physics Lens', {exact: true});
    });

    await simple('bridge-drop-while-looking', {}, async session => {
      send(session, {type: 'detecting', reqId: 'drop-1', timeoutMs: 60000});
      await session.expectText(/^Looking/);
      bridge.terminate(session.socket);
      await session.expectText('Bridge offline', {exact: true});
    });

    const deviceCards = [
      ['device-battery-low', 'battery_low', 'Battery low'],
      ['device-thermal-hot', 'thermal_hot', 'Glasses are hot'],
      ['device-offline', 'offline', 'Offline'],
      ['device-camera-denied', 'camera_denied', 'Camera blocked'],
    ];
    for (const [name, state, title] of deviceCards) {
      await simple(name, {}, async session => {
        send(session, {type: 'device', state});
        await session.expectText(title, {exact: true});
        if (state === 'offline') {
          const since = bridge.frames.length;
          bridge.terminate(session.socket);
          await bridge.waitForMessage(message => message.type === 'hello', {since, description: 'reconnect after offline card'});
          try {
            await session.page.getByText('Offline', {exact: true}).waitFor({state: 'hidden', timeout: WAIT_MS});
          } catch {
            session.check(false, 'Offline card remained after the bridge reconnected');
          }
        }
      });
    }

    await simple('device-doffed', {}, async session => {
      send(session, {type: 'device', state: 'doffed'});
      await session.page.waitForTimeout(100);
      const found = await visibleText(session.page);
      session.check(found === '', `expected a blank screen, found "${found}"`);
    });

    await simple('device-donned', {}, async session => {
      send(session, {type: 'device', state: 'doffed'});
      await session.page.waitForTimeout(100);
      send(session, {type: 'device', state: 'donned'});
      await session.expectText('Physics Lens', {exact: true});
    });

    await simple('clear', {}, async session => {
      send(session, {type: 'show', reqId: 'clear-1', objectId: 'guitar', label: 'Guitar string'});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      send(session, {type: 'clear'});
      await session.page.waitForTimeout(100);
      const found = await visibleText(session.page);
      session.check(found === '', `expected clear to blank the screen, found "${found}"`);
      await session.page.keyboard.press('Enter');
      await session.expectText('Physics Lens', {exact: true});
      send(session, {type: 'clear'});
      await session.page.waitForTimeout(100);
    });

    await simple('replay', {}, async session => {
      const since = bridge.frames.length;
      send(session, {type: 'show', reqId: 'replay-live-1', objectId: 'guitar', label: 'Guitar string'});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      await session.page.keyboard.press('Enter');
      await session.expectText(/^Step 2\//);
      send(session, {type: 'show', reqId: 'replay-1', objectId: 'guitar', label: 'Guitar string', replay: true});
      await session.page.waitForTimeout(150);
      await session.expectText(/^Step 2\//);
      await sleep(1000);
      const rendered = bridge.frames.slice(since).some(frame => frame.message.type === 'rendered' && frame.message.reqId === 'replay-1');
      session.check(!rendered, 'replay show sent a rendered acknowledgement');
    });

    await simple('heartbeat', {}, async session => {
      const since = bridge.frames.length;
      send(session, {type: 'ping', t_sent: Date.now()});
      try {
        await bridge.waitForMessage(message => message.type === 'pong', {since, description: 'pong'});
      } catch (error) {
        session.check(false, errorMessage(error));
      }
    });

    await simple('token', {token: 'abc123'}, async session => {
      const hello = bridge.frames.slice(session.frameStart).find(frame => frame.message.type === 'hello')?.message;
      session.check(hello?.token === 'abc123', `expected hello token abc123, found ${JSON.stringify(hello?.token)}`);
      session.check(!new URL(session.page.url()).searchParams.has('k'), `page address still contains k=: ${session.page.url()}`);
    });

    await simple('token-fragment', {fragmentToken: 'frag456'}, async session => {
      const hello = bridge.frames.slice(session.frameStart).find(frame => frame.message.type === 'hello')?.message;
      session.check(hello?.token === 'frag456', `expected hello token frag456, found ${JSON.stringify(hello?.token)}`);
      session.check(!session.page.url().includes('k='), `page address still contains k=: ${session.page.url()}`);
    });

    await simple('token-foreign', {token: 'do-not-leak', bridgeHost: '127.0.0.2'}, async session => {
      const hello = bridge.frames.slice(session.frameStart).find(frame => frame.message.type === 'hello')?.message;
      session.check(!Object.hasOwn(hello ?? {}, 'token'), `foreign bridge received stored token: ${JSON.stringify(hello?.token)}`);
    });

    await simple('reconnect-backoff', {closeHelloCount: 3}, async session => {
      await bridge.waitFor(frame => {
        return frame.message.type === 'hello' && bridge.frames.slice(session.frameStart)
          .filter(item => item.message.type === 'hello').length >= 4;
      }, {since: session.frameStart, timeout: 8000, description: 'four reconnect hellos'});
      const hellos = bridge.frames.slice(session.frameStart).filter(frame => frame.message.type === 'hello').slice(0, 4);
      const gaps = hellos.slice(1).map((frame, index) => frame.received - hellos[index].received);
      session.check(gaps[2] >= 1400, `reconnect backoff did not grow after repeated open/close cycles: ${gaps.join(', ')} ms`);
    });

    await simple('consent', {params: {consent: 1}}, async session => {
      await session.expectText('Before you start', {exact: true});
      await session.expectText('OK, start', {exact: true});
      await captureScreenshot(session.page, path.join(SCREENSHOTS, session.result.screenshot.split('/').pop()));
      session.result.screenshotCaptured = true;
      await session.page.evaluate(() => document.activeElement?.blur());
      await session.page.keyboard.press('Enter');
      await session.expectText('Physics Lens', {exact: true});
      const stored = await session.page.evaluate(() => localStorage.getItem('lens.consent'));
      session.check(stored !== null && !Number.isNaN(Date.parse(stored)), `expected an ISO consent date, found ${JSON.stringify(stored)}`);
      await session.page.reload({waitUntil: 'networkidle'});
      await session.expectText('Physics Lens', {exact: true});
      const cardVisible = await session.page.getByText('Before you start', {exact: true}).isVisible().catch(() => false);
      session.check(!cardVisible, 'consent card returned after reloading with stored consent');
    });

    await simple('consent-device-frame', {}, async session => {
      send(session, {type: 'device', state: 'first_run'});
      await session.expectText('Before you start', {exact: true});
      await session.expectText('OK, start', {exact: true});
      await captureScreenshot(session.page, path.join(SCREENSHOTS, session.result.screenshot.split('/').pop()));
      session.result.screenshotCaptured = true;
      send(session, {type: 'detecting', reqId: 'consent-held-1', timeoutMs: 60000});
      send(session, {type: 'show', reqId: 'consent-held-1', objectId: 'kettle', label: 'Boiling kettle'});
      await session.page.waitForTimeout(100);
      await session.expectText('Before you start', {exact: true});
      await session.page.evaluate(() => document.activeElement?.blur());
      await session.page.keyboard.press('Enter');
      await session.expectText(/Convection and boiling/);
    });

    await simple('follow-up', {}, async session => {
      const kettle = objects.find(object => object.id === 'kettle');
      const lastLens = kettle?.chapters.at(-1);
      if (!kettle || !lastLens) throw new Error('kettle fixture is missing its last lens');
      const question = 'Why does it switch off?';
      const answer = 'Steam bends a metal strip that cuts the power.';
      send(session, {
        type: 'show',
        reqId: 'follow-up-1',
        objectId: kettle.id,
        label: kettle.label,
        question,
        answer,
        lensHint: {id: `${kettle.id}.${lastLens.lens}`, step: 2},
      });
      await session.expectText(`Q: ${question}`, {exact: true});
      await session.expectText(answer, {exact: true});
      await session.expectText(/^Step 2\//);
      const title = await session.page.locator('.ex-title').innerText();
      session.check(title.includes(lastLens.title), `expected title to name lens "${lastLens.title}", found "${title}"`);
      await captureScreenshot(session.page, path.join(SCREENSHOTS, session.result.screenshot.split('/').pop()));
      session.result.screenshotCaptured = true;
      await session.page.keyboard.press('Enter');
      await session.expectText(/^Step 3\//);
      const followUpVisible = await session.page.locator('.ex-follow-up').isVisible().catch(() => false);
      session.check(!followUpVisible, 'follow-up block remained after moving to another step');
    });

    await simple('follow-up-bad-hint', {}, async session => {
      const kettle = objects.find(object => object.id === 'kettle');
      // A show without Explore media opens on the first 2D lens.
      const firstLens = kettle?.chapters.find(chapter => chapter.lens !== 'explore' && chapter.scene !== 'model3d');
      if (!kettle || !firstLens) throw new Error('kettle fixture is missing its first lens');
      send(session, {
        type: 'show',
        reqId: 'follow-up-bad-1',
        objectId: kettle.id,
        label: kettle.label,
        question: 'Where does this go?',
        answer: 'This hint should be ignored.',
        lensHint: {id: 'kettle.not-a-lens', step: 99},
      });
      await session.expectText(/^Step 1\//);
      const title = await session.page.locator('.ex-title').innerText();
      session.check(title.includes(firstLens.title), `expected first lens title "${firstLens.title}", found "${title}"`);
    });

    await simple('demo', {params: {demo: 2}}, async session => {
      const since = bridge.frames.length;
      await session.page.locator('.ex-title').waitFor({state: 'visible', timeout: WAIT_MS});
      const initialTitle = await session.page.locator('.ex-title').innerText();
      await session.expectText('Demo', {exact: true});
      try {
        await session.page.waitForFunction(
          previous => document.querySelector('.ex-title')?.textContent?.trim() !== previous,
          initialTitle,
          {timeout: 12000},
        );
      } catch {
        session.check(false, `demo title did not change within 12 s from "${initialTitle}"`);
      }
      try {
        await bridge.waitForMessage(message => message.type === 'state' && message.demo === true, {
          since,
          timeout: 5000,
          description: 'demo state frame',
        });
      } catch (error) {
        session.check(false, errorMessage(error));
      }
      await captureScreenshot(session.page, path.join(SCREENSHOTS, session.result.screenshot.split('/').pop()));
      session.result.screenshotCaptured = true;
      await session.page.keyboard.press('ArrowDown');
      try {
        await session.page.getByText('Demo', {exact: true}).waitFor({state: 'hidden', timeout: WAIT_MS});
      } catch {
        session.check(false, 'Demo tag remained after a key press');
      }
      const rendered = bridge.frames.slice(since).some(frame => frame.message.type === 'rendered');
      session.check(!rendered, 'demo sent a rendered acknowledgement');
    });

    await simple('demo-button', {}, async session => {
      await session.expectText('Demo', {exact: true});
      await session.page.waitForTimeout(100);
      await session.page.keyboard.press('ArrowDown');
      await session.page.keyboard.press('ArrowDown');
      await session.page.keyboard.press('ArrowRight');
      const focused = await session.page.evaluate(() => {
        const element = document.activeElement;
        return element?.getAttribute('aria-label') || element?.textContent || '';
      });
      session.check(focused.includes('Demo'), `expected D-pad focus on Demo, found ${JSON.stringify(focused)}`);
      await session.page.keyboard.press('Enter');
      // The demo's first object may open on its Explore lens, whose top line has the name instead of .ex-title.
      const title = session.page.locator('.ex-title, .xp-name').first();
      await title.waitFor({state: 'visible', timeout: WAIT_MS});
      const initialTitle = await title.innerText();
      await session.page.waitForTimeout(1600);
      const laterTitle = await title.innerText();
      session.check(laterTitle === initialTitle, `Demo advanced too quickly from "${initialTitle}" to "${laterTitle}"`);
    });

    await simple('stale-request', {}, async session => {
      send(session, {type: 'detecting', reqId: 'new-request', timeoutMs: 60000});
      await session.expectText(/^Looking/);
      send(session, {type: 'show', reqId: 'old-request', objectId: 'guitar', label: 'Old guitar'});
      send(session, {type: 'error', reqId: 'old-request', code: 'detect_failed', message: 'Old error'});
      await session.page.waitForTimeout(150);
      await session.expectText(/^Looking/);
      session.check(await session.page.locator('.ex-canvas').count() === 0, 'stale show opened while a newer request was detecting');
      send(session, {type: 'show', reqId: 'new-request', objectId: 'ball', label: 'Ball'});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
    });

    const immediateSketch = {
      label: 'Stapler',
      answer: 'The handle multiplies your force.',
      chapters: [{
        lens: 'number',
        scene: 'number',
        title: 'Force ratio',
        lead: 'A longer handle multiplies force.',
        captions: ['The handle doubles the force at the staple.'],
        knobs: [{axis: 'x', label: 'handle length'}],
        spec: {
          headline: {value: 2, unit: 'times', label: 'force multiplication'},
          rows: [{value: 20, unit: 'N', label: 'hand force'}],
          knob: {label: 'handle', unit: 'cm', min: 5, max: 20, step: 1, value: 10},
          steps: [{show: 'rows'}],
        },
      }],
    };
    await simple('sketch-immediate', {}, async session => {
      const since = bridge.frames.length;
      send(session, {type: 'show', reqId: 'sketch-now', objectId: 'unknown', label: 'Stapler', sketchPending: true});
      send(session, {type: 'sketch', reqId: 'sketch-now', sketch: immediateSketch});
      await session.expectText('Stapler', {exact: true});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      try {
        await bridge.waitForMessage(message => message.type === 'rendered' && message.reqId === 'sketch-now', {
          since,
          description: 'rendered acknowledgement for immediate sketch',
        });
      } catch (error) {
        const frames = bridge.frames.slice(since).map(frame => frame.message.type === 'rendered'
          ? `${frame.message.type}:${frame.message.reqId}`
          : frame.message.type).join(', ');
        session.check(false, `${errorMessage(error)}; frames: ${frames}`);
      }
      await session.page.keyboard.press('ArrowUp');
      await session.page.waitForTimeout(100);
      const beforeReplay = await session.page.locator('.ex-read').innerText();
      send(session, {
        type: 'show',
        reqId: 'sketch-now',
        objectId: 'unknown',
        label: 'Stapler',
        sketch: immediateSketch,
        replay: true,
      });
      await session.page.waitForTimeout(150);
      const afterReplay = await session.page.locator('.ex-read').innerText();
      session.check(afterReplay === beforeReplay, `sketch replay reset the current value from ${JSON.stringify(beforeReplay)} to ${JSON.stringify(afterReplay)}`);
    });

    await simple('malformed-frame', {}, async session => {
      send(session, {
        type: 'show',
        reqId: 'bad-fields',
        objectId: 'ball',
        label: {bad: true},
        answer: {bad: true},
        question: {bad: true},
        summary: {bad: true},
        lenses: [{id: 'ball.motion', kind: 'motion', title: {bad: true}, lead: {bad: true}, steps: [{bad: true}]}],
      });
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      session.check((await visibleText(session.page)).length > 0, 'non-string show fields blanked the app');
      send(session, {type: 'error', code: {bad: true}, message: {bad: true}});
      await session.expectText('Something went wrong', {exact: true});
    });

    await simple('doffed-wake', {}, async session => {
      send(session, {type: 'show', reqId: 'doffed-scene', objectId: 'ball', label: 'Ball'});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      await session.page.evaluate(() => { delete window.__glassesFps; });
      send(session, {type: 'device', state: 'doffed'});
      await session.page.waitForTimeout(1300);
      const whileOff = await session.page.evaluate(() => window.__glassesFps);
      session.check(whileOff === undefined, `canvas frame loop continued while doffed: ${JSON.stringify(whileOff)}`);
      await session.page.keyboard.press('ArrowUp');
      await session.page.locator('.ex-title').waitFor({state: 'visible', timeout: WAIT_MS});
      await session.page.waitForFunction(() => typeof window.__glassesFps === 'number', null, {timeout: WAIT_MS});
      send(session, {type: 'device', state: 'doffed'});
      const since = bridge.frames.length;
      bridge.terminate(session.socket);
      await bridge.waitForMessage(message => message.type === 'hello', {since, description: 'reconnect while doffed'});
      await session.page.locator('.ex-title').waitFor({state: 'visible', timeout: WAIT_MS});
    });

    await simple('demo-stops', {}, async session => {
      send(session, {type: 'nav', action: 'demo'});
      await session.expectText('Demo', {exact: true});
      send(session, {type: 'clear'});
      await session.page.waitForTimeout(100);
      await session.page.keyboard.press('Enter');
      await session.expectText('Physics Lens', {exact: true});
      session.check(!await session.page.locator('.ex-tag', {hasText: 'Demo'}).isVisible().catch(() => false), 'clear did not stop demo mode');
      send(session, {type: 'nav', action: 'demo'});
      await session.expectText('Demo', {exact: true});
      send(session, {type: 'device', state: 'doffed'});
      send(session, {type: 'device', state: 'donned'});
      await session.page.locator('.ex-tag', {hasText: 'Demo'}).waitFor({state: 'hidden', timeout: WAIT_MS}).catch(() => {
        session.check(false, 'doffed did not stop demo mode');
      });
    });

    const flowSketch = {
      label: 'Motor',
      answer: 'Energy flows through the motor.',
      chapters: [{
        lens: 'flow',
        scene: 'flow',
        title: 'Energy flow',
        captions: ['Some energy leaves at each stage.'],
        knobs: [{axis: 'x', label: 'loss'}],
        spec: {
          kind: 'energy',
          nodes: [
            {id: 'a', label: 'Input', sub: '100 J'},
            {id: 'b', label: 'Coils', sub: 'turning'},
            {id: 'c', label: 'Output', sub: 'motion'},
          ],
          losses: [
            {at: 'a', label: 'Heat', share: 1},
            {at: 'b', label: 'Sound', share: 1},
            {at: 'c', label: 'Friction', share: 1},
          ],
          steps: [{upTo: 3, focus: ['c'], losses: true}],
        },
      }],
    };
    await simple('flow-loss-clamp', {}, async session => {
      send(session, {type: 'show', reqId: 'flow-loss', objectId: 'unknown', label: 'Motor', sketch: flowSketch});
      await session.expectText('100%', {exact: true});
      const hint = await session.page.locator('.ex-hint').textContent().catch(() => '');
      session.check(!hint, `flow sketch promised an unusable knob: ${JSON.stringify(hint)}`);

      // This state performs two scene checks; keep the client heartbeat fresh between them.
      session.socket = [...bridge.frames].reverse().find(frame => frame.message.type === 'hello' && frame.socket?.readyState === 1)?.socket
        ?? session.socket;
      send(session, {type: 'ping', t_sent: Date.now()});
      const mergeCheck = await session.page.evaluate(() => {
        const debug = window.__lensDebug;
        if (!debug) return {exists: false};
        const spec = {
          nodes: [{label: 'Input', watts: 2000}, {label: 'Output'}],
          tags: ['one', 'two'],
          nested: {title: 'Original', fixed: 7},
        };
        const merged = debug.mergeSpecText(spec, {
          nodes: [{label: 'Syote', watts: 'wrong'}, {label: 'Tulos'}, {label: 'extra'}],
          tags: ['yksi', 'kaksi', 'extra'],
          nested: {title: 'x'.repeat(100), fixed: 'wrong', extra: 'ignored'},
          extra: 'ignored',
        });
        return {
          exists: true,
          copied: merged !== spec && merged.nodes !== spec.nodes,
          labels: merged.nodes.map(node => node.label),
          nodeLength: merged.nodes.length,
          tags: merged.tags,
          titleLength: merged.nested.title.length,
          fixed: merged.nested.fixed,
          rootKeys: Object.keys(merged),
          nestedKeys: Object.keys(merged.nested),
          scalarIgnored: debug.mergeSpecText(spec, 'not an object') === spec,
        };
      });
      session.check(mergeCheck.exists === true, 'webdriver mergeSpecText debug hook is missing');
      session.check(mergeCheck.copied === true, `mergeSpecText did not deep-copy the spec: ${JSON.stringify(mergeCheck)}`);
      session.check(JSON.stringify(mergeCheck.labels) === JSON.stringify(['Syote', 'Tulos']),
        `mergeSpecText did not replace matching strings: ${JSON.stringify(mergeCheck)}`);
      session.check(mergeCheck.nodeLength === 2 && JSON.stringify(mergeCheck.tags) === JSON.stringify(['yksi', 'kaksi']),
        `mergeSpecText changed an array length: ${JSON.stringify(mergeCheck)}`);
      session.check(mergeCheck.titleLength === 80 && mergeCheck.fixed === 7,
        `mergeSpecText did not cap text or preserve a non-string: ${JSON.stringify(mergeCheck)}`);
      session.check(JSON.stringify(mergeCheck.rootKeys) === JSON.stringify(['nodes', 'tags', 'nested']) &&
        JSON.stringify(mergeCheck.nestedKeys) === JSON.stringify(['title', 'fixed']),
      `mergeSpecText added an unknown key: ${JSON.stringify(mergeCheck)}`);
      session.check(mergeCheck.scalarIgnored === true, 'mergeSpecText did not return spec unchanged for non-object text');

      const kettle = objects.find(object => object.id === 'kettle');
      const flow = kettle?.chapters.find(chapter => chapter.lens === 'flow');
      if (!kettle || !flow) throw new Error('kettle flow fixture is missing');
      send(session, {
        type: 'show',
        reqId: 'translated-flow',
        objectId: kettle.id,
        label: kettle.label,
        lang: 'fi',
        lensHint: {id: 'kettle.flow', step: 1},
        lenses: [{
          id: 'kettle.flow',
          kind: 'flow',
          title: 'Virtaus',
          steps: flow.captions,
          knobLabels: flow.knobs.map(() => null),
          specText: {
            nodes: [
              {label: 'Pistorasia'},
              {label: 'Vastus'},
              {label: 'Vesi'},
              {label: 'Hoyry'},
              {label: 'extra node'},
            ],
            extra: 'ignored',
          },
        }],
      });
      await session.expectText('Virtaus', {exact: false});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      try {
        await session.page.waitForFunction(() => {
          const canvas = document.querySelector('.ex-canvas');
          if (!(canvas instanceof HTMLCanvasElement)) return false;
          const context = canvas.getContext('2d');
          if (!context) return false;
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index] || pixels[index + 1] || pixels[index + 2]) return true;
          }
          return false;
        }, null, {timeout: WAIT_MS});
      } catch (error) {
        session.check(false, `translated flow canvas stayed black: ${errorMessage(error)}`);
      }
    });

    await simple('curve-bounds', {}, async session => {
      const curveSketch = {
        label: 'Huge curve',
        answer: 'The invalid range is shown as text only.',
        chapters: [{
          lens: 'whatif',
          scene: 'curve',
          title: 'Huge range',
          captions: ['This range must not freeze the display.'],
          knobs: [{axis: 'x', label: 'value'}],
          spec: {
            x: {label: 'x', unit: 'm', min: 1e16, max: 1e16 + 4, step: 1, value: 1e16},
            y: {label: 'y', unit: 'm'},
            series: [{name: 'line', role: 'main', points: [[1e16, 0], [1e16 + 4, 1]]}],
            marks: [{x: 1e16 + 2, label: 'middle'}],
            steps: [{series: ['line']}],
          },
        }],
      };
      send(session, {type: 'show', reqId: 'curve-huge', objectId: 'unknown', label: 'Huge curve', sketch: curveSketch});
      await session.expectText('This range must not freeze the display.', {exact: false});
      await session.page.keyboard.press('ArrowUp');
      session.check((await visibleText(session.page)).includes('Huge curve'), 'huge curve range froze or blanked the app');
    });

    // ---- Explore lens ----
    const kettleFlow = objects.find(object => object.id === 'kettle')?.chapters.find(chapter => chapter.lens === 'flow');
    if (!kettleFlow) throw new Error('kettle flow chapter is missing (the Explore fixture borrows it as its second lens)');
    const fixtureDir = path.join(FIXTURE_MEDIA, FIXTURE_ID);
    const fixtureManifest = JSON.parse(await readFile(path.join(fixtureDir, 'manifest.json'), 'utf8'));
    const fixtureTracks = JSON.parse(await readFile(path.join(fixtureDir, 'explore', 'tracks.json'), 'utf8'));
    const fixtureEntry = fixtureManifest.lenses[`${FIXTURE_ID}.explore`];
    const exploreObject = exploreFixtureObject(kettleFlow);
    const fixtureMedia = {base: `/media/${FIXTURE_ID}`, lenses: fixtureManifest.lenses};
    const exploreShow = (reqId, extra = {}) => ({
      type: 'show', reqId, objectId: FIXTURE_ID, label: exploreObject.label, media: fixtureMedia, ...extra,
    });
    const debugOf = page => page.evaluate(() => window.__exploreDebug ?? null);
    const waitDebug = (page, predicate, arg = null, timeout = WAIT_MS) => page.waitForFunction(predicate, arg, {timeout});
    const exploreState = (name, action) => simple(name, {}, async session => {
      if (!browser.h264) {
        session.result.skipped = 'this browser cannot decode H.264 video';
        return;
      }
      await session.page.evaluate(object => window.__lensDebug?.registerObject(object), exploreObject);
      await action(session);
    });
    const openExplore = async (session, reqId, extra) => {
      send(session, exploreShow(reqId, extra));
      await session.page.locator('.xp').waitFor({state: 'visible', timeout: WAIT_MS});
      await waitDebug(session.page, () => window.__exploreDebug?.started === true && window.__exploreDebug.mode === 'video');
    };
    const checkExploreLayout = async session => {
      for (const problem of await exploreLayoutProblems(session.page)) session.check(false, problem);
    };
    const shoot = async session => {
      await captureScreenshot(session.page, path.join(SCREENSHOTS, session.result.screenshot.split('/').pop()));
      session.result.screenshotCaptured = true;
    };
    const nextBeat = async (session, beat) => {
      await session.page.keyboard.press('Enter');
      await waitDebug(session.page, index => window.__exploreDebug?.beat === index && window.__exploreDebug.started, beat);
    };

    await exploreState('explore-plays', async session => {
      const since = bridge.frames.length;
      await openExplore(session, 'explore-1');
      const state = await bridge.waitForMessage(message => message.type === 'state' && message.objectId === FIXTURE_ID &&
        message.step === 1, {since, description: 'Explore state frame'});
      session.check(state.message.lens === 'explore' && state.message.lensIndex === 0 && state.message.steps === 3,
        `expected the Explore lens first with 3 beats, found ${JSON.stringify(state.message)}`);
      const t1 = (await debugOf(session.page)).videoTime;
      await session.page.waitForTimeout(600);
      const t2 = (await debugOf(session.page)).videoTime;
      session.check(t2 > t1 + 0.3, `video time did not advance: ${t1} -> ${t2}`);
      try {
        await bridge.waitForMessage(message => message.type === 'rendered' && message.reqId === 'explore-1', {
          since, description: 'rendered acknowledgement for Explore',
        });
      } catch (error) {
        session.check(false, errorMessage(error));
      }
      await waitDebug(session.page, () => window.__exploreDebug?.labels.some(label => label.alpha >= 1));
      const overlayLit = await session.page.evaluate(() => {
        const canvas = document.querySelector('.xp-overlay');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        // Coloured pixels only: the black text bands are drawn on this canvas too.
        for (let index = 0; index < pixels.length; index += 4) if (pixels[index] || pixels[index + 1] || pixels[index + 2]) return true;
        return false;
      });
      session.check(overlayLit, 'label overlay canvas is empty');
      const centre = await regionMax(session.page, SQUARE_CLIP);
      session.check(centre > 60, `video frame is black where the fixture draws its square (max ${centre})`);
      await session.expectText(EXPLORE_CAPTIONS[0], {exact: true});
      await session.expectText('Cube', {exact: true});
      session.check(await session.page.locator('.ex-dock').count() === 0, 'Explore lens shows a dock button');
      await checkExploreLayout(session);
    });

    await exploreState('explore-labels', async session => {
      send(session, exploreShow('explore-labels-1'));
      await waitDebug(session.page, () => window.__exploreDebug?.started === true && window.__exploreDebug.videoTime < 0.6);
      const early = await debugOf(session.page);
      session.check(early.labels.length === 2 && early.labels.every(label => label.alpha === 0),
        `labels must wait for the camera move; at ${early.videoTime.toFixed(2)} s found ${JSON.stringify(early.labels.map(label => [label.text, label.alpha]))}`);
      await waitDebug(session.page, () => window.__exploreDebug?.videoTime > 1.2 &&
        window.__exploreDebug.labels.length === 2 && window.__exploreDebug.labels.every(label => label.alpha >= 1));
      const a = await debugOf(session.page);
      await session.page.waitForTimeout(500);
      const b = await debugOf(session.page);
      const ringA = a.labels.find(label => label.part === 'ring');
      const ringB = b.labels.find(label => label.part === 'ring');
      const core = b.labels.find(label => label.part === 'core');
      session.check(Boolean(ringA && ringB && core), `expected Ring and Core labels, found ${JSON.stringify(b.labels)}`);
      if (ringA && ringB && core) {
        session.check(Math.hypot(ringB.ax - ringA.ax, ringB.ay - ringA.ay) > 5,
          `Ring leader did not follow its anchor: ${ringA.ax},${ringA.ay} -> ${ringB.ax},${ringB.ay}`);
        const [ex, ey] = trackAnchor(fixtureTracks.beats[0].labels[0].anchor, b.videoTime);
        session.check(Math.abs(ringB.ax - ex) < 4 && Math.abs(ringB.ay - ey) < 4,
          `Ring anchor ${ringB.ax.toFixed(1)},${ringB.ay.toFixed(1)} is not the track position ${ex.toFixed(1)},${ey.toFixed(1)} at ${b.videoTime.toFixed(2)} s`);
        session.check(ringB.text === 'Ring' && ringB.side === 'r' && ringB.x === 576 && ringB.focus,
          `Ring label should be white in the right column at x 576: ${JSON.stringify(ringB)}`);
        session.check(core.text === 'Core' && core.side === 'l' && core.x === 24 && !core.focus,
          `Core label should be soft in the left column at x 24: ${JSON.stringify(core)}`);
        session.check(Math.abs(ringB.y - ringA.y) < 0.5, 'label text moved while its anchor moved');
      }
      await checkExploreLayout(session);
    });

    await exploreState('explore-autoplay', async session => {
      const since = bridge.frames.length;
      await openExplore(session, 'explore-auto-1');
      const started = Date.now() - (await debugOf(session.page)).videoTime * 1000;
      try {
        await bridge.waitForMessage(message => message.type === 'state' && message.objectId === FIXTURE_ID &&
          message.lensIndex === 0 && message.step === 2, {since, timeout: 6000, description: 'auto-play to beat 2'});
        const elapsed = Date.now() - started;
        session.check(elapsed >= 2700, `auto-play left beat 1 after ${elapsed} ms, before its 3 s`);
        await bridge.waitForMessage(message => message.type === 'state' && message.objectId === FIXTURE_ID &&
          message.lensIndex === 0 && message.step === 3, {since, timeout: 6000, description: 'auto-play to beat 3'});
      } catch (error) {
        session.check(false, errorMessage(error));
      }
      const atLast = bridge.frames.length;
      await session.page.waitForTimeout(4600);
      const moved = bridge.frames.slice(atLast).filter(frame => frame.message.type === 'state');
      session.check(moved.length === 0, `auto-play moved on from the last beat: ${JSON.stringify(moved.map(frame => frame.message))}`);
      const last = await debugOf(session.page);
      session.check(last.beat === 2 && last.loops >= 1 && last.videoTime >= 0.9 && last.mode === 'video',
        `last beat should loop from loopFrom 1 s: ${JSON.stringify({beat: last.beat, loops: last.loops, t: last.videoTime, mode: last.mode})}`);
      await checkExploreLayout(session);
    });

    await exploreState('explore-input-pause', async session => {
      const since = bridge.frames.length;
      await openExplore(session, 'explore-pause-1');
      await waitDebug(session.page, () => window.__exploreDebug?.videoTime > 1.5 && window.__exploreDebug.labels.every(label => label.alpha >= 1));
      // Up replays the beat: the video restarts and the labels wait for the camera move again.
      await session.page.keyboard.press('ArrowUp');
      try {
        await waitDebug(session.page, () => window.__exploreDebug?.started === true && window.__exploreDebug.videoTime < 0.6 &&
          window.__exploreDebug.labels.every(label => label.alpha === 0), null, 2000);
      } catch {
        session.check(false, `Up did not replay the beat: ${JSON.stringify(await debugOf(session.page))}`);
      }
      const after = await debugOf(session.page);
      session.check(after.autoPausedMs > 15000, `input did not pause auto-play: ${after.autoPausedMs} ms`);
      await session.page.waitForTimeout(4200);
      const stepped = bridge.frames.slice(since).some(frame => frame.message.type === 'state' && frame.message.step === 2);
      const now = await debugOf(session.page);
      session.check(!stepped && now.beat === 0, `auto-play advanced during the 20 s input pause (beat ${now.beat + 1})`);
      const progress = await session.page.locator('.xp-progress-fill').evaluate(element => getComputedStyle(element).opacity);
      session.check(progress === '0', `progress line still shows while auto-play is paused (opacity ${progress})`);
      await checkExploreLayout(session);
    });

    await exploreState('explore-preload', async session => {
      await openExplore(session, 'explore-preload-1');
      try {
        await waitDebug(session.page, () => window.__exploreDebug?.nextSrc.endsWith('/b2.mp4') && window.__exploreDebug.nextReady >= 2);
      } catch {
        session.check(false, `beat 2 was not preloaded: ${JSON.stringify(await debugOf(session.page))}`);
      }
      const requestsBefore = bridge.mediaRequests.filter(item => item.endsWith('b2.mp4')).length;
      const pressed = Date.now();
      await session.page.keyboard.press('Enter');
      const samples = [];
      for (let index = 0; index < 4; index++) samples.push(await regionMax(session.page, SQUARE_CLIP));
      session.check(samples.every(value => value > 60), `a black frame showed while switching beats: ${samples.join(', ')}`);
      await waitDebug(session.page, () => window.__exploreDebug?.beat === 1 && window.__exploreDebug.mode === 'video' &&
        window.__exploreDebug.activeSrc.endsWith('/b2.mp4'));
      const swapMs = Date.now() - pressed;
      session.check(swapMs < 1000, `preloaded beat took ${swapMs} ms to show`);
      const square = await regionMax(session.page, SQUARE_CLIP);
      session.check(square > 200, `beat 2 (white square) is not on screen: max ${square}`);
      const requestsAfter = bridge.mediaRequests.filter(item => item.endsWith('b2.mp4')).length;
      session.check(requestsBefore >= 1, 'beat 2 was never requested before the switch');
      session.result.note = `b2 requests before/after switch: ${requestsBefore}/${requestsAfter}`;
      await waitDebug(session.page, () => window.__exploreDebug?.labels.some(label => label.alpha >= 1));
      const dims = (await debugOf(session.page)).dims;
      session.check(dims.length === 1 && dims[0].text === '8 cm' && dims[0].alpha >= 1 && Math.abs(dims[0].x - 300) < 1 && dims[0].y < 251,
        `dimension text should sit above the line's middle: ${JSON.stringify(dims)}`);
      await checkExploreLayout(session);
    });

    await exploreState('explore-number', async session => {
      await openExplore(session, 'explore-number-1');
      await nextBeat(session, 1);
      await nextBeat(session, 2);
      await waitDebug(session.page, () => window.__exploreDebug?.labels.length === 2 && window.__exploreDebug.labels.every(label => label.alpha >= 1));
      const value = await session.page.locator('.xp-number-value').innerText().catch(() => '');
      const unit = await session.page.locator('.xp-number-unit').innerText().catch(() => '');
      session.check(value.includes('2000') && unit === 'W', `expected the number 2000 W, found ${JSON.stringify([value, unit])}`);
      await session.expectText('heating power', {exact: true});
      const colour = await session.page.locator('.xp-number-value').evaluate(element => getComputedStyle(element).color);
      session.check(colour === 'rgb(109, 255, 156)', `number is not green: ${colour}`);
      const size = await session.page.locator('.xp-number-value').evaluate(element => getComputedStyle(element).fontSize);
      session.check(size === '44px', `number value is ${size}, expected 44px`);
      await checkExploreLayout(session);
    });

    await exploreState('explore-last-beat', async session => {
      await openExplore(session, 'explore-last-1');
      await nextBeat(session, 1);
      await nextBeat(session, 2);
      const since = bridge.frames.length;
      await session.page.keyboard.press('Enter');
      try {
        const state = await bridge.waitForMessage(message => message.type === 'state' && message.objectId === FIXTURE_ID &&
          message.lensIndex === 1, {since, description: 'next lens after the last beat'});
        session.check(state.message.lens === 'flow' && state.message.step === 1,
          `pinch on the last beat should open the flow lens at step 1: ${JSON.stringify(state.message)}`);
      } catch (error) {
        session.check(false, errorMessage(error));
      }
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      session.check(await session.page.locator('.xp').count() === 0, 'Explore view stayed after leaving the lens');
      session.check(await session.page.locator('.ex-lens-dot--explore').count() === 1, 'lens bar has no Explore mark');
      await session.page.waitForTimeout(300);
    });

    await exploreState('explore-fallback', async session => {
      bridge.mediaStall = new RegExp(`^${FIXTURE_ID}/explore/b1\\.mp4$`);
      try {
        const sent = Date.now();
        send(session, exploreShow('explore-fallback-1'));
        try {
          await waitDebug(session.page, () => window.__exploreDebug?.mode === 'still', null, 3000);
        } catch {
          session.check(false, `still did not replace the stalled video: ${JSON.stringify(await debugOf(session.page))}`);
        }
        const elapsed = Date.now() - sent;
        session.check(elapsed >= 1400 && elapsed <= 2100, `fallback took ${elapsed} ms (expected about 1.5 s)`);
        const still = await debugOf(session.page);
        session.check(still?.stillSrc.endsWith('/c1.png'), `expected c1.png, found ${JSON.stringify(still?.stillSrc)}`);
        await waitDebug(session.page, () => window.__exploreDebug?.labels.length === 2 && window.__exploreDebug.labels.every(label => label.alpha >= 1));
        const labels = (await debugOf(session.page)).labels;
        const ring = labels.find(label => label.part === 'ring');
        const [restX, restY] = trackAnchor(fixtureTracks.beats[0].labels[0].anchor, fixtureTracks.beats[0].loopFrom);
        session.check(ring && Math.abs(ring.ax - restX) < 2 && Math.abs(ring.ay - restY) < 2,
          `labels on the still (the frame at loopFrom) must use that anchor ${restX},${restY}: ${JSON.stringify(ring)}`);
        const square = await regionMax(session.page, SQUARE_CLIP);
        session.check(square > 60, `still is not on screen (max ${square})`);
        await checkExploreLayout(session);
        await shoot(session);
      } finally {
        bridge.mediaStall = null;
      }
      await nextBeat(session, 1);
      const next = await debugOf(session.page);
      session.check(next.mode === 'video', `beat 2 should play its video after a stalled beat 1: ${next.mode}`);
    });

    await exploreState('explore-missing', async session => {
      for (const [reqId, extra] of [['explore-none-1', {media: undefined}], ['explore-none-2', {media: {base: `/media/${FIXTURE_ID}`, lenses: {}}}],
        ['explore-none-3', {media: {base: '../../etc', lenses: fixtureManifest.lenses}}]]) {
        const since = bridge.frames.length;
        send(session, exploreShow(reqId, extra));
        try {
          const state = await bridge.waitForMessage(message => message.type === 'state' && message.objectId === FIXTURE_ID &&
            message.step === 1, {since, description: `${reqId} state`});
          session.check(state.message.lens === 'flow' && state.message.lensIndex === 0 && state.message.steps === kettleFlow.captions.length,
            `${reqId}: without Explore media the object must open on its next lens: ${JSON.stringify(state.message)}`);
        } catch (error) {
          session.check(false, errorMessage(error));
        }
        await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
        session.check(await session.page.locator('.xp, .ex-lens-dot--explore').count() === 0, `${reqId}: Explore still shows`);
      }
      await session.expectText(kettleFlow.captions[0], {exact: false});
    });

    await exploreState('explore-finnish', async session => {
      const fiCaptions = [
        'Rengas kiert\u00e4\u00e4 ydint\u00e4, kun kamera asettuu.',
        'Akseli pit\u00e4\u00e4 renkaan radallaan ytimen ymp\u00e4rill\u00e4.',
        'Vastus muuttaa 2000 W s\u00e4hk\u00f6\u00e4 l\u00e4mm\u00f6ksi.',
      ];
      await openExplore(session, 'explore-fi-1', {
        lang: 'fi',
        label: 'Testikuutio',
        lenses: [{
          id: `${FIXTURE_ID}.explore`,
          kind: 'explore',
          title: 'Miten se toimii',
          steps: fiCaptions,
          specText: {
            parts: [{label: 'Rengas'}, {label: 'Ydin'}, {label: 'Akseli'}],
            beats: [null, null, {number: {label: 'l\u00e4mmitysteho'}}],
          },
        }],
      });
      await waitDebug(session.page, () => window.__exploreDebug?.labels.length === 2 && window.__exploreDebug.labels.every(label => label.alpha >= 1));
      const texts = (await debugOf(session.page)).labels.map(label => label.text).sort();
      session.check(JSON.stringify(texts) === JSON.stringify(['Rengas', 'Ydin']), `expected Finnish label text, found ${JSON.stringify(texts)}`);
      await session.expectText(fiCaptions[0], {exact: true});
      const lang = await session.page.locator('.xp').getAttribute('lang');
      session.check(lang === 'fi', `Explore root lang is ${JSON.stringify(lang)}`);
      await checkExploreLayout(session);
      await shoot(session);
      await nextBeat(session, 1);
      await nextBeat(session, 2);
      await session.expectText('l\u00e4mmitysteho', {exact: true});
    });

    await exploreState('explore-sketch', async session => {
      const sketch = {
        label: 'Test cube',
        answer: 'A ring turns around a cube.',
        chapters: [
          {lens: 'explore', scene: 'model3d', title: 'How it works', captions: EXPLORE_CAPTIONS, spec: EXPLORE_SPEC},
          flowSketch.chapters[0],
        ],
      };
      send(session, {type: 'show', reqId: 'explore-sketch-1', objectId: 'unknown', label: 'Test cube',
        sketch: {...sketch, media: {base: `/media/${FIXTURE_ID}`, lenses: {'sketch.explore': fixtureEntry}}}});
      await session.page.locator('.xp').waitFor({state: 'visible', timeout: WAIT_MS});
      await waitDebug(session.page, () => window.__exploreDebug?.labels.length === 2 && window.__exploreDebug.labels.every(label => label.alpha >= 1));
      const tag = await session.page.locator('.xp-top .ex-tag--hot').innerText().catch(() => '');
      session.check(tag === 'Sketch \u00b7 unverified', `Explore sketch tag is ${JSON.stringify(tag)}`);
      await checkExploreLayout(session);
      await shoot(session);
      send(session, {type: 'show', reqId: 'explore-sketch-2', objectId: 'unknown', label: 'Test cube', sketch});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
      session.check(await session.page.locator('.xp').count() === 0, 'sketch without rendered media still opened the Explore lens');
      await session.expectText('Sketch \u00b7 unverified', {exact: true});
    });

    await exploreState('explore-home', async session => {
      const before = bridge.mediaRequests.length;
      await session.page.evaluate(id => window.__lensDebug?.open?.(id), FIXTURE_ID);
      await session.page.locator('.xp').waitFor({state: 'visible', timeout: WAIT_MS});
      session.check(bridge.mediaRequests.slice(before).includes(`${FIXTURE_ID}/manifest.json`), 'home open did not ask the bridge for the manifest');
      await waitDebug(session.page, () => window.__exploreDebug?.started === true);
    });

    const selectedObjects = options.only && objectIds.has(options.only)
      ? objects.filter(object => object.id === options.only)
      : objects;

    for (const object of selectedObjects) {
      if (options.only && simpleNames.includes(options.only)) break;
      let session;
      try {
        session = await openPage();
        const sceneFrameStart = bridge.frames.length;
        // The Explore lens is walked only when its rendered media is in bridge/media/<id>/ (served by
        // the scripted bridge); otherwise the app skips it, and so does the walk.
        const isExplore = chapter => chapter.lens === 'explore' || chapter.scene === 'model3d';
        const exploreMedia = browser.h264 && object.chapters.some(isExplore) ? await realExploreMedia(object.id) : null;
        const walkChapters = exploreMedia
          ? [...object.chapters.filter(isExplore).slice(0, 1), ...object.chapters.filter(chapter => !isExplore(chapter))]
          : object.chapters.filter(chapter => !isExplore(chapter));
        bridge.send(session.socket, {type: 'show', reqId: `scene-${object.id}`, objectId: object.id, label: object.label,
          ...(exploreMedia ? {media: exploreMedia} : {})});
        let knobChecked = false;
        let consoleCursor = 0;

        for (let lensIndex = 0; lensIndex < walkChapters.length; lensIndex++) {
          const chapter = walkChapters[lensIndex];
          const lensKey = `${object.id}.${chapter.lens}`;
          const samples = [];
          const lensResults = [];

          for (let stepIndex = 0; stepIndex < chapter.captions.length; stepIndex++) {
            const name = `scene-${object.id}-${chapter.lens}-s${stepIndex + 1}`;
            if (options.only && isSceneName(options.only) && options.only !== name) {
              if (stepIndex + 1 < chapter.captions.length) {
                await session.page.locator('.ex-caption, .xp-caption').first().waitFor({state: 'visible', timeout: WAIT_MS});
                await session.page.keyboard.press('Enter');
              }
              continue;
            }
            const filename = `${name}.png`;
            const result = {name, ok: false, screenshot: `states/${filename}`, failures: []};
            lensResults.push(result);
            const consoleStart = consoleCursor;
            // Long walks (the kettle has six lenses) outlast the app's 25 s link timeout: keep it fresh.
            const liveSocket = [...bridge.frames].reverse().find(frame => frame.message.type === 'hello' && frame.socket?.readyState === 1)?.socket;
            if (liveSocket) {
              session.socket = liveSocket;
              bridge.send(liveSocket, {type: 'ping', t_sent: Date.now()});
            }
            try {
              try {
                await session.page.getByText(chapter.captions[stepIndex], {exact: false}).first().waitFor({state: 'visible', timeout: WAIT_MS});
              } catch {
                addFailure(result, `expected caption "${chapter.captions[stepIndex]}", found "${await visibleText(session.page)}"`);
              }

              let stateFrame;
              try {
                stateFrame = await bridge.waitForMessage(message => {
                  return message.type === 'state' && message.objectId === object.id &&
                    message.lensIndex === lensIndex && message.step === stepIndex + 1;
                }, {since: sceneFrameStart, description: `${name} state frame`});
              } catch (error) {
                addFailure(result, errorMessage(error));
              }
              if (stateFrame) {
                const message = stateFrame.message;
                if (!Object.hasOwn(message, 'lens')) addFailure(result, 'state frame is missing lens');
                if (!Object.hasOwn(message, 'lensIndex')) addFailure(result, 'state frame is missing lensIndex');
                if (!Object.hasOwn(message, 'steps')) addFailure(result, 'state frame is missing steps');
                if (message.lens !== chapter.lens || message.lensIndex !== lensIndex || message.steps !== chapter.captions.length) {
                  addFailure(result, `state frame expected lens=${chapter.lens}, lensIndex=${lensIndex}, steps=${chapter.captions.length}; found ${JSON.stringify(message)}`);
                }
              }

              const exploreLens = chapter.lens === 'explore';
              const canvasCount = exploreLens ? 0 : await session.page.locator('.ex-canvas').count();
              if (exploreLens) {
                // Real rendered beats: wait for the picture and the labels' fade, then check the layout.
                try {
                  await session.page.waitForFunction(index => window.__exploreDebug?.beat === index &&
                    window.__exploreDebug.started, stepIndex, {timeout: WAIT_MS});
                  await session.page.waitForTimeout(1500);
                  const debug = await session.page.evaluate(() => window.__exploreDebug);
                  if (debug.mode !== 'video') addFailure(result, `beat ${stepIndex + 1} shows ${debug.mode}, not its video`);
                } catch (error) {
                  addFailure(result, `Explore beat did not start: ${errorMessage(error)}`);
                }
                for (const problem of await exploreLayoutProblems(session.page)) addFailure(result, problem);
              } else if (!canvasCount && chapter.lens === 'whatif') {
                result.skipped = 'curve scene not built yet';
              } else if (!canvasCount) {
                addFailure(result, `expected a canvas for ${chapter.scene}, found none`);
              } else {
                try {
                  await session.page.waitForFunction(() => {
                    const canvas = document.querySelector('.ex-canvas');
                    if (!(canvas instanceof HTMLCanvasElement)) return false;
                    const context = canvas.getContext('2d');
                    if (!context) return false;
                    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                    for (let index = 0; index < pixels.length; index += 4) {
                      if (pixels[index] || pixels[index + 1] || pixels[index + 2]) return true;
                    }
                    return false;
                  }, null, {timeout: WAIT_MS});
                } catch (error) {
                  addFailure(result, `canvas is entirely black after waiting for paint: ${errorMessage(error)}`);
                }
                await session.page.evaluate(() => { delete window.__glassesFps; });
                await session.page.evaluate(() => {
                  window.__readoutMutations = 0;
                  window.__readoutObserver?.disconnect();
                  const readouts = document.querySelector('.ex-read');
                  if (!readouts) return;
                  const observer = new MutationObserver(() => {
                    window.__readoutMutations += 1;
                  });
                  observer.observe(readouts, {subtree: true, childList: true, characterData: true});
                  window.__readoutObserver = observer;
                });
                await session.page.waitForTimeout(1200);
                const sample = await session.page.evaluate(() => window.__glassesFps);
                if (typeof sample === 'number' && Number.isFinite(sample)) samples.push(sample);
                else addFailure(result, `window.__glassesFps was ${JSON.stringify(sample)} after 1.2 s`);
                const readoutState = await session.page.evaluate(() => {
                  window.__readoutObserver?.disconnect();
                  const root = document.querySelector('.ex-read');
                  const chips = root ? [...root.children] : [];
                  const tops = chips.map(chip => Math.round(chip.getBoundingClientRect().top));
                  return {
                    count: chips.length,
                    oneLine: tops.length < 2 || tops.every(top => Math.abs(top - tops[0]) <= 1),
                    mutations: window.__readoutMutations ?? 0,
                    live: root?.getAttribute('aria-live'),
                    role: root?.getAttribute('role'),
                  };
                });
                if (readoutState.count > 3) addFailure(result, `expected at most 3 readouts, found ${readoutState.count}`);
                if (!readoutState.oneLine) addFailure(result, 'readouts wrapped onto more than one line');
                if (readoutState.mutations > 3) addFailure(result, `readouts updated ${readoutState.mutations} times in 1.2 s`);
                if (readoutState.live !== 'off' || readoutState.role !== null) {
                  addFailure(result, `readouts must use aria-live=off without a live role; found live=${readoutState.live}, role=${readoutState.role}`);
                }

                const knob = chapter.knobs?.[stepIndex];
                if (!knobChecked && knob) {
                  const beforeFrame = [...bridge.frames].reverse().find(frame => {
                    const message = frame.message;
                    return message.type === 'state' && message.objectId === object.id &&
                      message.lensIndex === lensIndex && message.step === stepIndex + 1 && typeof message.param === 'number';
                  });
                  const before = beforeFrame?.message.param;
                  const since = bridge.frames.length;
                  await session.page.keyboard.press('ArrowUp');
                  try {
                    const changed = await bridge.waitForMessage(message => {
                      return message.type === 'state' && message.objectId === object.id &&
                        message.lensIndex === lensIndex && message.step === stepIndex + 1 &&
                        typeof message.param === 'number' && message.param !== before;
                    }, {since, description: `${name} changed knob param`});
                    if (changed.message.param === before) addFailure(result, `ArrowUp did not change param from ${before}`);
                    else knobChecked = true;
                  } catch (error) {
                    addFailure(result, `${errorMessage(error)}; previous param was ${JSON.stringify(before)}`);
                  }
                }
              }

              try {
                await session.page.getByText(chapter.captions[stepIndex], {exact: false}).first().waitFor({state: 'visible', timeout: WAIT_MS});
                if (canvasCount) {
                  await session.page.waitForFunction(() => {
                    const canvas = document.querySelector('.ex-canvas');
                    if (!(canvas instanceof HTMLCanvasElement)) return false;
                    const context = canvas.getContext('2d');
                    if (!context) return false;
                    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                    for (let index = 0; index < pixels.length; index += 4) {
                      if (pixels[index] || pixels[index + 1] || pixels[index + 2]) return true;
                    }
                    return false;
                  }, null, {timeout: WAIT_MS});
                }
                await session.page.waitForTimeout(50);
              } catch (error) {
                addFailure(result, `screen did not settle before capture: ${errorMessage(error)}`);
              }

              const offenders = await fontOffenders(session.page);
              if (offenders.length) {
                addFailure(result, `visible text under 16 px: ${offenders.map(item => `"${short(item.text, 60)}" (${item.size}px)`).join(', ')}`);
              }
              const layout = await layoutOffenders(session.page);
              for (const offender of layout) addFailure(result, `${offender.kind}: "${short(offender.text, 100)}"`);
              const newConsoleErrors = session.consoleErrors.slice(consoleStart);
              consoleCursor = session.consoleErrors.length;
              if (newConsoleErrors.length) addFailure(result, `console errors: ${newConsoleErrors.map(error => short(error, 160)).join(' | ')}`);
              await captureScreenshot(session.page, path.join(SCREENSHOTS, filename));
            } catch (error) {
              addFailure(result, errorMessage(error));
              await captureScreenshot(session.page, path.join(SCREENSHOTS, filename)).catch(screenshotError => {
                addFailure(result, `screenshot failed: ${errorMessage(screenshotError)}`);
              });
            }

            if (stepIndex + 1 < chapter.captions.length) await session.page.keyboard.press('Enter');
          }

          if (samples.length) {
            const lensMedian = median(samples);
            fps[lensKey] = {
              min: Number(Math.min(...samples).toFixed(2)),
              median: Number(lensMedian.toFixed(2)),
            };
            if (lensMedian < FPS_LIMIT && lensResults.length) {
              addFailure(lensResults[lensResults.length - 1], `median frame rate ${lensMedian.toFixed(2)} fps is under ${FPS_LIMIT} fps`);
            }
          }
          for (const result of lensResults) recordResult(result);
          if (lensIndex + 1 < walkChapters.length) {
            const navSince = bridge.frames.length;
            await session.page.keyboard.press('ArrowRight');
            try {
              await bridge.waitForMessage(message => message.type === 'state' && message.objectId === object.id &&
                message.lensIndex === lensIndex + 1 && message.step === 1, {
                since: navSince,
                description: `${object.id} lens ${lensIndex + 1} state after lens change`,
              });
              await session.page.waitForTimeout(100);
              const stale = bridge.frames.slice(navSince).filter(frame => frame.message.type === 'state' &&
                frame.message.objectId === object.id && frame.message.lensIndex === lensIndex);
              if (stale.length && lensResults.length) {
                addFailure(lensResults[lensResults.length - 1], `lens change emitted ${stale.length} stale state frame(s)`);
              }
            } catch (error) {
              if (lensResults.length) addFailure(lensResults[lensResults.length - 1], errorMessage(error));
            }
          }
        }

        // Only objects that have a knob on some step must show a changed param (the spoon has none).
        const hasKnob = walkChapters.some(chapter => !isExplore(chapter) && (chapter.knobs === undefined || chapter.knobs.some(Boolean)));
        if (hasKnob && !knobChecked && (!options.only || objectIds.has(options.only))) {
          failures.push(`${object.id}: no knob step produced a changed param state frame`);
        }
      } catch (error) {
        failures.push(`${object.id}: scene walk aborted: ${errorMessage(error)}`);
        console.error(`${object.id}: FAIL: scene walk aborted: ${errorMessage(error)}`);
      } finally {
        if (session) {
          await session.context.close().catch(error => failures.push(`${object.id}: page close failed: ${errorMessage(error)}`));
        }
      }
      if (!options.only && object !== selectedObjects.at(-1)) {
        await browser.close().catch(() => {});
        browser = await launchBrowser(options.headed);
      }
    }

    bundle.requests = firstPaintRequests ?? 0;
    if (bundle.totalGzipBytes >= TOTAL_GZIP_LIMIT) {
      failures.push(`bundle: total gzip ${bundle.totalGzipBytes} bytes is not under ${TOTAL_GZIP_LIMIT} bytes`);
    }
    if (bundle.requests >= REQUEST_LIMIT) {
      failures.push(`bundle: first paint used ${bundle.requests} requests, not under ${REQUEST_LIMIT}`);
    }
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        await bridge.close();
      } finally {
        if (previewServer) await previewServer.close();
      }
    }
  }

  const date = new Date().toISOString();
  const measure = {
    date,
    userAgent,
    bundle,
    fps,
    states: results.map(result => ({
      name: result.name,
      ok: result.ok,
      screenshot: result.screenshot,
      ...(result.skipped ? {skipped: result.skipped} : {}),
      ...(result.failures.length ? {failures: result.failures} : {}),
    })),
    failures,
  };
  // A filtered run (--only) must not replace the full report.
  if (!options.only) await writeFile(path.join(DOCS, 'measure.json'), asciiJson(measure), 'utf8');

  const fpsEntries = Object.entries(fps);
  const fpsSummary = fpsEntries.length
    ? fpsEntries.map(([name, value]) => `${name}: ${value.min}/${value.median} fps min/median`).join('; ')
    : 'No scene frame-rate samples in this filtered run.';
  const rows = results.map(result => {
    const status = result.skipped ? `Skipped: ${result.skipped}` : result.ok ? 'OK' : `FAIL: ${result.failures.join('; ')}`;
    return `| ${markdownText(result.name)} | ${markdownText(status)} | ![${markdownText(result.name)}](${result.screenshot}) |`;
  });
  const readme = [
    '# Glasses state check',
    '',
    `Date: ${markdownText(date)}`,
    '',
    `Bundle: ${bundle.totalGzipBytes} bytes gzip (${bundle.jsGzipBytes} JS + ${bundle.cssGzipBytes} CSS); ${bundle.requests} first-paint requests.`,
    '',
    `Frame rates: ${markdownText(fpsSummary)}`,
    '',
    '| State | Result | Screenshot |',
    '|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  if (!options.only) await writeFile(path.join(DOCS, 'README.md'), readme, 'utf8');

  const passed = results.filter(result => result.ok).length;
  const skipped = results.filter(result => result.skipped).length;
  console.log(`FINAL: ${passed}/${results.length} states passed, ${skipped} skipped, ${failures.length} failures; bundle ${bundle.totalGzipBytes} bytes gzip, ${bundle.requests} requests`);
  if (failures.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
