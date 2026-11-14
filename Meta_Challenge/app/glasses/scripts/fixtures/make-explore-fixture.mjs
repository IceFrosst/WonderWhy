// Builds the small Explore lens fixture the state check serves from its scripted bridge:
// three 600x600 beats (4 s, 30 fps, H.264) of a ring orbiting a fixed centre square on black,
// the text-free stills c<n>.png, tracks.json with the ring's anchor at 10 Hz, and manifest.json.
// Run: node scripts/fixtures/make-explore-fixture.mjs (needs ffmpeg with libx264 on PATH).
// The output is checked in, so the state check itself never needs ffmpeg.
import {execFileSync} from 'node:child_process';
import {mkdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OBJECT_ID = 'fixture3d';
const OUT = path.join(HERE, 'explore-media', OBJECT_ID);
const EXPLORE = path.join(OUT, 'explore');
const SIZE = 600;
const SECONDS = 4;
const FPS = 30;
const MOVE = 0.8;
const RING = 64;
const LOOP_FROM = 1;
// Beat 2 also draws a dimension line; its text ("8 cm") comes from tracks.json, like render3d's `dim` effect.
// One look per beat: the centre square's colour and where the ring's orbit starts.
const BEATS = [
  {square: '0x4df0ff', start: 0.6},
  {square: '0xffffff', start: 2.4},
  {square: '0xffc247', start: 4.2},
];

const ease = u => u * u * (3 - 2 * u);
const radius = t => 30 + 120 * ease(Math.min(t / MOVE, 1));
// Ring centre in frame pixels (the overlay places the ring's top-left corner at centre - RING/2).
const ringCentre = (beat, t) => {
  const a = beat.start + 0.5 * t;
  return [SIZE / 2 + radius(t) * Math.cos(a), SIZE / 2 + 0.6 * radius(t) * Math.sin(a)];
};

rmSync(OUT, {recursive: true, force: true});
mkdirSync(EXPLORE, {recursive: true});

const ringExpr = (inner, outer, value) =>
  `if(between(hypot(X-${RING / 2}\\,Y-${RING / 2})\\,${inner}\\,${outer})\\,${value}\\,0)`;

const tracks = {size: SIZE, fps: FPS, beats: []};
BEATS.forEach((beat, index) => {
  const n = index + 1;
  const u = `min(t/${MOVE}\\,1)`;
  const r = `(30+120*(${u}*${u}*(3-2*${u})))`;
  const a = `(${beat.start}+0.5*t)`;
  const x = `${SIZE / 2 - RING / 2}+${r}*cos(${a})`;
  const y = `${SIZE / 2 - RING / 2}+0.6*${r}*sin(${a})`;
  const graph = [
    `color=c=black:s=${SIZE}x${SIZE}:r=${FPS}:d=${SECONDS},format=rgb24,` +
      `drawbox=x=${SIZE / 2 - 14}:y=${SIZE / 2 - 14}:w=28:h=28:color=${beat.square}:t=fill,` +
      `drawbox=x=${SIZE / 2 - 160}:y=${SIZE / 2 - 100}:w=320:h=200:color=0x2a3a55:t=2` +
      (n === 2 ? `,drawbox=x=${SIZE / 2 - 60}:y=250:w=120:h=2:color=0xffffff:t=fill` : '') + '[bg]',
    `color=c=black:s=${RING}x${RING}:r=${FPS}:d=${SECONDS},format=rgb24,` +
      `geq=r='${ringExpr(22, 28, 120)}':g='${ringExpr(22, 28, 240)}':b='${ringExpr(22, 28, 255)}'[ring]`,
    `[bg][ring]overlay=x='${x}':y='${y}':eval=frame,format=yuv420p[out]`,
  ].join(';');
  const video = path.join(EXPLORE, `b${n}.mp4`);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-filter_complex', graph, '-map', '[out]',
    '-t', String(SECONDS), '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '30', '-g', String(FPS), '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', video,
  ]);
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(LOOP_FROM), '-i', video,
    '-frames:v', '1', '-compression_level', '9', path.join(EXPLORE, `c${n}.png`),
  ]);
  const ring = [];
  for (let step = 0; step <= SECONDS * 10; step++) {
    const t = step / 10;
    const [cx, cy] = ringCentre(beat, t);
    ring.push([Number(t.toFixed(1)), Number(cx.toFixed(1)), Number(cy.toFixed(1))]);
  }
  tracks.beats.push({
    dur: SECONDS,
    loopFrom: LOOP_FROM,
    labels: [
      {part: n === 2 ? 'axle' : 'ring', side: 'r', anchor: ring},
      {part: 'core', side: 'l', anchor: [[0, SIZE / 2, SIZE / 2], [SECONDS, SIZE / 2, SIZE / 2]]},
    ],
    ...(n === 2 ? {dims: [{part: 'axle', text: '8 cm', anchor: [[0, SIZE / 2, 251], [SECONDS, SIZE / 2, 251]]}]} : {}),
    ...(n === 3 ? {number: {value: '2000', unit: 'W', label: 'heating power'}} : {}),
  });
});

writeFileSync(path.join(EXPLORE, 'tracks.json'), `${JSON.stringify(tracks)}\n`);
const files = n => Array.from({length: BEATS.length}, (_, index) => `explore/${n}${index + 1}`);
writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({
  objectId: OBJECT_ID,
  lenses: {
    [`${OBJECT_ID}.explore`]: {
      kind: 'explore',
      title: 'How it works',
      // Same shape as render3d's entry: one record per beat.
      beats: files('b').map((file, index) => ({clip: `${file}.mp4`, clean: `explore/c${index + 1}.png`})),
      clean: files('c').map(file => `${file}.png`),
      tracks: 'explore/tracks.json',
      size: SIZE,
      fps: FPS,
    },
  },
}, null, 2)}\n`);

let total = 0;
for (const name of ['manifest.json', ...BEATS.flatMap((_, i) => [`explore/b${i + 1}.mp4`, `explore/c${i + 1}.png`]), 'explore/tracks.json']) {
  const bytes = statSync(path.join(OUT, name)).size;
  total += bytes;
  console.log(`${name}: ${bytes} bytes`);
}
console.log(`total: ${total} bytes`);
