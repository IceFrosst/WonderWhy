import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const OBJECTS_PATH = path.join(here, '..', 'shared', 'objects.json');
const FLOW_KINDS = new Set(['energy', 'water', 'signal', 'force']);
const NUMBER_SHOWS = new Set(['headline', 'rows', 'compare']);
const PAIRS = { flow: 'flow', number: 'number', whatif: 'curve' };
const LANGUAGE_NAMES = { en: 'English', fi: 'Finnish', sv: 'Swedish', de: 'German', es: 'Spanish', fr: 'French' };
const MAX_VALUE = 1_000_000_000;

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const bounded = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const safeValue = (value) => bounded(value, -MAX_VALUE, MAX_VALUE);

function text(value, max, allowEmpty = false, wordLimit = null) {
  if (typeof value !== 'string') return null;
  let cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (wordLimit) {
    const words = cleaned.split(' ').filter(Boolean);
    if (words.length > wordLimit) cleaned = words.slice(0, wordLimit).join(' ') + '\u2026';
  }
  if (cleaned.length > max) cleaned = cleaned.slice(0, Math.max(0, max - 1)).trimEnd() + '\u2026';
  return cleaned.length || allowEmpty ? cleaned : null;
}

function decimalPlaces(value) {
  if (value === undefined) return null;
  return finite(value) ? Math.round(bounded(value, 0, 6)) : NaN;
}

function numberValue(value) {
  if (!record(value) || !finite(value.value)) return null;
  const unit = text(value.unit, 48);
  const label = text(value.label, 48);
  const decimals = decimalPlaces(value.decimals);
  if (!unit || !label || Number.isNaN(decimals)) return null;
  return {
    value: safeValue(value.value),
    unit,
    label,
    ...(decimals === null ? {} : { decimals }),
  };
}

function flowSpec(value) {
  if (!record(value) || typeof value.kind !== 'string' || !FLOW_KINDS.has(value.kind)) return null;
  if (!Array.isArray(value.nodes) || value.nodes.length < 2 || !Array.isArray(value.losses) || !Array.isArray(value.steps) || !value.steps.length) return null;

  const nodes = [];
  const ids = new Set();
  for (const item of value.nodes.slice(0, 6)) {
    if (!record(item)) return null;
    const id = text(item.id, 48);
    const label = text(item.label, 48);
    const sub = item.sub === undefined ? null : text(item.sub, 48);
    if (!id || !label || (item.sub !== undefined && !sub) || ids.has(id)) return null;
    ids.add(id);
    nodes.push({ id, label, ...(sub === null ? {} : { sub }) });
  }
  if (nodes.length < 2) return null;

  const losses = [];
  for (const item of value.losses.slice(0, 3)) {
    if (!record(item) || !finite(item.share)) return null;
    const at = text(item.at, 48);
    const label = text(item.label, 48);
    if (!at || !label || !ids.has(at)) return null;
    losses.push({ at, label, share: bounded(item.share, 0, 1) });
  }

  const steps = [];
  if (value.steps.length > 6) return null;
  for (const item of value.steps.slice(0, 6)) {
    if (!record(item) || !finite(item.upTo) || !Array.isArray(item.focus) || typeof item.losses !== 'boolean') return null;
    const focus = [];
    for (const raw of item.focus.slice(0, 6)) {
      const id = text(raw, 48);
      if (!id) return null;
      if (ids.has(id) && !focus.includes(id)) focus.push(id);
    }
    steps.push({ upTo: Math.round(bounded(item.upTo, 1, nodes.length)), focus, losses: item.losses });
  }
  return { kind: value.kind, nodes, losses, steps };
}

