// Checks every <lang>.json in this folder against ../objects.json. Run from the repo root:
//   node Meta_Challenge/app/shared/i18n/check.mjs
// Exit code 1 on any problem. No dependencies.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = JSON.parse(readFileSync(join(dir, '..', 'objects.json'), 'utf8'));
const MAX_GROWTH = 1.4;
const CAPTION_GROWTH = 1.3; // a caption may be at most 30% longer than the English
const NUM = /\d+(?:\.\d+)?/g;
const MOJIBAKE = ['Ã', 'Â', 'â€'];
const LENSES = ['explore', 'motion', 'inside', 'cutaway', 'flow', 'zoom', 'whatif', 'compare', 'number'];

let bad = 0;
const files = readdirSync(dir).filter((f) => /^[a-z]{2,3}\.json$/.test(f)).sort();
if (!files.length) { console.log('no language files found'); process.exit(1); }

for (const f of files) {
  const problems = [];
  const warnings = [];
  const p = (m) => problems.push(m);
  const warn = (m) => warnings.push(m);
  let tr;
  try { tr = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { console.log(`${f}: FAIL invalid JSON (${e.message})`); bad++; continue; }
  if (tr.lang !== f.replace('.json', '')) p(`lang "${tr.lang}" does not match file name`);
  if (!tr.unknown_label) p('unknown_label missing');
  for (const l of LENSES) if (!tr.lens_names?.[l]) p(`lens_names.${l} missing`);
  for (const l of Object.keys(tr.lens_names || {})) if (!LENSES.includes(l)) p(`lens_names.${l} extra`);

  let strings = 0;
  const check = (where, en, t, maxGrowth = null) => {
    if (typeof t !== 'string' || !t.trim()) { p(`${where}: empty or missing`); return; }
    strings++;
    const have = t.match(NUM) || [];
    for (const n of new Set(en.match(NUM) || [])) if (!have.includes(n)) p(`${where}: number ${n} missing`);
    if (maxGrowth && t.length > en.length * maxGrowth) p(`${where}: ${t.length} chars vs ${en.length} English (more than ${Math.round((maxGrowth - 1) * 100)}% longer)`);
    for (const m of MOJIBAKE) if (t.includes(m)) p(`${where}: mojibake marker ${m}`);
  };

  const enObjs = Object.fromEntries(src.objects.map((o) => [o.id, o]));
  const trObjs = tr.objects || {};
  for (const id of Object.keys(enObjs)) if (!trObjs[id]) p(`object ${id} missing`);
  for (const id of Object.keys(trObjs)) if (!enObjs[id]) p(`object ${id} extra`);
  for (const [id, o] of Object.entries(enObjs)) {
    const t = trObjs[id]; if (!t) continue;
    check(`${id}.label`, o.label, t.label);
    check(`${id}.answer`, o.answer, t.answer, MAX_GROWTH);
    check(`${id}.tagline`, o.tagline, t.tagline);
    check(`${id}.short`, o.short, t.short);
    const enCh = Object.fromEntries(o.chapters.map((c) => [c.lens, c]));
    const trCh = t.chapters || {};
    for (const k of Object.keys(enCh)) if (!trCh[k]) p(`${id}: chapter ${k} missing`);
    for (const k of Object.keys(trCh)) if (!enCh[k]) p(`${id}: chapter ${k} extra`);
    for (const [k, c] of Object.entries(enCh)) {
      const tc = trCh[k]; if (!tc) continue;
      const w = `${id}.${k}`;
      check(`${w}.title`, c.title, tc.title);
      if (c.lead) { if (tc.lead === undefined) p(`${w}: lead missing`); else check(`${w}.lead`, c.lead, tc.lead, MAX_GROWTH); }
      else if (tc.lead !== undefined) p(`${w}: lead extra (English has none)`);
      const a = c.captions || [], b = tc.captions;
      if (!Array.isArray(b)) p(`${w}: captions missing`);
      else {
        if (a.length !== b.length) p(`${w}: ${b.length} captions, English has ${a.length}`);
        a.forEach((s, i) => { if (b[i] !== undefined) check(`${w}.captions[${i}]`, s, b[i], CAPTION_GROWTH); });
      }

      if (c.knobs === undefined) {
        if (tc.knobs !== undefined) p(`${w}: knobs extra (English has none)`);
      } else if (!Array.isArray(tc.knobs)) p(`${w}: knobs missing`);
      else {
        if (tc.knobs.length !== c.knobs.length) p(`${w}: ${tc.knobs.length} knobs, English has ${c.knobs.length}`);
        c.knobs.forEach((knob, i) => {
          if (knob === null) {
            if (tc.knobs[i] !== null) p(`${w}.knobs[${i}]: must be null`);
          } else if (tc.knobs[i] === null) p(`${w}.knobs[${i}]: null but English has a label`);
          else check(`${w}.knobs[${i}]`, knob.label, tc.knobs[i]);
        });
      }

      const textSpec = (spec) => {
        if (!spec) return undefined;
        if (spec.nodes) return {
          nodes: spec.nodes.map((node) => Object.fromEntries(['label', 'sub'].filter((key) => key in node).map((key) => [key, node[key]]))),
          losses: (spec.losses || []).map((loss) => ({ label: loss.label })),
        };
        if (spec.headline) {
          const result = {
            headline: { label: spec.headline.label, unit: spec.headline.unit },
            rows: spec.rows.map((row) => ({ label: row.label, unit: row.unit })),
          };
          for (const key of ['compare', 'knob']) if (spec[key]) result[key] = { label: spec[key].label, unit: spec[key].unit };
          return result;
        }
        if (spec.x && spec.y) return {
          x: { label: spec.x.label }, y: { label: spec.y.label },
          series: (spec.series || []).map((series) => ({ name: series.name })),
          marks: (spec.marks || []).map((mark) => ({ label: mark.label })),
        };
        if (Array.isArray(spec.parts) && Array.isArray(spec.beats)) return {
          // model3d (Explore): only text the glasses show: part labels, the number's label and unit, dim text.
          // Arrays keep the English positions (mergeSpecText merges by index); {} where there is no text.
          parts: spec.parts.map((part) => (part.label ? { label: part.label } : {})),
          beats: spec.beats.map((beat) => {
            const result = {};
            if (beat.number) result.number = Object.fromEntries(['label', 'unit'].filter((key) => beat.number[key]).map((key) => [key, beat.number[key]]));
            if ((beat.fx || []).some((fx) => fx.type === 'dim' && fx.text)) result.fx = beat.fx.map((fx) => (fx.type === 'dim' && fx.text ? { text: fx.text } : {}));
            return result;
          }),
        };
        if (spec.levels) return {
          levels: spec.levels.map((level) => Object.fromEntries(['label', 'times'].filter((key) => key in level).map((key) => [key, level[key]]))),
          heat: { label: spec.heat.label },
        };
        return undefined;
      };
      const expectedSpec = textSpec(c.spec);
      const verifyShape = (en, value, where) => {
        if (typeof en === 'string') { check(where, en, value); return; }
        if (Array.isArray(en)) {
          if (!Array.isArray(value)) { p(`${where}: missing array`); return; }
          if (value.length !== en.length) p(`${where}: ${value.length} items, English has ${en.length}`);
          en.forEach((item, i) => { if (value[i] !== undefined) verifyShape(item, value[i], `${where}[${i}]`); });
          return;
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) { p(`${where}: missing object`); return; }
        for (const key of Object.keys(en)) {
          if (!(key in value)) p(`${where}.${key}: missing`);
          else verifyShape(en[key], value[key], `${where}.${key}`);
        }
        for (const key of Object.keys(value)) if (!(key in en)) p(`${where}.${key}: extra`);
      };
      if (expectedSpec === undefined) {
        if (tc.spec !== undefined) p(`${w}: spec extra (English has no text-bearing spec)`);
      } else verifyShape(expectedSpec, tc.spec, `${w}.spec`);

      if (expectedSpec && tc.spec) {
        const limit = (where, value, max) => {
          if (typeof value === 'string' && value.length > max) warn(`${where}: ${value.length} chars (limit ${max})`);
        };
        if (expectedSpec.nodes && Array.isArray(tc.spec.nodes)) tc.spec.nodes.forEach((node, i) => {
          limit(`${w}.spec.nodes[${i}].label`, node?.label, 18);
          limit(`${w}.spec.nodes[${i}].sub`, node?.sub, 22);
        });
        if (expectedSpec.x) {
          limit(`${w}.spec.x.label`, tc.spec.x?.label, 28);
          limit(`${w}.spec.y.label`, tc.spec.y?.label, 28);
          if (Array.isArray(tc.spec.series)) tc.spec.series.forEach((series, i) => limit(`${w}.spec.series[${i}].name`, series?.name, 16));
        }
        if (expectedSpec.rows && Array.isArray(tc.spec.rows)) tc.spec.rows.forEach((row, i) => limit(`${w}.spec.rows[${i}].label`, row?.label, 34));
      }
    }
  }
  if (problems.length) { bad++; console.log(`${f}: FAIL ${problems.length} problem(s), ${warnings.length} warning(s)`); problems.forEach((m) => console.log('  - ' + m)); }
  else console.log(`${f}: ok (${tr.lang}, ${Object.keys(trObjs).length} objects, ${strings} strings, ${warnings.length} warning(s))`);
  warnings.forEach((m) => console.log('  - warning: ' + m));
}
process.exit(bad ? 1 : 0);
