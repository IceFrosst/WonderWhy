import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { buildAskPrompt, parseAskReply, pickStep } from '../ask.js';
import { ask, buildPrompt, detect } from '../detect.js';
import { start } from '../server.js';

const objects = [
  {
    id: 'kettle', label: 'Kettle', detect_hint: 'a kettle', answer: 'It heats water.', chapters: [
      { lens: 'motion', title: 'Hidden mechanics', lead: 'A thermostat controls the switch.', captions: [
        'Steam heats the thermostat until the switch clicks off.',
        'Cooling resets the switch for the next boil.',
      ] },
      { lens: 'flow', title: 'Water path', lead: 'Heat travels through the kettle.', captions: [
        'The heater warms water at the bottom.',
        'Warm water rises while cooler water sinks.',
        'Bubbles carry steam upward.',
      ] },
      { lens: 'number', title: 'Energy numbers', lead: 'Power sets the heating rate.', captions: [
        'A typical heater uses two kilowatts.',
      ] },
    ],
  },
  {
    id: 'tie', label: 'Tie object', detect_hint: 'a test object', answer: 'A tie fixture.', chapters: [
      { lens: 'alpha', title: 'Alpha', lead: '', captions: ['Shared force appears first.', 'Energy is stored.'] },
      { lens: 'beta', title: 'Beta', lead: '', captions: ['Shared force appears later.'] },
    ],
  },
];

test('pickStep selects expected captions, stems words, preserves ties, and returns null for no match', () => {
  const cases = [
    ['kettle', 'Why does the switch click off?', 'kettle.motion', 1],
    ['kettle', 'How do switches reset?', 'kettle.motion', 2],
    ['kettle', 'What is heating the thermostat?', 'kettle.motion', 1],
    ['kettle', 'Show the hidden mechanics', 'kettle.motion', 1],
    ['kettle', 'Why does cooler water sink?', 'kettle.flow', 2],
    ['kettle', 'Where do the bubble go?', 'kettle.flow', 3],
    ['tie', 'Where is shared force?', 'tie.alpha', 1],
    ['tie', 'How is energy stored?', 'tie.alpha', 2],
  ];
  for (const [objectId, question, lensId, step] of cases) {
    const result = pickStep(objects.find((item) => item.id === objectId), question);
    assert.equal(result.lensId, lensId, question);
    assert.equal(result.step, step, question);
  }
  assert.equal(pickStep(objects[0], 'Tell me about purple galaxies'), null);
});

test('pickStep scores translated and English captions and returns the translated caption', () => {
  const object = structuredClone(objects[0]);
  object.chapters[0].englishCaptions = object.chapters[0].captions;
  object.chapters[0].captions = ['H\u00f6yry kuumentaa termostaattia.', 'J\u00e4\u00e4htyminen palauttaa kytkimen.'];
  assert.equal(pickStep(object, 'Miksi termostaattia kuumennetaan?').caption, 'H\u00f6yry kuumentaa termostaattia.');
  assert.equal(pickStep(object, 'Why does the switch reset?').caption, 'J\u00e4\u00e4htyminen palauttaa kytkimen.');
});

test('parseAskReply handles fences, invalid hints, long answers, and garbage', () => {
  assert.deepEqual(parseAskReply('```json\n{"answer":"It clicks when hot.","lensId":"kettle.motion","step":1}\n```', objects[0]), {
    answer: 'It clicks when hot.', lensId: 'kettle.motion', step: 1,
  });
  assert.deepEqual(parseAskReply('{"answer":"Answer","lensId":"other.motion","step":1}', objects[0]), {
    answer: 'Answer', lensId: null, step: null,
  });
  assert.deepEqual(parseAskReply('{"answer":"Answer","lensId":"kettle.flow","step":99}', objects[0]), {
    answer: 'Answer', lensId: 'kettle.flow', step: null,
  });
  assert.equal(parseAskReply(JSON.stringify({ answer: 'x'.repeat(350), lensId: null, step: null }), objects[0]).answer.length, 300);
  assert.equal(parseAskReply('not json', objects[0]), null);
  assert.equal(parseAskReply('{bad json}', objects[0]), null);
});

