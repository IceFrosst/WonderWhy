const MAX_NUMBER = 10_000;
const ID = /^[a-z0-9_-]{1,32}$/;
const PRIMS = new Set(['box', 'cylinder', 'sphere', 'torus', 'lathe', 'extrude', 'tube', 'gear', 'helix']);
const ROLES = new Set(['object', 'actor', 'energy', 'loss', 'answer', 'other']);
const FX_TYPES = new Set(['arrow', 'flow', 'heat', 'waves', 'trail', 'dim']);

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const get = (value, key) => own(value, key) ? value[key] : undefined;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function text(value, max, allowEmpty = false) {
  if (typeof value !== 'string') return null;
  let cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length > max) cleaned = cleaned.slice(0, Math.max(0, max - 1)).trimEnd() + '\u2026';
  return cleaned.length || allowEmpty ? cleaned : null;
}

function number(value, min = -MAX_NUMBER, max = MAX_NUMBER, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  if (integer && !Number.isInteger(value)) return null;
  return value;
}

function vector(value, length = 3, options = {}) {
  if (!Array.isArray(value) || value.length !== length) return null;
  const result = [];
  for (let index = 0; index < length; index += 1) {
    if (!own(value, index)) return null;
    const item = number(value[index], options.min, options.max);
    if (item === null) return null;
    result.push(item);
  }
  if (options.nonzero && result.every((item) => item === 0)) return null;
  return result;
}

function list(value, max, clean) {
  if (!Array.isArray(value)) return null;
  const result = [];
  const length = Math.min(value.length, max);
  for (let index = 0; index < length; index += 1) {
    if (!own(value, index)) continue;
    const item = clean(value[index], index);
    if (item !== null) result.push(item);
  }
  return result;
}

function points(value, dimensions, minLength, radial = false) {
  const result = list(value, 64, (point) => {
    const clean = vector(point, dimensions);
    if (!clean || (radial && clean[0] < 0)) return null;
    return clean;
  });
  return result && result.length >= minLength ? result : null;
}

function positive(value) {
  return number(value, Number.MIN_VALUE, MAX_NUMBER);
}

function role(value, allowed = ROLES) {
  return typeof value === 'string' && allowed.has(value) ? value : null;
}

function animation(value) {
  if (!record(value)) return null;
  const keys = ['spin', 'swing', 'shake'].filter((key) => own(value, key));
  if (keys.length !== 1 || !record(value[keys[0]])) return null;
  const kind = keys[0];
  const source = value[kind];
  const axis = vector(get(source, 'axis'), 3, { nonzero: true });
  if (!axis) return null;
  if (kind === 'spin') {
    const rpm = number(get(source, 'rpm'));
    return rpm === null ? null : { spin: { axis, rpm } };
  }
  if (kind === 'swing') {
    const deg = positive(get(source, 'deg'));
    const hz = positive(get(source, 'hz'));
    return deg === null || hz === null ? null : { swing: { axis, deg, hz } };
  }
  const amp = positive(get(source, 'amp'));
  const hz = positive(get(source, 'hz'));
  return amp === null || hz === null ? null : { shake: { axis, amp, hz } };
}

