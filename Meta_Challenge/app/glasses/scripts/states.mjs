import {createRequire} from 'node:module';
import {mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import process from 'node:process';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {build as viteBuild, preview as vitePreview} from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_ROOT = path.resolve(ROOT, '..');
const BRIDGE_ROOT = path.join(APP_ROOT, 'bridge');
const OBJECTS_FILE = path.join(APP_ROOT, 'shared', 'objects.json');
const DIST = path.join(ROOT, 'node_modules', '.states-dist');
const DOCS = path.join(ROOT, 'docs');
const SCREENSHOTS = path.join(DOCS, 'states');
const CONFIG = path.join(ROOT, 'vite.config.ts');
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
  for (const [name, launchOptions] of attempts) {
    try {
      return await chromium.launch({headless: !headed, ...launchOptions});
    } catch (error) {
      errors.push(`${name}: ${errorMessage(error).split('\n')[0]}`);
    }
  }
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
  }

  async start() {
    this.server = new WebSocketServer({port: 0, path: '/ws'});
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
        const frame = {socket, message};
        this.frames.push(frame);
        for (const waiter of [...this.waiters]) {
          if (waiter.predicate(frame)) waiter.resolve(frame);
        }
        if (message.type === 'hello' && this.closeNextHello !== null) {
          const code = this.closeNextHello;
          this.closeNextHello = null;
          socket.close(code);
        }
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once('listening', resolve);
      this.server.once('error', reject);
    });
    const address = this.server.address();
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
    'device-camera-denied', 'device-doffed', 'device-donned', 'clear', 'replay', 'heartbeat', 'token',
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

  const openPage = async ({offline = false, token = null, closeOnHello = null} = {}) => {
    if (closeOnHello !== null) bridge.closeNextHello = closeOnHello;
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
    const query = new URLSearchParams({bridge: `ws://localhost:${wsPort}/ws`});
    if (token !== null) query.set('k', token);
    await page.goto(`http://localhost:${previewPort}/?${query}`, {waitUntil: 'networkidle'});
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
      await action({...session, check, expectText, result});
    } catch (error) {
      addFailure(result, errorMessage(error));
    } finally {
      if (session?.page) {
        try {
          const offenders = await fontOffenders(session.page);
          if (offenders.length) {
            addFailure(result, `visible text under 16 px: ${offenders.map(item => `"${short(item.text, 60)}" (${item.size}px)`).join(', ')}`);
          }
        } catch (error) {
          addFailure(result, `text-size check failed: ${errorMessage(error)}`);
        }
        if (session.consoleErrors.length) addFailure(result, `console errors: ${session.consoleErrors.map(error => short(error, 160)).join(' | ')}`);
        try {
          await session.page.screenshot({path: path.join(SCREENSHOTS, filename)});
        } catch (error) {
          addFailure(result, `screenshot failed: ${errorMessage(error)}`);
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
      const buttons = await session.page.getByRole('button').count();
      session.check(buttons === 6, `expected 6 object buttons, found ${buttons}; text "${await visibleText(session.page)}"`);
    });

    await simple('home-offline', {offline: true}, async session => {
      await session.expectText('Bridge offline (demo)', {exact: true});
      const buttons = await session.page.getByRole('button').count();
      session.check(buttons === 6, `expected 6 working object buttons, found ${buttons}`);
      if (buttons) {
        await session.page.getByRole('button').first().click();
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
      send(session, {type: 'detecting', reqId: 'slow-1', timeoutMs: 700});
      await session.expectText('Took too long', {exact: true});
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
      send(session, {type: 'show', reqId: 'replay-1', objectId: 'guitar', label: 'Guitar string', replay: true});
      await session.page.locator('.ex-canvas').waitFor({state: 'visible', timeout: WAIT_MS});
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

    const selectedObjects = options.only && objectIds.has(options.only)
      ? objects.filter(object => object.id === options.only)
      : objects;

    for (const object of selectedObjects) {
      if (options.only && simpleNames.includes(options.only)) break;
      let session;
      try {
        session = await openPage();
        const sceneFrameStart = bridge.frames.length;
        bridge.send(session.socket, {type: 'show', reqId: `scene-${object.id}`, objectId: object.id, label: object.label});
        let knobChecked = false;
        let consoleCursor = 0;

        for (let lensIndex = 0; lensIndex < object.chapters.length; lensIndex++) {
          const chapter = object.chapters[lensIndex];
          const lensKey = `${object.id}.${chapter.lens}`;
          const samples = [];
          const lensResults = [];

          for (let stepIndex = 0; stepIndex < chapter.captions.length; stepIndex++) {
            const name = `scene-${object.id}-${chapter.lens}-s${stepIndex + 1}`;
            if (options.only && isSceneName(options.only) && options.only !== name) {
              if (stepIndex + 1 < chapter.captions.length) await session.page.keyboard.press('Enter');
              continue;
            }
            const filename = `${name}.png`;
            const result = {name, ok: false, screenshot: `states/${filename}`, failures: []};
            lensResults.push(result);
            const consoleStart = consoleCursor;
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

              const canvasCount = await session.page.locator('.ex-canvas').count();
              if (!canvasCount && chapter.lens === 'whatif') {
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
                await session.page.waitForTimeout(1200);
                const sample = await session.page.evaluate(() => window.__glassesFps);
                if (typeof sample === 'number' && Number.isFinite(sample)) samples.push(sample);
                else addFailure(result, `window.__glassesFps was ${JSON.stringify(sample)} after 1.2 s`);

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
              const newConsoleErrors = session.consoleErrors.slice(consoleStart);
              consoleCursor = session.consoleErrors.length;
              if (newConsoleErrors.length) addFailure(result, `console errors: ${newConsoleErrors.map(error => short(error, 160)).join(' | ')}`);
              await session.page.screenshot({path: path.join(SCREENSHOTS, filename)});
            } catch (error) {
              addFailure(result, errorMessage(error));
              await session.page.screenshot({path: path.join(SCREENSHOTS, filename)}).catch(screenshotError => {
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
          if (lensIndex + 1 < object.chapters.length) await session.page.keyboard.press('ArrowRight');
        }

        if (!knobChecked && (!options.only || objectIds.has(options.only))) {
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