function numberSpec(value) {
  if (!record(value) || !Array.isArray(value.rows) || !Array.isArray(value.steps) || !value.steps.length) return null;
  const headline = numberValue(value.headline);
  if (!headline) return null;

  const rows = [];
  for (const item of value.rows.slice(0, 4)) {
    const row = numberValue(item);
    if (!row || !record(item)) return null;
    if (item.scales !== undefined && typeof item.scales !== 'boolean') return null;
    if (item.of !== undefined && (!finite(item.of) || item.of <= 0)) return null;
    rows.push({
      ...row,
      ...(item.scales === undefined ? {} : { scales: item.scales }),
      ...(item.of === undefined ? {} : { of: bounded(item.of, 0.000001, MAX_VALUE) }),
    });
  }

  let compare;
  if (value.compare !== undefined) {
    compare = numberValue(value.compare);
    if (!compare) return null;
  }

  let knob;
  if (value.knob !== undefined) {
    if (!record(value.knob)) return null;
    const label = text(value.knob.label, 48);
    const unit = text(value.knob.unit, 48);
    if (!label || !unit || !finite(value.knob.min) || !finite(value.knob.max) || !finite(value.knob.step) || !finite(value.knob.value)) return null;
    const min = safeValue(value.knob.min);
    const max = safeValue(value.knob.max);
    if (min >= max || value.knob.step <= 0) return null;
    knob = {
      label,
      unit,
      min,
      max,
      step: bounded(value.knob.step, 0.000001, max - min),
      value: bounded(value.knob.value, min, max),
    };
    if (knob.value === 0) return null;
  }

  const steps = [];
  if (value.steps.length > 6) return null;
  for (const item of value.steps.slice(0, 6)) {
    if (!record(item) || typeof item.show !== 'string' || !NUMBER_SHOWS.has(item.show)) return null;
    if (item.show === 'compare' && !compare) return null;
    steps.push({ show: item.show });
  }
  return { headline, rows, steps, ...(compare ? { compare } : {}), ...(knob ? { knob } : {}) };
}

function curveUnit(value) {
  return text(value, 48, true);
}

function curveSpec(value) {
  if (!record(value) || !record(value.x) || !record(value.y)) return null;
  if (!Array.isArray(value.series) || value.series.length < 1 || value.series.length > 2) return null;
  if (!Array.isArray(value.marks) || !Array.isArray(value.steps) || !value.steps.length) return null;

  const xLabel = text(value.x.label, 48);
  const xUnit = curveUnit(value.x.unit);
  const xDecimals = decimalPlaces(value.x.decimals);
  const yLabel = text(value.y.label, 48);
  const yUnit = curveUnit(value.y.unit);
  const yDecimals = decimalPlaces(value.y.decimals);
  if (!xLabel || xUnit === null || Number.isNaN(xDecimals) || !yLabel || yUnit === null || Number.isNaN(yDecimals)) return null;
  if (!finite(value.x.min) || !finite(value.x.max) || !finite(value.x.step) || !finite(value.x.value)) return null;
  const xMin = safeValue(value.x.min);
  const xMax = safeValue(value.x.max);
  const xStep = safeValue(value.x.step);
  if (xMin >= xMax || xStep <= 0) return null;

  const series = [];
  const names = new Set();
  const roles = new Set();
  for (const item of value.series.slice(0, 2)) {
    if (!record(item)) return null;
    const name = text(item.name, 48);
    if (!name || names.has(name) || (item.role !== 'main' && item.role !== 'other') || roles.has(item.role) || !Array.isArray(item.points)) return null;
    const points = [];
    for (const point of item.points.slice(0, 64)) {
      if (!Array.isArray(point) || point.length < 2 || !finite(point[0]) || !finite(point[1])) continue;
      points.push([safeValue(point[0]), safeValue(point[1])]);
    }
    if (points.length < 2) return null;
    for (let index = 1; index < points.length; index += 1) {
      if (points[index][0] <= points[index - 1][0]) return null;
    }
    names.add(name);
    roles.add(item.role);
    series.push({ name, role: item.role, points });
  }
  if (!roles.has('main')) return null;

  const marks = [];
  for (const item of value.marks.slice(0, 3)) {
    if (!record(item) || !finite(item.x)) return null;
    const label = text(item.label, 48);
    if (!label) return null;
    marks.push({ x: safeValue(item.x), label });
  }

  const steps = [];
  const mainName = series.find((item) => item.role === 'main').name;
  if (value.steps.length > 6) return null;
  for (const item of value.steps.slice(0, 6)) {
    if (!record(item) || !Array.isArray(item.series)) return null;
    const shown = [];
    for (const raw of item.series.slice(0, 2)) {
      const name = text(raw, 48);
      if (!name) return null;
      if (names.has(name) && !shown.includes(name)) shown.push(name);
    }
    if (!shown.includes(mainName)) return null;
    steps.push({ series: shown });
  }

  return {
    x: {
      label: xLabel,
      unit: xUnit,
      min: xMin,
      max: xMax,
      step: Math.min(xStep, xMax - xMin),
      value: bounded(safeValue(value.x.value), xMin, xMax),
      ...(xDecimals === null ? {} : { decimals: xDecimals }),
    },
    y: { label: yLabel, unit: yUnit, ...(yDecimals === null ? {} : { decimals: yDecimals }) },
    series,
    marks,
    steps,
  };
}

