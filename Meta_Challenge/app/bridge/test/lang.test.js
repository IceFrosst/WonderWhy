import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { buildPrompt } from '../detect.js';
import { start } from '../server.js';

const objects = [
  { id: 'thing', label: 'Thing', detect_hint: 'a test thing', answer: 'English summary.', chapters: [
    { lens: 'motion', title: 'Motion', lead: 'English lead.', captions: ['First', 'Second'] },
    { lens: 'inside', title: 'Inside', lead: 'Inside lead.', captions: ['Third', 'Fourth'] },
    { lens: 'heat', title: 'Heat', captions: ['Warm'] },
  ] },
  { id: 'other', label: 'Other', detect_hint: 'another thing', answer: 'Other answer.', chapters: [
    { lens: 'motion', title: 'Other motion', lead: 'Other lead.', captions: ['Other step'] },
  ] },
];

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-i18n-'));
  writeFileSync(path.join(root, 'fi.json'), JSON.stringify({
    lang: 'fi',
    unknown_label: 'Tuntematon esine',
    objects: {
      thing: {
        label: 'Esine',
        answer: 'Suomenkielinen yhteenveto.',
        chapters: {
          motion: { title: 'Liike', captions: ['Ensimm\u00e4inen', 'Toinen'] },
          inside: { lead: 'Sis\u00e4puolen johdanto.', captions: ['V\u00e4\u00e4r\u00e4 pituus'] },
        },
      },
    },
  }));
  writeFileSync(path.join(root, 'de.json'), '{');
  return root;
}

async function bridge(t, options = {}) {
  const srv = await start({ port: 0, heartbeatMs: 60000, objects, i18nRoot: fixtureRoot(), provider: 'mock', ...options });
  t.after(() => srv.close());
  return { ...srv, base: `http://localhost:${srv.port}` };
}

function post(base, body) {
  return fetch(`${base}/detect`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function replay(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const timeout = setTimeout(() => { ws.terminate(); reject(new Error('replay timeout')); }, 1000);
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', client: 'glasses' })));
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'show') { clearTimeout(timeout); ws.close(); resolve(message); }
    });
  });
}

test('translated show fields merge per field without changing lens ids', async (t) => {
  const { base } = await bridge(t);
  const show = await (await post(base, { forceObjectId: 'thing', lang: 'fi' })).json();
  assert.equal(show.lang, 'fi');
  assert.equal(show.label, 'Esine');
  assert.equal(show.summary, 'Suomenkielinen yhteenveto.');
  assert.deepEqual(show.steps, ['Ensimm\u00e4inen', 'Toinen']);
  assert.deepEqual(show.lenses, [
    { id: 'thing.motion', kind: 'motion', title: 'Liike', lead: 'English lead.', steps: ['Ensimm\u00e4inen', 'Toinen'] },
    { id: 'thing.inside', kind: 'inside', title: 'Inside', lead: 'Sis\u00e4puolen johdanto.', steps: ['Third', 'Fourth'] },
    { id: 'thing.heat', kind: 'heat', title: 'Heat', lead: '', steps: ['Warm'] },
  ]);
  assert.deepEqual(show.lenses.map((lens) => lens.id), ['thing.motion', 'thing.inside', 'thing.heat']);

  const missingObject = await (await post(base, { forceObjectId: 'other', lang: 'fi' })).json();
  assert.equal(missingObject.lang, 'en');
  assert.equal(missingObject.label, 'Other');
  assert.equal(missingObject.summary, 'Other answer.');
});

