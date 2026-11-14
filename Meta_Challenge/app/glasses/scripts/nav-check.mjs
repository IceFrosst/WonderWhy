// Navigation check of the one 3D screen against a running bridge (it serves glasses/dist).
// Usage: [NAV_GPU=1] node scripts/nav-check.mjs [screenshotDir] [--only kettle,phone] [--quick]
// Needs: npm run build, a bridge on BRIDGE (default http://localhost:8788) with mock detection, and Chrome.
import {readFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.resolve(ROOT, '..');
const args = process.argv.slice(2);
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null;
const out = args.find((arg, index) => !arg.startsWith('--') && (onlyAt < 0 || index !== onlyAt + 1)) ?? path.join(ROOT, 'node_modules', '.nav-check');
mkdirSync(out, {recursive: true});
const BASE = process.env.BRIDGE ?? 'http://localhost:8788';
const TOKEN = process.env.BRIDGE_TOKEN ?? 'local-dev-only-not-a-secret';
const SHOTS = new Set(['kettle', 'phone']);

const library = JSON.parse(readFileSync(path.join(APP, 'shared', 'objects.json'), 'utf8')).objects;
const films = library.filter(object => {
  const chapter = object.chapters.find(item => item.scene === 'model3d' || item.lens === 'explore');
  // A live explanation needs a spec, including objects with no exported video manifest.
  return Boolean(chapter?.spec?.parts?.length && chapter?.spec?.beats?.length);
});

const results = [];
const timings = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  :: ${detail}` : ''}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run(name, f) {
  try {
    await f();
  } catch (error) {
    results.push(`FAIL  ${name}: ${String(error.message).split('\n')[0]}`);
  }
}

// NAV_GPU=1 uses the machine's GPU (Vulkan) instead of software GL: closer to real frame rates.
const GL = process.env.NAV_GPU === '1'
  ? ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', ...GL]});
async function open() {
  const ctx = await browser.newContext({viewport: {width: 600, height: 600}});
  await ctx.addInitScript(() => localStorage.setItem('lens.consent', '2026-11-14'));
  const page = await ctx.newPage();
  page.on('pageerror', error => results.push(`FAIL  page error: ${error.message}`));
  await page.goto(`${BASE}/?all=1&bridge=ws://${new URL(BASE).host}/ws#k=${TOKEN}`);
  await page.waitForTimeout(2000);
  for (let i = 0; i < 4 && !(await page.getByText('Bridge connected').isVisible().catch(() => false)); i++) {
    await page.keyboard.press('Escape'); // a replayed result (bridge /last) may open first
    await page.waitForTimeout(700);
  }
  await page.getByText('Bridge connected').waitFor({timeout: 5000});
  return {ctx, page};
}
const text = page => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160));
const isHome = async page => /Look at something/.test(await text(page));
const focusName = page => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return '(none)';
  if (el.classList.contains('xp-stage')) return '(picture)';
  return (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40);
});
const screen = page => page.evaluate(() => {
  const root = document.querySelector('.xp');
  const beats = root?.querySelector('.xp-beats')?.getAttribute('aria-label') ?? '';
  const match = /Beat (\d+) of (\d+)/.exec(beats);
  return {
    xp: Boolean(root),
    twoD: Boolean(document.querySelector('.ex')),
    state: root?.dataset.state ?? null,
    beat: match ? Number(match[1]) : 0,
    beats: match ? Number(match[2]) : 0,
    name: root?.querySelector('.xp-name')?.textContent?.trim() ?? '',
    caption: (root?.querySelector('.xp-caption, .xp-hint')?.textContent ?? '').trim(),
    buttons: Array.from(root?.querySelectorAll('.xp-actions button') ?? []).map(button => button.textContent.trim()),
    homeRight: (() => {
      const home = root?.querySelector('.xp-actions .xp-home');
      const row = root?.querySelector('.xp-actions');
      if (!home || !row) return false;
      return Math.abs(home.getBoundingClientRect().right - row.getBoundingClientRect().right) < 1.5;
    })(),
    rowFits: (() => {
      const row = root?.querySelector('.xp-actions');
      return row ? row.scrollWidth <= row.clientWidth + 1 && row.getBoundingClientRect().right <= 600 : false;
    })(),
  };
});
const turnInfo = page => page.evaluate(() => {
  const layer = document.querySelector('.xp-inspect');
  const canvas = layer?.querySelector('canvas');
  return {
    present: Boolean(layer),
    renderer: canvas?.dataset.renderer ?? null,
    live: Boolean(layer?.classList.contains('xp-turn--live')),
    fallback: Boolean(layer?.querySelector('.xp-turn-still')) && /3D view unavailable/.test(layer?.textContent ?? ''),
    yaw: Number(layer?.dataset.yaw ?? NaN),
    pitch: Number(layer?.dataset.pitch ?? NaN),
    open: Number(layer?.dataset.open ?? NaN),
    ms: Number(layer?.dataset.turnMs ?? NaN),
    moving: layer?.dataset.moving ?? null,
    frames: Number(layer?.dataset.frames ?? NaN),
    glideMs: Number(layer?.dataset.glideMs ?? NaN),
  };
});
async function waitFor(page, predicate, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await sleep(120);
  }
  return false;
}
async function press(page, key, wait = 250) {
  await page.keyboard.press(key);
  await page.waitForTimeout(wait);
}
const detect = body => fetch(`${BASE}/detect`, {
  method: 'POST',
  headers: {'content-type': 'application/json', 'x-lens-token': TOKEN},
  body: JSON.stringify(body),
}).then(response => response.status);

