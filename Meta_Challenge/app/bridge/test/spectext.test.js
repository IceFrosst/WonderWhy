import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildAskPrompt, parseAskReply } from '../ask.js';
import { start } from '../server.js';

const longCaption = 'Steam warms the thermostat until its metal strip bends and releases the switch with a sharp click.';
const objects = [{
  id: 'kettle',
  label: 'Kettle',
  tagline: 'English tagline.',
  short: 'English short name.',
  answer: 'The thermostat turns the kettle off.',
  chapters: [
    {
      lens: 'flow', title: 'Follow the heat', lead: 'Heat and steam move upward.', captions: [longCaption, 'Cooling resets the switch.'],
      knobs: [{ axis: 'flow', label: 'Flow rate' }, null],
      spec: {
        nodes: [{ label: 'Heater', detail: 'English detail' }, { label: 'Switch', detail: 'Keep this text' }],
        axis: { label: 'Rate', unit: 'litres per second' },
        count: 2,
      },
    },
    { lens: 'number', title: 'Power', captions: ['A heater uses two kilowatts.'], spec: { rows: [{ label: 'Power', unit: 'kW' }] } },
  ],
}];

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-spectext-'));
  writeFileSync(path.join(root, 'fi.json'), JSON.stringify({
    lang: 'fi',
    objects: {
      kettle: {
        label: 'Vedenkeitin',
        answer: 'Termostaatti sammuttaa vedenkeittimen.',
        tagline: 'Nopea kuuma vesi.',
        short: 'Keitin',
        chapters: {
          flow: {
            title: 'Seuraa l\u00e4mp\u00f6\u00e4',
            lead: 'L\u00e4mp\u00f6 ja h\u00f6yry nousevat.',
            captions: [
              'H\u00f6yry l\u00e4mmitt\u00e4\u00e4 termostaattia, kunnes kytkin naksahtaa pois p\u00e4\u00e4lt\u00e4.',
              'J\u00e4\u00e4htyminen palauttaa kytkimen.',
            ],
            knobs: ['Virtausnopeus', null],
            spec: {
              nodes: [{ label: 'Vastus' }, { label: 'Kytkin' }],
              axis: { label: 'Nopeus' },
              count: 3,
              unsafe: true,
              deep: { one: { two: { three: { four: { five: { six: 'too deep' } } } } } },
            },
          },
        },
      },
    },
  }));
  return root;
}

async function bridge(t, options = {}) {
  const i18nRoot = fixtureRoot();
  const srv = await start({ port: 0, heartbeatMs: 60000, provider: 'mock', objects, i18nRoot, ...options });
  t.after(async () => { await srv.close(); rmSync(i18nRoot, { recursive: true, force: true }); });
  return { ...srv, base: `http://localhost:${srv.port}` };
}

