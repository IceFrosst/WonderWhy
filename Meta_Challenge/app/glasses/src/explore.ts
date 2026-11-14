// Explore lens (shared/MODEL3D.md): pre-rendered 3D beats streamed from the bridge's /media.
// This file holds the untrusted-data side: the media entry, tracks.json and the chapter spec.
import {bridgeUrl} from './bridge';
import type {Chapter, ObjectInfo} from './content';

export const EXPLORE_LENS = 'explore';
export const EXPLORE_SCENE = 'model3d';
const MAX_PARTS = 32;
const MAX_BEATS = 6;
const MAX_LABELS = 3;
const DEFAULT_DUR = 6;
const PROBE_MS = 800;

/** Absolute URLs of one object's Explore beats. */
export interface ExploreMedia {
  videos: Array<string | null>;
  stills: Array<string | null>;
  tracks: string | null;
}

export interface ExploreNumber {
  value: string;
  unit: string;
  label: string;
}

export interface ExploreBeat {
  labels: string[];
  /** Text of the beat's `dim` effects, in order (drawn by the glasses: the video has no text). */
  dims: string[];
  focus: string[];
  number: ExploreNumber | null;
  dur: number;
}

export interface ExploreSpec {
  /** Part id to its (possibly translated) label. */
  parts: Map<string, string>;
  beats: ExploreBeat[];
}

export interface TrackLabel {
  part: string;
  side: 'l' | 'r' | null;
  focus: boolean;
  /** [t, x, y] in video frame pixels, sorted by t. */
  samples: Array<[number, number, number]>;
}

export interface TrackDim {
  text: string;
  samples: Array<[number, number, number]>;
}

export interface TrackBeat {
  dur: number | null;
  dims: TrackDim[];
  loopFrom: number;
  /** Seconds of camera move at the start of the beat; labels fade in after it. */
  move: number;
  labels: TrackLabel[];
}

export interface Tracks {
  size: number;
  beats: TrackBeat[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

const ID_RE = /^[a-z0-9_-]{1,32}$/;

function idList(v: unknown, max: number, known: Map<string, string>): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && known.has(item) && !out.includes(item)) out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export function isExploreChapter(chapter: Chapter | undefined): boolean {
  return Boolean(chapter && (chapter.scene === EXPLORE_SCENE || chapter.lens === EXPLORE_LENS));
}

/**
 * The glasses' own check of a `model3d` spec: only what the player needs (part labels and the
 * beat lists), with the MODEL3D.md limits. Returns null when it cannot be used.
 */
export function parseExploreSpec(spec: unknown, beatCount: number): ExploreSpec | null {
  if (!isRecord(spec) || !Array.isArray(spec.parts) || !Array.isArray(spec.beats)) return null;
  const parts = new Map<string, string>();
  for (const raw of spec.parts.slice(0, MAX_PARTS)) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !ID_RE.test(raw.id) || parts.has(raw.id)) continue;
    parts.set(raw.id, cleanText(raw.label, 32) ?? '');
  }
  if (!parts.size || beatCount < 1 || beatCount > MAX_BEATS) return null;
  const beats: ExploreBeat[] = [];
  for (let index = 0; index < beatCount; index++) {
    const raw = spec.beats[index];
    const beat = isRecord(raw) ? raw : {};
    let number: ExploreNumber | null = null;
    if (isRecord(beat.number)) {
      const value = typeof beat.number.value === 'number' && Number.isFinite(beat.number.value)
        ? String(beat.number.value)
        : cleanText(beat.number.value, 12);
      if (value) {
        number = {value, unit: cleanText(beat.number.unit, 12) ?? '', label: cleanText(beat.number.label, 40) ?? ''};
      }
    }
    const dur = finite(beat.dur);
    const dims = (Array.isArray(beat.fx) ? beat.fx.slice(0, 4) : [])
      .filter(item => isRecord(item) && item.type === 'dim' && typeof item.on === 'string' && parts.has(item.on))
      .map(item => cleanText((item as Record<string, unknown>).text, 24) ?? '');
    beats.push({
      labels: idList(beat.labels, MAX_LABELS, parts),
      dims,
      focus: idList(beat.focus, MAX_PARTS, parts),
      number,
      dur: dur === null ? DEFAULT_DUR : Math.min(12, Math.max(3, dur)),
    });
    // Note: tracks.json `dur` is the clip length (move + beat), so the beat clock uses this one.
  }
  return {parts, beats};
}

const PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9._\-/]{0,199}$/;
const BASE_RE = /^\/media\/[A-Za-z0-9._\-/]{1,200}$/;

function safePath(v: unknown): string | null {
  if (typeof v !== 'string' || !PATH_RE.test(v) || v.split('/').some(part => part === '..' || part === '')) return null;
  return v;
}