// ---- every film object
for (const object of films) {
  if (only && !only.has(object.id)) continue;
  const id = object.id;
  await run(id, async () => {
    const {ctx, page} = await open();
    await page.getByRole('button', {name: object.label, exact: true}).click();
    const opened = await waitFor(page, async () => (await screen(page)).state === 'film', 8000);
    check(`${id}: opens on the film`, opened, JSON.stringify(await screen(page)));
    await page.waitForTimeout(1500);
    let s = await screen(page);
    check(`${id}: film buttons Pause, Turn it, ..., Home last on the right`,
      s.buttons[0] === 'Pause' && s.buttons[1] === 'Turn it' && s.buttons.at(-1) === 'Home' && s.homeRight && s.rowFits,
      JSON.stringify(s));
    check(`${id}: film focus starts on the picture`, (await focusName(page)) === '(picture)', await focusName(page));
    check(`${id}: top line is the short name`, s.name === (object.short ?? object.label), s.name);
    if (SHOTS.has(id)) await page.screenshot({path: `${out}/${id}-1-film.png`});

    // Left/Right step beats, no wrap.
    await press(page, 'ArrowLeft');
    check(`${id}: Left on beat 1 stays on beat 1`, (await screen(page)).beat === 1);
    await press(page, 'ArrowRight', 400);
    check(`${id}: Right goes to beat 2`, (await screen(page)).beat === 2, JSON.stringify(await screen(page)));
    await press(page, 'ArrowLeft', 400);
    check(`${id}: Left goes back to beat 1`, (await screen(page)).beat === 1);
    await press(page, 'ArrowRight', 400);

    // Down to the row, Right to Home (last), Up back to the picture.
    await press(page, 'ArrowDown');
    check(`${id}: Down focuses the first button`, (await focusName(page)) === 'Pause', await focusName(page));
    for (let i = 0; i < 5; i++) await press(page, 'ArrowRight', 80);
    check(`${id}: Right along the row ends on Home`, (await focusName(page)) === 'Home', await focusName(page));
    await press(page, 'ArrowUp');
    check(`${id}: Up returns to the picture`, (await focusName(page)) === '(picture)', await focusName(page));
    check(`${id}: row keys did not change the beat`, (await screen(page)).beat === 2, JSON.stringify(await screen(page)));

    // Turn it from the row: Down, Right, pinch.
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    check(`${id}: Down, Right reaches Turn it`, (await focusName(page)) === 'Turn it', await focusName(page));
    await press(page, 'Enter', 300);
    s = await screen(page);
    check(`${id}: Turn it opens on the same frame`, s.state === 'turn' && s.beat === 2 && /Turn it$/.test(s.name), JSON.stringify(s));
    // A model with no explode offsets (a spoon) has nothing to open.
    const canOpen = (object.chapters.find(item => item.scene === 'model3d')?.spec.parts ?? [])
      .some(part => Array.isArray(part.explode) && part.explode.some(value => Math.abs(value) > 1e-6));
    check(`${id}: Turn it has no button row`, s.buttons.length === 0 && await page.locator('.xp-actions').count() === 0, s.buttons.join('|'));
    check(`${id}: Turn it hint`, s.caption === 'Swipe: turn · Pinch: open up · Back: return', s.caption);
    check(`${id}: Turn it focuses the picture`, (await focusName(page)) === '(picture)', await focusName(page));
    const ready = await waitFor(page, async () => {
      const t = await turnInfo(page);
      return (t.live && t.renderer === 'three') || t.fallback;
    }, 10000);
    let t = await turnInfo(page);
    check(`${id}: live model shows (three) or the fallback still`, ready, JSON.stringify(t));
    if (Number.isFinite(t.ms)) timings.push(`${id}: Turn it showed the model ${t.ms} ms after opening`);
    check(`${id}: live 3D (not the fallback)`, t.live && t.renderer === 'three', JSON.stringify(t));
    if (SHOTS.has(id)) await page.screenshot({path: `${out}/${id}-2-turn-closed.png`});

    // In Turn it: Left/Right turn, Up/Down tilt, pinch opens and closes.
    // Spin with inertia: one swipe keeps turning after the key, glides about 30-40 degrees, then stops.
    const settle = async () => {
      await waitFor(page, async () => (await turnInfo(page)).moving === '0', 4000);
      return (await turnInfo(page)).yaw;
    };
    const yaw0 = await settle();
    const t0 = Date.now();
    await page.keyboard.press('ArrowRight');
    const seen = new Set();
    let lastChange = 0;
    let yawNow = yaw0;
    while (Date.now() - t0 < 4500) {
      const info = await turnInfo(page);
      if (info.yaw !== yawNow) {
        yawNow = info.yaw;
        seen.add(info.yaw);
        lastChange = Date.now() - t0;
      }
      if (info.moving === '0' && Date.now() - t0 > 200) break;
      await sleep(40);
    }
    const yaw1 = await settle();
    const framesAt = (await turnInfo(page)).frames;
    await page.waitForTimeout(500);
    const after = await turnInfo(page);
    // glideMs: the page's own time from the swipe to the frame where the spin stopped.
    check(`${id}: one swipe spins on after the key, then stops`,
      seen.size >= 3 && after.glideMs > 600 && after.glideMs < (process.env.NAV_GPU === '1' ? 1800 : 3000) && after.yaw === yaw1,
      `${yaw0} -> ${yaw1} through ${seen.size} angles, stopped ${after.glideMs} ms after the swipe (seen ${lastChange} ms), then ${after.yaw}`);
    check(`${id}: the render loop stops when the spin settles`, after.frames === framesAt, `${framesAt} -> ${after.frames} frames`);
    const glideMs = after.glideMs;
    check(`${id}: Right turns the model about 30-40 degrees`, yaw1 - yaw0 <= -28 && yaw1 - yaw0 >= -44, `${yaw0} -> ${yaw1}`);
    if (id === 'kettle') timings.push(`Spin: one swipe = ${yaw0 - yaw1} degrees, settled ${glideMs} ms after the key`);
    await page.keyboard.press('ArrowLeft');
    const yaw2 = await settle();
    check(`${id}: Left turns it back`, Math.abs(yaw2 - yaw0) <= 2, `${yaw0} -> ${yaw2}`);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.press('ArrowRight');
    const fast = yaw2 - (await settle());
    check(`${id}: 3 quick swipes add up to about a full turn`, fast > 250 && fast < 450, `${fast} degrees for three quick swipes`);
    if (id === 'kettle') timings.push(`Spin: three quick swipes = ${fast} degrees`);
    check(`${id}: swipes in Turn it keep the beat`, (await screen(page)).beat === 2);
    const pitch0 = (await turnInfo(page)).pitch;
    await press(page, 'ArrowUp', 100);
    const pitchEarly = (await turnInfo(page)).pitch;
    await settle();
    const pitchUp = (await turnInfo(page)).pitch;
    check(`${id}: Up tilts with momentum`, pitchUp < pitchEarly && pitchUp < pitch0 && pitchUp >= -60,
      `${pitch0} -> ${pitchEarly} -> ${pitchUp}`);
    await page.keyboard.press('ArrowDown');
    await settle();
    check(`${id}: Down tilts back`, Math.abs((await turnInfo(page)).pitch - pitch0) <= 2, JSON.stringify(await turnInfo(page)));
    for (let i = 0; i < 4; i++) await press(page, 'ArrowUp', 80);
    await settle();
    check(`${id}: upward tilt clamps at -60 degrees`, (await turnInfo(page)).pitch === -60, JSON.stringify(await turnInfo(page)));
    for (let i = 0; i < 4; i++) await press(page, 'ArrowDown', 80);
    await settle();
    check(`${id}: downward tilt clamps at 60 degrees`, (await turnInfo(page)).pitch === 60, JSON.stringify(await turnInfo(page)));
    await page.keyboard.press('Enter');
    await waitFor(page, async () => (await turnInfo(page)).open === (canOpen ? 1 : 0), 3000);
    await page.waitForTimeout(200);
    t = await turnInfo(page);
    s = await screen(page);
    if (canOpen) {
      check(`${id}: pinch opens it up`, t.open === 1 && s.buttons.length === 0 && s.caption === 'Swipe: turn · Pinch: close up · Back: return',
        `${JSON.stringify(t)} ${s.buttons.join('|')} ${s.caption}`);
    } else check(`${id}: pinch does nothing on a model that cannot open`, t.open === 0 && s.state === 'turn', JSON.stringify(t));
    if (SHOTS.has(id)) await page.screenshot({path: `${out}/${id}-3-turn-open.png`});
    // Pointer drag (the simulator forwards its pad as pointer events on .xp-inspect canvas).
    const yawBefore = t.yaw;
    await page.evaluate(() => {
      const canvas = document.querySelector('.xp-inspect canvas');
      const r = canvas.getBoundingClientRect();
      const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {pointerId: 7, pointerType: 'touch', button: 0, bubbles: true, clientX: r.left + x, clientY: r.top + y}));
      fire('pointerdown', 300, 300);
      for (let i = 1; i <= 10; i++) fire('pointermove', 300 + i * 6, 300 - i * 2);
      fire('pointerup', 360, 280);
    });
    await page.waitForTimeout(400);
    t = await turnInfo(page);
    check(`${id}: pointer drag turns and tilts the model`, Math.abs(t.yaw - yawBefore) > 20 && t.pitch !== 0, JSON.stringify(t));
    // A drag that is still moving when it lets go keeps that speed and glides.
    const atRelease = await page.evaluate(async () => {
      const canvas = document.querySelector('.xp-inspect canvas');
      const layer = document.querySelector('.xp-inspect');
      const r = canvas.getBoundingClientRect();
      const fire = (type, x) => canvas.dispatchEvent(new PointerEvent(type, {pointerId: 8, pointerType: 'touch', button: 0, bubbles: true, clientX: r.left + x, clientY: r.top + 300}));
      fire('pointerdown', 200);
      for (let i = 1; i <= 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 16));
        fire('pointermove', 200 + i * 8);
      }
      fire('pointerup', 280);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return Number(layer.dataset.yaw);
    });
    await waitFor(page, async () => (await turnInfo(page)).moving === '0', 4000);
    const glided = (await turnInfo(page)).yaw - atRelease;
    check(`${id}: a moving drag keeps its speed after release`, glided < -10, `${glided} degrees after release`);
    if (canOpen) {
      check(`${id}: the drag's click did not close it`, t.open === 1, JSON.stringify(t));
      await page.keyboard.press('Enter');
      await waitFor(page, async () => (await turnInfo(page)).open === 0, 3000);
      check(`${id}: pinch closes it`, (await turnInfo(page)).open === 0 && (await screen(page)).caption === 'Swipe: turn · Pinch: open up · Back: return');
      // The simulator may send both a key and a picture click for one pinch.
      await page.keyboard.press('Enter');
      await page.locator('.xp-stage').dispatchEvent('click');
      await waitFor(page, async () => (await turnInfo(page)).open === 1, 3000);
      await page.waitForTimeout(300);
      check(`${id}: pinch with a simulator click opens once`, (await turnInfo(page)).open === 1, JSON.stringify(await turnInfo(page)));
    }
    await press(page, 'Escape', 500);
    s = await screen(page);
    check(`${id}: Back from Turn it returns to the film, same beat`, s.state === 'film' && s.beat === 2 && !(await turnInfo(page)).present,
      JSON.stringify(s));

    // Pinch through every beat to the end: never a 2D lens.
    let twoD = false;
    for (let i = 0; i < s.beats + 1 && (await screen(page)).state !== 'end'; i++) {
      await press(page, 'Enter', 500);
      const now = await screen(page);
      if (now.twoD || !now.xp) twoD = true;
    }
    s = await screen(page);
    check(`${id}: pinch reaches the last beat, no 2D lens on the way`, !twoD && s.state === 'end' && s.beat === s.beats, JSON.stringify(s));
    await page.waitForTimeout(300);
    check(`${id}: end buttons New photo, Watch again, Turn it, Home`,
      s.buttons.join('|') === 'New photo|Watch again|Turn it|Home' && s.homeRight && s.rowFits, s.buttons.join('|'));
    check(`${id}: end focuses New photo`, (await focusName(page)) === 'New photo', await focusName(page));
    if (SHOTS.has(id)) await page.screenshot({path: `${out}/${id}-4-end.png`});
    await press(page, 'ArrowUp');
    check(`${id}: end Up keeps focus on New photo`, (await focusName(page)) === 'New photo', await focusName(page));
    await press(page, 'ArrowRight');
    check(`${id}: end Right focuses Watch again without changing the beat`, (await focusName(page)) === 'Watch again' && (await screen(page)).state === 'end' && !(await screen(page)).twoD);
    await press(page, 'ArrowRight');
    await press(page, 'Enter');
    check(`${id}: end Turn it opens at the last beat`, (await screen(page)).state === 'turn' && (await screen(page)).beat === s.beats);
    await press(page, 'Escape', 500);
    check(`${id}: Escape from end Turn it returns to the end row`, (await screen(page)).state === 'end' && (await screen(page)).beat === s.beats && (await focusName(page)) === 'New photo', JSON.stringify(await screen(page)));
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    await press(page, 'Enter', 900);
    s = await screen(page);
    check(`${id}: Watch again goes to beat 1`, s.state === 'film' && s.beat === 1, JSON.stringify(s));
    await press(page, 'Escape', 600);
    check(`${id}: Back from the film goes home`, await isHome(page), await text(page));
    await ctx.close();
  });
}