function chapter(value) {
  if (!record(value) || typeof value.lens !== 'string' || PAIRS[value.lens] !== value.scene) return null;
  const title = text(value.title, 40);
  const lead = value.lead === undefined ? null : text(value.lead, 120, true);
  if (!title || (value.lead !== undefined && lead === null)) return null;
  if (!Array.isArray(value.captions) || value.captions.length < 1 || value.captions.length > 6) return null;
  const captions = value.captions.slice(0, 6).map((caption) => text(caption, 200, false, 24));
  if (captions.some((caption) => caption === null)) return null;

  let knobs;
  if (value.knobs !== undefined) {
    if (!Array.isArray(value.knobs) || value.knobs.length !== captions.length) return null;
    knobs = [];
    for (const knob of value.knobs.slice(0, 6)) {
      if (knob === null) { knobs.push(null); continue; }
      if (!record(knob) || (knob.axis !== 'x' && knob.axis !== 'y')) return null;
      const label = text(knob.label, 24);
      if (!label) return null;
      knobs.push({ axis: knob.axis, label });
    }
  }

  const spec = value.scene === 'flow' ? flowSpec(value.spec) : value.scene === 'number' ? numberSpec(value.spec) : curveSpec(value.spec);
  if (!spec || !Array.isArray(spec.steps) || spec.steps.length !== captions.length) return null;
  if (value.scene === 'number' && captions.length !== 3) return null;
  return {
    lens: value.lens,
    scene: value.scene,
    title,
    ...(lead === null ? {} : { lead }),
    captions,
    ...(knobs === undefined ? {} : { knobs }),
    spec,
  };
}

/** Validate untrusted sketch JSON, returning a cleaned copy and never throwing. */
export function validateSketch(value) {
  try {
    if (!record(value)) return null;
    const label = text(value.label, 40);
    const answer = text(value.answer, 120, false, 12);
    if (!label || !answer || !Array.isArray(value.chapters) || value.chapters.length < 1 || value.chapters.length > 3) return null;
    const chapters = value.chapters.slice(0, 3).map(chapter);
    if (chapters.some((item) => item === null)) return null;
    if (new Set(chapters.map((item) => item.lens)).size !== chapters.length) return null;
    return { label, answer, verified: false, chapters };
  } catch {
    return null;
  }
}

function promptObjects(objects) {
  if (Array.isArray(objects) && objects.some((item) => item?.id === 'kettle')) return objects;
  try { return JSON.parse(readFileSync(OBJECTS_PATH, 'utf8')).objects; } catch { return Array.isArray(objects) ? objects : []; }
}