test('buildAskPrompt lists every lens step and names the answer language', () => {
  const prompt = buildAskPrompt({ object: objects[0], question: 'Miksi?', lang: 'fi' });
  for (const chapter of objects[0].chapters) {
    chapter.captions.forEach((caption, index) => assert.match(prompt, new RegExp(`\\[kettle\\.${chapter.lens} step ${index + 1}\\]`)));
  }
  assert.match(prompt, /Finnish/);
  assert.match(prompt, /strict JSON/);
});

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-ask-i18n-'));
  writeFileSync(path.join(root, 'fi.json'), JSON.stringify({
    lang: 'fi', objects: { kettle: {
      label: 'Vedenkeitin', answer: 'Se kuumentaa vett\u00e4.', chapters: {
        motion: { title: 'Piilomekaniikka', lead: 'Termostaatti ohjaa kytkint\u00e4.', captions: ['H\u00f6yry kuumentaa termostaattia.', 'J\u00e4\u00e4htyminen palauttaa kytkimen.'] },
        flow: { title: 'Veden reitti', lead: 'L\u00e4mp\u00f6 kulkee vedenkeittimess\u00e4.', captions: ['Vastus l\u00e4mmitt\u00e4\u00e4 vett\u00e4 pohjalla.', 'L\u00e4mmin vesi nousee ja viile\u00e4 vesi laskee.', 'Kuplat kuljettavat h\u00f6yry\u00e4 yl\u00f6sp\u00e4in.'] },
        number: { title: 'Energialuvut', lead: 'Teho m\u00e4\u00e4r\u00e4\u00e4 l\u00e4mmitysnopeuden.', captions: ['Tavallinen vastus k\u00e4ytt\u00e4\u00e4 kaksi kilowattia.'] },
      },
    } },
  }));
  return root;
}

async function bridge(t, options = {}) {
  const srv = await start({ port: 0, heartbeatMs: 60000, provider: 'mock', objects, i18nRoot: fixtureRoot(), ...options });
  t.after(() => srv.close());
  return { ...srv, base: `http://localhost:${srv.port}` };
}