// ---- New photo from the end of a film, and the Turn it fallback still
await run('new-photo', async () => {
  const {ctx, page} = await open();
  await page.getByRole('button', {name: 'Boiling kettle', exact: true}).click();
  await waitFor(page, async () => (await screen(page)).state === 'film', 8000);
  for (let i = 0; i < 6; i++) await press(page, 'ArrowRight', 150);
  await page.waitForTimeout(300);
  await press(page, 'ArrowUp');
  check('End: Up keeps the button row focused', (await focusName(page)) === 'New photo', await focusName(page));
  await page.locator('.xp-stage').dispatchEvent('click');
  check('End: the picture is not a pinch target', (await screen(page)).state === 'end' && (await focusName(page)) === 'New photo', await text(page));
  await press(page, 'Enter', 600);
  check('End: pinch on focused New photo takes a new photo', /Taking the photo/.test(await text(page)), await text(page));
  await page.waitForTimeout(1300);
  await press(page, 'Enter', 500);
  check('End: Cancel after New photo goes home', await isHome(page), await text(page));
  await ctx.close();
});

await run('fallback', async () => {
  const ctx = await browser.newContext({viewport: {width: 600, height: 600}});
  await ctx.addInitScript(() => localStorage.setItem('lens.consent', '2026-11-14'));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?all=1&live3d=0&bridge=ws://${new URL(BASE).host}/ws#k=${TOKEN}`);
  await page.waitForTimeout(2000);
  for (let i = 0; i < 4 && !(await isHome(page)); i++) await press(page, 'Escape', 700);
  await page.getByRole('button', {name: 'Boiling kettle', exact: true}).click();
  await waitFor(page, async () => (await screen(page)).state === 'film', 8000);
  await page.waitForTimeout(800);
  await page.getByRole('button', {name: 'Turn it', exact: true}).click();
  const shown = await waitFor(page, async () => (await turnInfo(page)).fallback, 4000);
  check('Turn it without WebGL shows the clean still and "3D view unavailable"', shown, JSON.stringify(await turnInfo(page)));
  const lit = await waitFor(page, () => page.evaluate(() => {
    const img = document.querySelector('.xp-turn-still');
    return Boolean(img && img.complete && img.naturalWidth > 0 && /\/c\d\.png$/.test(img.src));
  }), 3000);
  check('Fallback still is the beat\'s c<n>.png', lit, await page.evaluate(() => document.querySelector('.xp-turn-still')?.src ?? 'none'));
  const row = (await screen(page)).buttons.join('|');
  check('Fallback has no button row', row === '' && await page.locator('.xp-actions').count() === 0, row);
  const fallbackBeat = (await screen(page)).beat;
  await press(page, 'Escape', 500);
  check('Fallback: Escape returns to the same beat', (await screen(page)).state === 'film' && (await screen(page)).beat === fallbackBeat, JSON.stringify(await screen(page)));
  await page.getByRole('button', {name: 'Turn it', exact: true}).click();
  await page.screenshot({path: `${out}/kettle-5-turn-fallback.png`});
  await ctx.close();
});