function primitive(value, prim) {
  if (prim === 'box') {
    const size = vector(get(value, 'size'), 3, { min: Number.MIN_VALUE, max: MAX_NUMBER });
    const round = get(value, 'round');
    const cleanRound = round === undefined ? undefined : positive(round);
    if (!size || (round !== undefined && cleanRound === null)) return null;
    return { size, ...(cleanRound === undefined ? {} : { round: cleanRound }) };
  }
  if (prim === 'cylinder') {
    const r = positive(get(value, 'r'));
    const h = positive(get(value, 'h'));
    const segments = number(get(value, 'segments'), 6, 48, true);
    const r2 = get(value, 'r2');
    const cleanR2 = r2 === undefined ? undefined : positive(r2);
    if (r === null || h === null || segments === null || (r2 !== undefined && cleanR2 === null)) return null;
    return { r, h, ...(cleanR2 === undefined ? {} : { r2: cleanR2 }), segments };
  }
  if (prim === 'sphere') {
    const r = positive(get(value, 'r'));
    return r === null ? null : { r };
  }
  if (prim === 'torus') {
    const r = positive(get(value, 'r'));
    const tube = positive(get(value, 'tube'));
    return r === null || tube === null ? null : { r, tube };
  }
  if (prim === 'lathe') {
    const profile = points(get(value, 'profile'), 2, 2, true);
    return profile ? { profile } : null;
  }
  if (prim === 'extrude') {
    const shape = points(get(value, 'shape'), 2, 3);
    const h = positive(get(value, 'h'));
    return !shape || h === null ? null : { shape, h };
  }
  if (prim === 'tube') {
    const path = points(get(value, 'path'), 3, 2);
    const r = positive(get(value, 'r'));
    const closed = get(value, 'closed');
    if (!path || r === null || (closed !== undefined && typeof closed !== 'boolean')) return null;
    return { path, r, ...(closed === undefined ? {} : { closed }) };
  }
  if (prim === 'gear') {
    const teeth = number(get(value, 'teeth'), 6, 80, true);
    const r = positive(get(value, 'r'));
    const h = positive(get(value, 'h'));
    const toothDepth = get(value, 'toothDepth');
    const cleanDepth = toothDepth === undefined ? undefined : positive(toothDepth);
    if (teeth === null || r === null || h === null || (toothDepth !== undefined && cleanDepth === null)) return null;
    return { teeth, r, h, ...(cleanDepth === undefined ? {} : { toothDepth: cleanDepth }) };
  }
  if (prim === 'helix') {
    const r = positive(get(value, 'r'));
    const h = positive(get(value, 'h'));
    const turns = number(get(value, 'turns'), Number.MIN_VALUE, 40);
    const tube = positive(get(value, 'tube'));
    return r === null || h === null || turns === null || tube === null ? null : { r, h, turns, tube };
  }
  return null;
}

function part(value, ids) {
  if (!record(value)) return null;
  const id = text(get(value, 'id'), 32);
  // Optional fields take their MODEL3D.md defaults when absent; a present but invalid value still rejects the part.
  const or = (key, fallback, read) => (get(value, key) === undefined ? fallback : read(get(value, key)));
  const label = or('label', '', (item) => text(item, 24, true));
  const prim = get(value, 'prim');
  const pos = or('pos', [0, 0, 0], (item) => vector(item));
  const rot = or('rot', [0, 0, 0], (item) => vector(item));
  const scale = or('scale', 1, (item) => (Array.isArray(item)
    ? vector(item, 3, { min: Number.MIN_VALUE, max: MAX_NUMBER })
    : positive(item)));
  const cleanRole = or('role', 'object', (item) => role(item));
  const explode = or('explode', [0, 0, 0], (item) => vector(item));
  if (!id || !ID.test(id) || ids.has(id) || label === null || label === undefined || typeof prim !== 'string' || !PRIMS.has(prim)) return null;
  if (!pos || !rot || scale === null || !cleanRole || !explode) return null;
  const fields = primitive(value, prim);
  if (!fields) return null;

  const parent = get(value, 'parent');
  if (parent !== undefined && (typeof parent !== 'string' || !ids.has(parent))) return null;
  const sourceAnim = get(value, 'anim');
  const anim = sourceAnim === undefined ? undefined : animation(sourceAnim);
  if (sourceAnim !== undefined && !anim) return null;
  return {
    id,
    label,
    prim,
    ...fields,
    pos,
    rot,
    scale,
    role: cleanRole,
    explode,
    ...(parent === undefined ? {} : { parent }),
    ...(anim === undefined ? {} : { anim }),
  };
}

function reference(value, ids) {
  if (typeof value === 'string') return ids.has(value) ? value : null;
  return vector(value);
}

function effect(value, ids) {
  if (!record(value) || typeof get(value, 'type') !== 'string' || !FX_TYPES.has(get(value, 'type'))) return null;
  const type = get(value, 'type');
  if (type === 'arrow') {
    const from = reference(get(value, 'from'), ids);
    const dir = vector(get(value, 'dir'), 3, { nonzero: true });
    const len = positive(get(value, 'len'));
    const cleanRole = role(get(value, 'role'));
    const label = text(get(value, 'label'), 24);
    return !from || !dir || len === null || !cleanRole || !label ? null : { type, from, dir, len, role: cleanRole, label };
  }
  if (type === 'flow') {
    const path = points(get(value, 'path'), 3, 2);
    const cleanRole = role(get(value, 'role'));
    const speed = positive(get(value, 'speed'));
    const count = number(get(value, 'count'), 1, MAX_NUMBER, true);
    const label = text(get(value, 'label'), 24);
    const closed = get(value, 'closed');
    if (!path || !cleanRole || speed === null || count === null || !label || typeof closed !== 'boolean') return null;
    return { type, path, role: cleanRole, speed, count, label, closed };
  }
  if (type === 'heat') {
    const on = get(value, 'on');
    const cleanRole = role(get(value, 'role'), new Set(['energy', 'loss']));
    return typeof on === 'string' && ids.has(on) && cleanRole ? { type, on, role: cleanRole } : null;
  }
  if (type === 'waves') {
    const at = reference(get(value, 'at'), ids);
    const cleanRole = role(get(value, 'role'));
    const hz = positive(get(value, 'hz'));
    return !at || !cleanRole || hz === null ? null : { type, at, role: cleanRole, hz };
  }
  if (type === 'trail') {
    const on = get(value, 'on');
    return typeof on === 'string' && ids.has(on) ? { type, on } : null;
  }
  const on = get(value, 'on');
  const dimText = text(get(value, 'text'), 24);
  return typeof on === 'string' && ids.has(on) && dimText ? { type, on, text: dimText } : null;
}