test('language normalization, English defaults, and unknown objects set show.lang correctly', async (t) => {
  const seen = [];
  const detectFn = async (args) => {
    seen.push(args.lang);
    return { objectId: args.forceObjectId || 'thing', confidence: 1, answer: '', model: 'test', provider: 'test', detectMs: 0 };
  };
  const { base } = await bridge(t, { detectFn });
  const region = await (await post(base, { forceObjectId: 'thing', lang: 'fi-FI' })).json();
  assert.equal(region.lang, 'fi');
  const upper = await (await post(base, { forceObjectId: 'thing', lang: 'FI' })).json();
  assert.equal(upper.lang, 'fi');
  const unsupported = await (await post(base, { forceObjectId: 'thing', lang: 'xx' })).json();
  assert.equal(unsupported.lang, 'en'); assert.equal(unsupported.label, 'Thing');
  const absent = await (await post(base, { forceObjectId: 'thing' })).json();
  assert.equal(absent.lang, 'en'); assert.equal(absent.label, 'Thing');
  const unknown = await (await post(base, { forceObjectId: 'unknown', lang: 'fi' })).json();
  assert.equal(unknown.lang, 'fi'); assert.equal(unknown.label, 'Tuntematon esine');
  const unknownMissingFile = await (await post(base, { forceObjectId: 'unknown', lang: 'sv' })).json();
  assert.equal(unknownMissingFile.lang, 'en'); assert.equal(unknownMissingFile.label, 'Unknown object');
  assert.deepEqual(seen, ['fi', 'fi', 'en', 'en', 'fi', 'sv']);
});

test('malformed translation is cached as unavailable and does not crash', async (t) => {
  const { base } = await bridge(t);
  for (let i = 0; i < 2; i += 1) {
    const response = await post(base, { forceObjectId: 'thing', lang: 'de' });
    assert.equal(response.status, 200);
    const show = await response.json();
    assert.equal(show.lang, 'en'); assert.equal(show.label, 'Thing');
  }
});

test('English prompt is unchanged and Finnish prompt adds one language sentence', () => {
  const input = [{ id: 'thing', detect_hint: 'a test thing' }];
  const expected = `You classify a photo from smart glasses against a closed set of objects.
The wearer aims by looking: classify the object at or nearest the centre of the photo.
Choose exactly one id, or "unknown" if it fits none:
- thing: a test thing
- unknown: anything else
If objectId is "unknown", "answer" is a 2-sentence plain explanation of the object in the photo and the physics in it. Otherwise "answer" may be an empty string.
Reply with strict JSON only, no markdown: {"objectId": string, "confidence": number 0-1, "answer": string}`;
  assert.equal(buildPrompt(input, undefined, false, 'en'), expected);
  assert.equal(buildPrompt(input, undefined, false), expected);
  const finnish = buildPrompt(input, undefined, false, 'fi');
  assert.match(finnish, /Write the "answer" field in Finnish, and keep "objectId" exactly as listed\./);
  assert.equal(finnish.split('\n').length, expected.split('\n').length + 1);
});

test('/objects merges translations only when lang is requested', async (t) => {
  const { base } = await bridge(t);
  const plain = await (await fetch(base + '/objects')).json();
  assert.deepEqual(plain, { objects });

  const localized = await (await fetch(base + '/objects?lang=fi-FI')).json();
  assert.equal(localized.lang, 'fi');
  assert.equal(localized.objects[0].label, 'Esine');
  assert.equal(localized.objects[0].answer, 'Suomenkielinen yhteenveto.');
  assert.equal(localized.objects[0].chapters[0].title, 'Liike');
  assert.equal(localized.objects[0].chapters[0].lead, 'English lead.');
  assert.deepEqual(localized.objects[0].chapters[0].captions, ['Ensimm\u00e4inen', 'Toinen']);
  assert.deepEqual(localized.objects[0].chapters[1].captions, ['Third', 'Fourth']);
  assert.equal(localized.objects[1].label, 'Other');

  const unsupported = await (await fetch(base + '/objects?lang=xx')).json();
  assert.deepEqual(unsupported, { objects, lang: 'en' });
});

test('/last and hello replay retain the show language', async (t) => {
  const { base, port } = await bridge(t);
  await post(base, { reqId: 'localized', forceObjectId: 'thing', lang: 'fi' });
  const last = await (await fetch(base + '/last')).json();
  assert.equal(last.show.lang, 'fi');
  const message = await replay(port);
  assert.equal(message.lang, 'fi'); assert.equal(message.replay, true);
});