// ---- Ask: D-pad, Back, and the Ask flow lands on the film
await run('ask', async () => {
  const {ctx, page} = await open();
  await page.getByRole('button', {name: 'Ask', exact: true}).click();
  await page.waitForTimeout(500);
  await press(page, 'ArrowRight', 100);
  check('Ask: Right focuses Back', (await focusName(page)) === 'Back', await focusName(page));
  await press(page, 'ArrowLeft', 100);
  check('Ask: Left moves to Show visual', (await focusName(page)) === 'Show visual', await focusName(page));
  await press(page, 'ArrowUp', 100);
  await press(page, 'ArrowDown', 100);
  check('Ask: Up then Down returns to the buttons', (await focusName(page)) === 'Show visual', await focusName(page));
  await press(page, 'ArrowRight', 100);
  await press(page, 'Enter', 500);
  check('Ask: pinch on Back goes home', await isHome(page), await text(page));
  await page.getByRole('button', {name: 'Ask', exact: true}).click();
  await page.waitForTimeout(400);
  await page.locator('#lens-question').fill('How does a kettle work?');
  await page.getByRole('button', {name: 'Show visual'}).click();
  const film = await waitFor(page, async () => (await screen(page)).state === 'film', 8000);
  check('Ask: "kettle" lands on the kettle film', film && (await screen(page)).name === 'Kettle', JSON.stringify(await screen(page)));
  await ctx.close();
});