function idList(value, ids, max = 32) {
  if (!Array.isArray(value)) return null;
  const result = [];
  const length = Math.min(value.length, max);
  for (let index = 0; index < length; index += 1) {
    if (!own(value, index)) continue;
    const id = value[index];
    if (typeof id === 'string' && ids.has(id) && !result.includes(id)) result.push(id);
  }
  return result;
}

function camera(value, ids) {
  if (!record(value)) return null;
  const yaw = number(get(value, 'yaw'));
  const pitch = number(get(value, 'pitch'), -89, 89);
  const zoom = number(get(value, 'zoom'), 0.3, 6);
  if (yaw === null || pitch === null || zoom === null) return null;
  const sourceTarget = get(value, 'target');
  let target;
  if (sourceTarget === undefined) target = undefined;
  else if (sourceTarget === null) target = null;
  else target = reference(sourceTarget, ids);
  if (sourceTarget !== undefined && sourceTarget !== null && target === null) return null;
  return { yaw, pitch, zoom, ...(target === undefined ? {} : { target }) };
}

function numberCard(value) {
  if (!record(value)) return null;
  const cardValue = text(get(value, 'value'), 24);
  const unit = text(get(value, 'unit'), 24, true);
  const label = text(get(value, 'label'), 24);
  return cardValue && unit !== null && label ? { value: cardValue, unit, label } : null;
}

function beat(value, ids) {
  if (!record(value)) return null;
  const cleanCamera = camera(get(value, 'camera'), ids);
  if (!cleanCamera) return null;
  const result = { camera: cleanCamera };

  for (const [key, min, max] of [['turn', 0, 20], ['explode', 0, 1], ['dur', 3, 12]]) {
    if (!own(value, key)) continue;
    const clean = number(value[key], min, max);
    if (clean === null) return null;
    result[key] = clean;
  }
  for (const key of ['focus', 'ghost', 'labels', 'play']) {
    if (!own(value, key)) continue;
    const clean = idList(value[key], ids, key === 'labels' ? 3 : 32);
    if (!clean) return null;
    result[key] = clean;
  }
  if (own(value, 'fx')) {
    const fx = list(value.fx, 4, (item) => effect(item, ids));
    if (!fx) return null;
    result.fx = fx;
  }
  if (own(value, 'number')) {
    const card = numberCard(value.number);
    if (!card) return null;
    result.number = card;
  }
  return result;
}

/** Validate untrusted MODEL3D.md data, returning a detached, cleaned copy. */
export function validateModel3d(spec, captionCount) {
  try {
    if (!record(spec) || !Array.isArray(get(spec, 'parts')) || !Array.isArray(get(spec, 'beats'))) return null;
    const parts = [];
    const ids = new Set();
    const sourceParts = get(spec, 'parts');
    const partCount = Math.min(sourceParts.length, 32);
    for (let index = 0; index < partCount; index += 1) {
      if (!own(sourceParts, index)) continue;
      const clean = part(sourceParts[index], ids);
      if (!clean) continue;
      parts.push(clean);
      ids.add(clean.id);
    }
    if (!parts.length) return null;

    const beats = [];
    const sourceBeats = get(spec, 'beats');
    const beatCount = Math.min(sourceBeats.length, 6);
    for (let index = 0; index < beatCount; index += 1) {
      if (!own(sourceBeats, index)) continue;
      const clean = beat(sourceBeats[index], ids);
      if (clean) beats.push(clean);
    }
    if (!beats.length) return null;

    const expected = Array.isArray(captionCount) ? captionCount.length : captionCount;
    if (expected !== undefined && (!Number.isInteger(expected) || beats.length !== expected)) return null;
    return { parts, beats };
  } catch {
    return null;
  }
}
