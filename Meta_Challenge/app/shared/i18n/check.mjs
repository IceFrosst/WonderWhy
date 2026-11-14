// Checks every <lang>.json in this folder against ../objects.json. Run from the repo root:
//   node Meta_Challenge/app/shared/i18n/check.mjs
// Exit code 1 on any problem. No dependencies.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(join(dir, '..', 'objects.json'), 'utf8'));
const MAX_GROWTH = 1.4; // a translation may be at most 40% longer than the English
const NUM = /\d+(?:\.\d+)?/g;
const MOJIBAKE = ['Ã', 'Â', 'â€'];
const LENSES = ['motion', 'inside', 'cutaway', 'flow', 'zoom', 'whatif', 'compare', 'number'];

let bad = 0;
const files = readdirSync(dir).filter((f) => /^[a-z]{2,3}\.json$/.test(f)).sort();
if (!files.length) { console.log('no language files found'); process.exit(1); }

for (const f of files) {
  const problems = [];
  const p = (m) => problems.push(m);
  let tr;
  try { tr = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { console.log(`${f}: FAIL invalid JSON (${e.message})`); bad++; continue; }
  if (tr.lang !== f.replace('.json', '')) p(`lang "${tr.lang}" does not match file name`);
  if (!tr.unknown_label) p('unknown_label missing');
  for (const l of LENSES) if (!tr.lens_names?.[l]) p(`lens_names.${l} missing`);
  for (const l of Object.keys(tr.lens_names || {})) if (!LENSES.includes(l)) p(`lens_names.${l} extra`);

  let strings = 0;
  const check = (where, en, t, capLen = false) => {
    if (typeof t !== 'string' || !t.trim()) { p(`${where}: empty or missing`); return; }
    strings++;
    const have = t.match(NUM) || [];
    for (const n of new Set(en.match(NUM) || [])) if (!have.includes(n)) p(`${where}: number ${n} missing`);
    if (capLen && t.length > en.length * MAX_GROWTH) p(`${where}: ${t.length} chars vs ${en.length} English (more than 40% longer)`);
    for (const m of MOJIBAKE) if (t.includes(m)) p(`${where}: mojibake marker ${m}`);
  };

  const enObjs = Object.fromEntries(src.objects.map((o) => [o.id, o]));
  const trObjs = tr.objects || {};
  for (const id of Object.keys(enObjs)) if (!trObjs[id]) p(`object ${id} missing`);
  for (const id of Object.keys(trObjs)) if (!enObjs[id]) p(`object ${id} extra`);
  for (const [id, o] of Object.entries(enObjs)) {
    const t = trObjs[id]; if (!t) continue;
    check(`${id}.label`, o.label, t.label);
    check(`${id}.answer`, o.answer, t.answer, true);
    const enCh = Object.fromEntries(o.chapters.map((c) => [c.lens, c]));
    const trCh = t.chapters || {};
    for (const k of Object.keys(enCh)) if (!trCh[k]) p(`${id}: chapter ${k} missing`);
    for (const k of Object.keys(trCh)) if (!enCh[k]) p(`${id}: chapter ${k} extra`);
    for (const [k, c] of Object.entries(enCh)) {
      const tc = trCh[k]; if (!tc) continue;
      const w = `${id}.${k}`;
      check(`${w}.title`, c.title, tc.title);
      if (c.lead) { if (tc.lead === undefined) p(`${w}: lead missing`); else check(`${w}.lead`, c.lead, tc.lead, true); }
      else if (tc.lead !== undefined) p(`${w}: lead extra (English has none)`);
      const a = c.captions || [], b = tc.captions;
      if (!Array.isArray(b)) { p(`${w}: captions missing`); continue; }
      if (a.length !== b.length) p(`${w}: ${b.length} captions, English has ${a.length}`);
      a.forEach((s, i) => { if (b[i] !== undefined) check(`${w}.captions[${i}]`, s, b[i], true); });
    }
  }
  if (problems.length) { bad++; console.log(`${f}: FAIL ${problems.length} problem(s)`); problems.forEach((m) => console.log('  - ' + m)); }
  else console.log(`${f}: ok (${tr.lang}, ${Object.keys(trObjs).length} objects, ${strings} strings)`);
}
process.exit(bad ? 1 : 0);