function socket(port, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`); const messages = [];
    ws.on('error', reject); ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', client: 'glasses', ...(token ? { token } : {}) })); resolve({ ws, messages }); });
  });
}

function nextMessage(client, predicate, timeoutMs = 1000) {
  const found = client.messages.find(predicate); if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.ws.off('message', onMessage); reject(new Error('message timeout')); }, timeoutMs);
    const onMessage = (data) => {
      const message = JSON.parse(data.toString());
      if (predicate(message)) { clearTimeout(timeout); client.ws.off('message', onMessage); resolve(message); }
    };
    client.ws.on('message', onMessage);
  });
}

function post(base, body, token) {
  return fetch(base + '/ask', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-lens-token': token } : {}) }, body: JSON.stringify(body),
  });
}

test('/ask in mock mode broadcasts detecting then show and is remembered', async (t) => {
  const app = await bridge(t); const glasses = await socket(app.port);
  const response = await post(app.base, { reqId: 'ask-one', question: 'Why does the switch click off?', aboutObjectId: 'kettle' });
  assert.equal(response.status, 200);
  const show = await response.json();
  assert.equal(show.question, 'Why does the switch click off?');
  assert.equal(show.answer, objects[0].chapters[0].captions[0]);
  assert.deepEqual(show.lensHint, { id: 'kettle.motion', step: 1 });
  await nextMessage(glasses, (message) => message.type === 'show' && message.reqId === 'ask-one');
  const relevant = glasses.messages.filter((message) => message.reqId === 'ask-one').map((message) => message.type);
  assert.deepEqual(relevant, ['detecting', 'show']);
  const last = await (await fetch(app.base + '/last')).json();
  assert.equal(last.show.reqId, 'ask-one'); assert.deepEqual(last.show.lensHint, show.lensHint);
  glasses.ws.close();
});

test('/ask validates questions and library object ids', async (t) => {
  const { base } = await bridge(t);
  for (const body of [
    { aboutObjectId: 'kettle' },
    { question: ' ', aboutObjectId: 'kettle' },
    { question: 'x'.repeat(301), aboutObjectId: 'kettle' },
    { question: 'Why?', aboutObjectId: 'missing' },
    { question: 'Why?', aboutObjectId: 'unknown' },
  ]) {
    const response = await post(base, body);
    assert.equal(response.status, 400);
    const error = await response.json();
    assert.equal(error.error, 'bad_request'); assert.equal(typeof error.message, 'string'); assert.match(error.reqId, /^[\w-]{1,64}$/);
  }
});

test('/ask authentication matches /detect', async (t) => {
  const { base } = await bridge(t, { token: 'right' });
  assert.equal((await post(base, { question: 'Why?', aboutObjectId: 'kettle' })).status, 401);
  assert.equal((await post(base, { question: 'Why?', aboutObjectId: 'kettle' }, 'right')).status, 200);
});

test('/ask relays injected failures and repairs an invalid injected lens hint', async (t) => {
  const failed = await bridge(t, { askFn: async () => { throw new Error('answerer down'); } });
  const glasses = await socket(failed.port);
  const response = await post(failed.base, { reqId: 'ask-fail', question: 'Why?', aboutObjectId: 'kettle' });
  assert.equal(response.status, 502); assert.equal((await response.json()).error, 'detect_failed');
  const error = await nextMessage(glasses, (message) => message.type === 'error' && message.reqId === 'ask-fail');
  assert.equal(error.code, 'detect_failed'); glasses.ws.close(); await failed.close();

  const repaired = await bridge(t, { askFn: async () => ({ answer: 'It gets hot.', lensId: 'wrong.lens', step: 8, model: 'test', provider: 'test', ms: 1 }) });
  const show = await (await post(repaired.base, { question: 'Why does the switch click off?', aboutObjectId: 'kettle' })).json();
  assert.deepEqual(show.lensHint, { id: 'kettle.motion', step: 1 });
});

test('/ask uses translated library text and translated captions for local matching', async (t) => {
  const { base } = await bridge(t);
  const show = await (await post(base, { question: 'Miksi termostaattia kuumennetaan?', aboutObjectId: 'kettle', lang: 'fi' })).json();
  assert.equal(show.lang, 'fi'); assert.equal(show.label, 'Vedenkeitin');
  assert.equal(show.answer, 'H\u00f6yry kuumentaa termostaattia.');
  assert.deepEqual(show.steps, ['H\u00f6yry kuumentaa termostaattia.', 'J\u00e4\u00e4htyminen palauttaa kytkimen.']);
  assert.deepEqual(show.lensHint, { id: 'kettle.motion', step: 1 });
});

test('text-only ask reuses providers while image detection request stays byte-identical', async () => {
  const originalFetch = globalThis.fetch; const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), ...init });
    const text = requests.length === 1
      ? '{"objectId":"kettle","confidence":0.9,"answer":""}'
      : '{"answer":"It clicks when the thermostat is hot.","lensId":"kettle.motion","step":1}';
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }) };
  };
  try {
    const env = { ANTHROPIC_API_KEY: 'test-only', ANTHROPIC_MODEL: 'test-model' };
    await detect({ imageBase64: 'image', focusBase64: 'focus', objects, env, provider: 'anthropic', timeoutMs: 1000 });
    const prompt = buildPrompt(objects, undefined, true, 'en');
    const expected = JSON.stringify({ model: 'test-model', max_tokens: 300, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'image' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'focus' } },
      { type: 'text', text: prompt },
    ] }] });
    assert.equal(requests[0].body, expected);
    const result = await ask({ object: objects[0], question: 'Why does it click?', env, provider: 'anthropic', timeoutMs: 1000 });
    assert.equal(result.lensId, 'kettle.motion');
    const askContent = JSON.parse(requests[1].body).messages[0].content;
    assert.deepEqual(askContent.map((part) => part.type), ['text']);
  } finally { globalThis.fetch = originalFetch; }
});