function post(base, route, body) {
  return fetch(base + route, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('localized shows carry safe specText and knobLabels without exposing English specs', async (t) => {
  const { base } = await bridge(t);
  const show = await (await post(base, '/detect', { forceObjectId: 'kettle', lang: 'fi' })).json();
  assert.deepEqual(show.lenses[0].specText, {
    nodes: [{ label: 'Vastus' }, { label: 'Kytkin' }],
    axis: { label: 'Nopeus' },
    count: 3,
    deep: { one: { two: { three: { four: {} } } } },
  });
  assert.deepEqual(show.lenses[0].knobLabels, ['Virtausnopeus', null]);
  assert.equal(Object.hasOwn(show.lenses[0], 'spec'), false);
  assert.equal(Object.hasOwn(show.lenses[1], 'lead'), false);

  const english = await (await post(base, '/detect', { forceObjectId: 'kettle', lang: 'en' })).json();
  assert.equal(Object.hasOwn(english.lenses[0], 'specText'), false);
  assert.equal(Object.hasOwn(english.lenses[0], 'knobLabels'), false);
  assert.equal(Object.hasOwn(english.lenses[0], 'spec'), false);
});

test('/objects merges translated object text, drawing text, and knob labels over English data', async (t) => {
  const { base } = await bridge(t);
  const body = await (await fetch(base + '/objects?lang=fi')).json();
  const object = body.objects[0]; const flow = object.chapters[0];
  assert.equal(object.tagline, 'Nopea kuuma vesi.');
  assert.equal(object.short, 'Keitin');
  assert.deepEqual(flow.spec, {
    nodes: [
      { label: 'Vastus', detail: 'English detail' },
      { label: 'Kytkin', detail: 'Keep this text' },
    ],
    axis: { label: 'Nopeus', unit: 'litres per second' },
    count: 3,
  });
  assert.deepEqual(flow.knobs, [{ axis: 'flow', label: 'Virtausnopeus' }, null]);
  assert.equal(objects[0].chapters[0].spec.nodes[0].label, 'Heater');
  assert.equal(objects[0].chapters[0].knobs[0].label, 'Flow rate');
});

test('/ask no-match uses the localized summary while local matches keep the full caption', async (t) => {
  const { base } = await bridge(t);
  const missing = await (await post(base, '/ask', { reqId: 'no-match', question: 'What color is the moon?', aboutObjectId: 'kettle', lang: 'fi' })).json();
  assert.equal(missing.answer, 'Termostaatti sammuttaa vedenkeittimen.');
  assert.equal(missing.noMatch, true);
  assert.equal(Object.hasOwn(missing, 'lensHint'), false);

  const matched = await (await post(base, '/ask', { question: 'Why does the thermostat click?', aboutObjectId: 'kettle' })).json();
  assert.equal(matched.answer, longCaption);
  assert.deepEqual(matched.lensHint, { id: 'kettle.flow', step: 1 });
  assert.equal(Object.hasOwn(matched, 'noMatch'), false);
});

test('empty model answers are no-match and model answers are capped at fourteen words', async (t) => {
  const empty = await bridge(t, { askFn: async () => ({ answer: '  ', lensId: 'kettle.flow', step: 1, model: 'model', provider: 'test', ms: 1 }) });
  const noMatch = await (await post(empty.base, '/ask', { question: 'Why does it click?', aboutObjectId: 'kettle' })).json();
  assert.equal(noMatch.answer, objects[0].answer); assert.equal(noMatch.noMatch, true); assert.equal(Object.hasOwn(noMatch, 'lensHint'), false);

  const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen';
  const capped = await bridge(t, { askFn: async () => ({ answer: words, lensId: 'kettle.flow', step: 1, model: 'model', provider: 'test', ms: 1 }) });
  const show = await (await post(capped.base, '/ask', { question: 'Why does it click?', aboutObjectId: 'kettle' })).json();
  assert.equal(show.answer, 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen\u2026');
  assert.deepEqual(show.lensHint, { id: 'kettle.flow', step: 1 });

  const parsed = parseAskReply('{"answer":"","lensId":"kettle.flow","step":1}', objects[0]);
  assert.deepEqual(parsed, { answer: '', lensId: 'kettle.flow', step: 1 });
  assert.match(buildAskPrompt({ object: objects[0], question: 'Why?' }), /one sentence of at most 14 words/);
});

test('/ask and /detect 4xx and 5xx responses have safe messages and request ids', async (t) => {
  const { base } = await bridge(t, {
    detectFn: async () => { throw new Error('secret detector internals'); },
    askFn: async () => { throw new Error('secret answerer internals'); },
  });
  const cases = [
    [await post(base, '/detect', { reqId: 'detect-4xx', question: 4 }), 400, 'bad_request', 'detect-4xx'],
    [await post(base, '/ask', { reqId: 'ask-4xx', question: 'Why?', aboutObjectId: 'missing' }), 400, 'bad_request', 'ask-4xx'],
    [await post(base, '/detect', { reqId: 'detect-5xx' }), 502, 'detect_failed', 'detect-5xx'],
    [await post(base, '/ask', { reqId: 'ask-5xx', question: 'Why?', aboutObjectId: 'kettle' }), 502, 'detect_failed', 'ask-5xx'],
  ];
  for (const [response, status, error, reqId] of cases) {
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error, error); assert.equal(body.reqId, reqId);
    assert.match(body.message, /^[^\r\n]+[.!?]$/);
    assert.doesNotMatch(body.message, /secret|internal/i);
  }

  const malformed = await fetch(base + '/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const body = await malformed.json();
  assert.equal(body.error, 'bad_json'); assert.match(body.reqId, /^[\w-]{1,64}$/); assert.equal(typeof body.message, 'string');
});