// ---- Take photo: Cancel exists, early pinch does not cancel, armed pinch cancels, late result ignored
await run('photo', async () => {
  const {ctx, page} = await open();
  await page.getByRole('button', {name: 'Take photo', exact: true}).click();
  await page.waitForTimeout(300);
  check('Photo: Cancel button visible', await page.getByRole('button', {name: 'Cancel'}).isVisible());
  await press(page, 'Enter', 300);
  check('Photo: a quick second pinch does not cancel', /Taking the photo/.test(await text(page)), await text(page));
  await page.waitForTimeout(1200);
  check('Photo: Cancel is focused after a moment', (await focusName(page)) === 'Cancel', await focusName(page));
  await press(page, 'Enter', 500);
  check('Photo: pinch on Cancel goes home', await isHome(page), await text(page));
  const status = await detect({forceObjectId: 'kettle', imageBase64: null});
  await page.waitForTimeout(1500);
  check('Photo: a result arriving after Cancel is ignored', await isHome(page), `detect ${status}; ${await text(page)}`);
  await ctx.close();
});

// ---- Demo: Home visible
await run('demo', async () => {
  const {ctx, page} = await open();
  await page.getByRole('button', {name: 'Demo', exact: true}).click();
  await page.waitForTimeout(3000);
  check('Demo: Home button visible', await page.getByRole('button', {name: 'Home'}).isVisible().catch(() => false), await text(page));
  check('Demo: on the film, not a 2D lens', (await screen(page)).xp && !(await screen(page)).twoD, JSON.stringify(await screen(page)));
  await ctx.close();
});

// ---- Pop-up card: "No photo arrived" has OK; pinch closes it and only it (takes about 36 s)
if (!args.includes('--quick')) await run('card', async () => {
  const {ctx, page} = await open();
  await page.getByRole('button', {name: 'Take photo', exact: true}).click();
  await page.getByText('No photo arrived').waitFor({timeout: 40000});
  check('Card: OK button visible', await page.getByRole('button', {name: 'OK'}).isVisible());
  await press(page, 'Enter', 400);
  const t = await text(page);
  check('Card: pinch closes it and stays home (no photo started)', !/No photo arrived|Taking the photo/.test(t) && /Look at something/.test(t), t);
  await ctx.close();
});

await browser.close();
const passed = results.filter(line => line.startsWith('PASS')).length;
console.log(results.join('\n'));
if (timings.length) console.log(`\n${timings.join('\n')}`);
console.log(`\n${passed}/${results.length} passed; screenshots in ${out}`);
process.exitCode = passed === results.length ? 0 : 1;