/** Build the JSON-only multimodal request for a generated unknown-object sketch. */
export function buildSketchPrompt({ objects, lang = 'en', hint = '' } = {}) {
  const kettle = promptObjects(objects).find((item) => item?.id === 'kettle');
  const chapters = Array.isArray(kettle?.chapters)
    ? kettle.chapters.filter((item) => item.lens === 'flow' || item.lens === 'number').map(({ hint: _hint, ...item }) => item)
    : [];
  const example = { label: kettle?.label || 'Boiling kettle', answer: kettle?.answer || 'Hot water rises, cool water sinks, bubbles are vapour.', verified: false, chapters };
  const language = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES.en;
  return `Explain the main unknown object in the photo as a small reusable physics sketch. Reply with one strict JSON object only, with no markdown or prose.

Output shape:
{"label":"1 to 3 words","answer":"one sentence","verified":false,"chapters":[{"lens":"flow","scene":"flow","title":"...","lead":"...","captions":["..."],"knobs":[null],"spec":{"kind":"energy|water|signal|force","nodes":[{"id":"english_id","label":"...","sub":"..."}],"losses":[{"at":"english_id","label":"...","share":0.1}],"steps":[{"upTo":2,"focus":["english_id"],"losses":false}]}},{"lens":"number","scene":"number","title":"...","lead":"...","captions":["...","...","..."],"spec":{"headline":{"value":1,"unit":"...","label":"...","decimals":0},"rows":[],"compare":{"value":1,"unit":"...","label":"..."},"knob":{"label":"...","unit":"...","min":1,"max":2,"step":1,"value":1},"steps":[{"show":"headline"},{"show":"rows"},{"show":"compare"}]}},{"lens":"whatif","scene":"curve","title":"...","lead":"...","captions":["..."],"knobs":[{"axis":"x","label":"..."}],"spec":{"x":{"label":"...","unit":"...","min":0,"max":1,"step":0.1,"value":0.5},"y":{"label":"...","unit":"..."},"series":[{"name":"Main","role":"main","points":[[0,0],[1,1]]}],"marks":[],"steps":[{"series":["Main"]}]}}]}.

Include exactly one flow chapter and one number chapter. A whatif curve chapter is optional. Use 1 to 3 chapters total. Each chapter needs 1 to 6 captions and exactly as many spec steps; the number chapter needs exactly 3 captions. Knobs, when present, must match the captions in length. Use 2 to 6 unique flow nodes and 0 to 3 real losses. Use 0 to 4 number rows. A curve has 1 or 2 series, 2 to 64 points per series in strictly ascending x order, and 0 to 3 marks.

Rules:
- Use plain words a 15-year-old can understand.
- Each caption has at most 24 words and explains one idea.
- Use real, typical numbers with units; never invent precision.
- The flow chain has 3 to 5 nodes in the order energy, material, or signal really travels. Add a loss only where one really exists.
- The label names the object in 1 to 3 words.
- The answer is one sentence of at most 12 words.
- Write all human-readable text in ${language}. Keep JSON keys, lens, scene, and ids in English.
- If the photo shows nothing explainable, reply exactly {"none":true}.

The classifier's existing hint is: ${JSON.stringify(typeof hint === 'string' ? hint : '')}

Worked example using the real kettle flow and number chapters:
${JSON.stringify(example, null, 2)}`;
}

function jsonObjects(source) {
  const results = [];
  for (let start = 0; start < source.length; start += 1) {
    if (source[start] !== '{') continue;
    let depth = 0; let quoted = false; let escaped = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) { results.push(source.slice(start, index + 1)); start = index; break; }
      }
    }
  }
  return results;
}

/** Parse a fenced or prose-wrapped provider reply into a validated sketch. */
export function parseSketchReply(value) {
  try {
    const source = String(value || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    for (const candidate of jsonObjects(source)) {
      let parsed;
      try { parsed = JSON.parse(candidate); } catch { continue; }
      if (record(parsed) && parsed.none === true) return null;
      const sketch = validateSketch(parsed);
      if (sketch) return sketch;
    }
    return null;
  } catch {
    return null;
  }
}
