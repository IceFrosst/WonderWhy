import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const port = process.env.LENS_TEST_PORT ?? '8992';
const base = `http://127.0.0.1:${port}`;
const bridge = fileURLToPath(new URL('../../bridge/server.js', import.meta.url));
const proc = spawn(process.execPath,[bridge],{env:{...process.env,PORT:port,DETECT_PROVIDER:'mock',LATENCY_LOG:'/tmp/lens-sim-latency.jsonl'},stdio:'ignore'});
let browser;
try {
  for (let i=0;i<30;i++) {
    if (await fetch(base+'/health').then(r=>r.ok,()=>false)) break;
    await new Promise(r=>setTimeout(r,100));
  }
  browser = await chromium.launch({channel:'chrome',args:['--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const page = await browser.newPage({viewport:{width:600,height:780},permissions:['camera']});
  await page.route('**/detect', async route => {
    const input = route.request().postDataJSON();
    await route.continue({postData: JSON.stringify({...input, forceObjectId:'kettle'})});
  });
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(base+'/emulator');
  await page.getByRole('button',{name:'Start camera'}).click();
  const hud = page.frameLocator('#hud');
  await hud.getByRole('button',{name:'Take photo',exact:true}).waitFor();
  await hud.getByRole('button',{name:'Take photo',exact:true}).focus();
  await page.waitForFunction(() => document.querySelector("#cam").videoWidth > 0);
  await page.mouse.click(260,310);
  await page.waitForFunction(() => /Capture to response \d+ ms/.test(document.querySelector('#timing').textContent));
  await page.waitForFunction(() => /Capture to preview \d+ ms/.test(document.querySelector('#timing').textContent));
  await page.waitForFunction(() => /Capture to motion \d+ ms/.test(document.querySelector('#timing').textContent));
  await hud.locator('.xp-stage video.is-on').waitFor();
  await hud.locator('.xp-stage').focus();
  const drag = async (dx,dy) => {
    await page.mouse.move(260,310);
    await page.mouse.down();
    await page.mouse.move(260+dx,310+dy,{steps:6});
    await page.mouse.up();
  };
  await drag(0,60);
  await drag(60,0);
  await page.mouse.click(260,310);
  const inspect = hud.getByRole('region',{name:'Inspect the kettle'});
  await inspect.and(hud.locator('[data-inspect-ms]')).waitFor();
  assert.equal(await inspect.locator('p').count(), 0);
  assert.equal(await inspect.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  const canvas = inspect.locator('canvas[data-renderer="three"]');
  await canvas.waitFor();
  assert.equal(await canvas.evaluate(el => !!el.getContext('webgl2')), true);
  const beforeTurn = await canvas.screenshot();
  await drag(75,0);
  await inspect.evaluate(el=>new Promise((resolve,reject)=>{
    const expires=performance.now()+3000;
    const check=()=>{
      if(Number(el.dataset.angle)>20) return resolve();
      if(performance.now()>expires) return reject(Error('Simulator drag did not move the turntable'));
      requestAnimationFrame(check);
    };
    check();
  }));
  assert.notDeepEqual(await canvas.screenshot(), beforeTurn);
  const beforeTilt = await canvas.screenshot();
  await drag(0,45);
  assert.notDeepEqual(await canvas.screenshot(), beforeTilt);
  const beforeExplode = await canvas.screenshot();
  await page.mouse.click(260,310);
  await inspect.getByRole('heading',{name:'Inside the kettle'}).waitFor();
  await page.waitForTimeout(450);
  assert.notDeepEqual(await canvas.screenshot(), beforeExplode);
  const frame = page.frames().find(frame => frame.parentFrame());
  await frame.evaluate(() => document.querySelector('canvas[data-renderer="three"]').dispatchEvent(new Event('webglcontextlost', {cancelable:true})));
  await inspect.locator('canvas[data-renderer="atlas"]').waitFor();
  console.log('Live Three.js used WebGL2. Pixels changed for yaw, vertical tilt, and explode. Context loss switched to turntable.');
  await page.mouse.click(260,310,{delay:650});
  await hud.getByRole('region',{name:'Inspect the kettle'}).waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  await hud.locator('.xp-stage').focus();
  await drag(60,0);
  await hud.locator('.xp-inspect canvas[data-renderer="three"]').waitFor();
  await hud.locator('.xp-inspect[data-inspect-ms]').waitFor();
  await inspect.focus();
  await page.keyboard.press('ArrowUp');
  const back = hud.getByRole('button',{name:'Back to film'});
  assert.ok(await back.evaluate(el => el.ownerDocument.activeElement === el));
  await page.keyboard.press('Enter');
  await inspect.waitFor({state:'hidden'});
  console.log('Verified the right-swipe shortcut, Inspect timing, and Up then pinch to return to film.');
  console.log(await page.locator('#timing').textContent());
  console.log('Simulator passed: swipe to controls, pinch to Inspect, drag distance changes angle, pinch explodes, long-press Back returns to clip.');

  const nav = await browser.newPage({viewport: {width: 600, height: 600}});
  await nav.routeWebSocket('**/ws', socket => {
    socket.onMessage(message => {
      if (JSON.parse(String(message)).type === 'hello') socket.send(JSON.stringify({type: 'ready'}));
    });
  });
  const url = base + '/?bridge=' + encodeURIComponent(base.replace('http:', 'ws:') + '/ws');
  const goHome = async () => {
    const home = nav.getByRole('button', {name: 'Home', exact: true});
    await nav.keyboard.press('ArrowRight');
    assert.ok(await home.evaluate(button => button === button.ownerDocument.activeElement));
    await nav.keyboard.press('Enter');
    await nav.getByRole('button', {name: /guitar/i}).waitFor();
  };
  await nav.goto(url);
  for (const object of [/guitar/i, /phone/i]) {
    await nav.getByRole('button', {name: object}).click();
    await nav.locator('.xp-stage:focus').waitFor();
    await goHome();
  }
  await nav.route('**/media/guitar/manifest.json', route => route.fulfill({status: 404, body: ''}));
  await nav.reload();
  await nav.getByRole('button', {name: /guitar/i}).click();
  await nav.locator('.ex-dock [role="button"]:focus', {hasText: /Next step/}).waitFor();
  await nav.keyboard.press('Enter');
  await nav.getByText(/^Step 2\//).waitFor();
  await goHome();
  console.log('Right then pinch returns to Home from Guitar and Phone films and from Guitar cards after advancing a step.');
} finally {await browser?.close();proc.kill();}