/** `/media/<id>` from a `show.media.base`, or null when it is anything else. */
export function safeBase(v: unknown): string | null {
  if (typeof v !== 'string' || !BASE_RE.test(v) || v.split('/').includes('..')) return null;
  return v.replace(/\/+$/, '');
}

/** HTTP origin of the bridge the app talks to (its `/media` lives there), or null without a bridge. */
export function bridgeHttpOrigin(): string | null {
  const ws = bridgeUrl();
  if (!ws) return null;
  try {
    const url = new URL(ws, window.location.href);
    if (url.protocol === 'ws:') url.protocol = 'http:';
    else if (url.protocol === 'wss:') url.protocol = 'https:';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** A list of paths, or of per-beat records (`{clip, still, clean}` from render3d) read at `keys`. */
function pathList(v: unknown, keys: string[] = ['clip', 'video', 'mp4', 'file']): Array<string | null> | null {
  if (!Array.isArray(v) || !v.length) return null;
  const out = v.slice(0, MAX_BEATS).map(item => {
    if (isRecord(item)) return safePath(keys.map(key => item[key]).find(value => value !== undefined));
    return safePath(item);
  });
  return out.some(Boolean) ? out : null;
}

/**
 * Resolves a manifest `"<id>.explore"` entry against `base` (`/media/<id>`). Missing lists use the
 * renderer's naming (`explore/b<n>.mp4`, `explore/c<n>.png`, `explore/tracks.json`).
 */
export function exploreMediaFrom(entry: unknown, base: string, origin: string, beats: number): ExploreMedia | null {
  if (!isRecord(entry) || beats < 1) return null;
  let root: URL;
  try {
    root = new URL(`${base}/`, origin);
  } catch {
    return null;
  }
  const dir = safePath(entry.dir) ?? 'explore';
  const resolve = (file: string | null): string | null => {
    if (!file) return null;
    try {
      return new URL(file, root).href;
    } catch {
      return null;
    }
  };
  const videos = pathList(entry.videos) ?? pathList(entry.clips) ?? pathList(entry.beats);
  const stills = pathList(entry.clean) ?? pathList(entry.beats, ['clean']);
  const out: ExploreMedia = {videos: [], stills: [], tracks: resolve(safePath(entry.tracks) ?? `${dir}/tracks.json`)};
  for (let index = 0; index < beats; index++) {
    out.videos.push(resolve(videos ? (videos[index] ?? null) : `${dir}/b${index + 1}.mp4`));
    out.stills.push(resolve(stills ? (stills[index] ?? null) : `${dir}/c${index + 1}.png`));
  }
  // Every beat needs a picture: a video, or at least its still.
  return out.videos.every((video, index) => video || out.stills[index]) ? out : null;
}

/** The Explore entry of a `show.media` (or a sketch's `media`): the first lens key ending in `.explore`. */
export function exploreMediaFromShow(media: unknown, beats: number, origin: string | null): ExploreMedia | null {
  if (!origin || !isRecord(media) || !isRecord(media.lenses)) return null;
  const base = safeBase(media.base);
  if (!base) return null;
  const key = Object.keys(media.lenses).find(name => name.endsWith(`.${EXPLORE_LENS}`));
  return key ? exploreMediaFrom(media.lenses[key], base, origin, beats) : null;
}

const probeCache = new Map<string, {at: number; media: ExploreMedia | null}>();

/** Library object opened on the glasses: ask the bridge's media folder for its manifest. */
export async function probeExploreMedia(objectId: string, beats: number): Promise<ExploreMedia | null> {
  const origin = bridgeHttpOrigin();
  if (!origin || !ID_RE.test(objectId)) return null;
  const cached = probeCache.get(objectId);
  if (cached && performance.now() - cached.at < 60000) return cached.media;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_MS);
  let media: ExploreMedia | null = null;
  try {
    const response = await fetch(`${origin}/media/${objectId}/manifest.json`, {signal: controller.signal, cache: 'no-cache'});
    if (response.ok) media = exploreMediaFromShow({base: `/media/${objectId}`, lenses: (await response.json())?.lenses}, beats, origin);
  } catch {
    media = null;
  } finally {
    window.clearTimeout(timer);
  }
  probeCache.set(objectId, {at: performance.now(), media});
  return media;
}

/**
 * Puts the Explore chapter first when it has a usable spec and media, and drops it otherwise
 * (no blank stage: the object opens on its next lens).
 */
export function arrangeExplore(info: ObjectInfo, media: ExploreMedia | null): {info: ObjectInfo; explore: ExploreMedia | null} {
  const index = info.chapters.findIndex(isExploreChapter);
  if (index < 0) return {info, explore: null};
  const chapter = info.chapters[index];
  const others = info.chapters.filter(item => !isExploreChapter(item));
  const usable = media !== null && parseExploreSpec(chapter.spec, chapter.captions.length) !== null &&
    media.videos.length === chapter.captions.length;
  if (!usable) return {info: {...info, chapters: others}, explore: null};
  return {info: {...info, chapters: [chapter, ...others]}, explore: media};
}

function sample(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const t = finite(v[0]);
  const x = finite(v[1]);
  const y = finite(v[2]);
  return t === null || x === null || y === null ? null : [t, x, y];
}

/** Parses an untrusted tracks.json. Coordinates given as 0..1 fractions are scaled to the frame. */
export function parseTracks(v: unknown): Tracks | null {
  const root = isRecord(v) ? v : Array.isArray(v) ? {beats: v} : null;
  if (!root || !Array.isArray(root.beats)) return null;
  const size = finite(root.size) ?? finite(root.w) ?? finite(root.width) ?? 600;
  const beats: TrackBeat[] = [];
  let maxCoord = 0;
  for (const raw of root.beats.slice(0, MAX_BEATS)) {
    const beat = isRecord(raw) ? raw : {};
    const labels: TrackLabel[] = [];
    const rawLabels = Array.isArray(beat.labels) ? beat.labels : [];
    for (const item of rawLabels.slice(0, MAX_LABELS)) {
      if (!isRecord(item)) continue;
      const part = typeof item.part === 'string' ? item.part : typeof item.id === 'string' ? item.id : null;
      const list = item.track ?? item.points ?? item.samples ?? item.anchor ?? item.xy;
      if (!part || !Array.isArray(list)) continue;
      const samples = list.slice(0, 2000).map(sample).filter((s): s is [number, number, number] => s !== null)
        .sort((a, b) => a[0] - b[0]);
      if (!samples.length) continue;
      for (const s of samples) maxCoord = Math.max(maxCoord, Math.abs(s[1]), Math.abs(s[2]));
      const sideRaw = typeof item.side === 'string' ? item.side.toLowerCase() : '';
      const side = sideRaw === 'l' || sideRaw === 'left' ? 'l' : sideRaw === 'r' || sideRaw === 'right' ? 'r' : null;
      labels.push({part, side, focus: item.focus === true, samples});
    }
    const dims: TrackDim[] = [];
    for (const item of (Array.isArray(beat.dims) ? beat.dims : []).slice(0, 4)) {
      if (!isRecord(item) || !Array.isArray(item.anchor)) continue;
      const samples = item.anchor.slice(0, 2000).map(sample).filter((s): s is [number, number, number] => s !== null)
        .sort((a, b) => a[0] - b[0]);
      for (const s of samples) maxCoord = Math.max(maxCoord, Math.abs(s[1]), Math.abs(s[2]));
      if (samples.length) dims.push({text: cleanText(item.text, 24) ?? '', samples});
    }
    const dur = finite(beat.dur);
    const loopFrom = finite(beat.loopFrom) ?? finite(beat.loop_from);
    const move = finite(beat.move) ?? finite(beat.moveDur);
    beats.push({
      dur: dur === null ? null : Math.min(12, Math.max(3, dur)),
      dims,
      loopFrom: loopFrom === null ? 0 : Math.max(0, loopFrom),
      move: move === null ? 0.8 : Math.min(3, Math.max(0, move)),
      labels,
    });
  }
  if (maxCoord > 0 && maxCoord <= 1.5) {
    for (const beat of beats) for (const item of [...beat.labels, ...beat.dims]) for (const s of item.samples) {
      s[1] *= size;
      s[2] *= size;
    }
  }
  return {size: size > 0 ? size : 600, beats};
}

/** Anchor position at time t (linear between samples, held at the ends). */
export function anchorAt(samples: Array<[number, number, number]>, t: number): [number, number] {
  if (t <= samples[0][0]) return [samples[0][1], samples[0][2]];
  const last = samples[samples.length - 1];
  if (t >= last[0]) return [last[1], last[2]];
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid][0] <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

const tracksCache = new Map<string, Promise<Tracks | null>>();

export function loadTracks(url: string | null): Promise<Tracks | null> {
  if (!url) return Promise.resolve(null);
  let pending = tracksCache.get(url);
  if (!pending) {
    pending = fetch(url, {cache: 'no-cache'})
      .then(response => (response.ok ? response.json() : null))
      .then(parseTracks)
      .catch(() => null);
    tracksCache.set(url, pending);
    // A failed load may succeed later (bridge restarted): do not keep the failure.
    pending.then(result => {
      if (!result) tracksCache.delete(url);
    });
  }
  return pending;
}
