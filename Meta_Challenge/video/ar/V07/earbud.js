// earbud.js (V07 only): the app's `earbuds` explore spec with the ear canal and eardrum removed,
// and two beats of our own (whole earbud; mic + speaker in focus). Same drawing code as lib/holo.js
// (app/render3d/page/scene.js, read-only), just a filtered copy of the spec.
import { Explore, SIZE } from '/app/render3d/page/scene.js';

const DROP = new Set(['eardrum', 'eardrum_rim', 'canal_top', 'canal_bottom']);
const MIC = ['mic_out', 'mic_out_board'], SPK = ['cone', 'dustcap', 'surround', 'coil', 'magnet', 'pole', 'cup'];

export async function earbud({ scale = 2, camera = { yaw: -25, pitch: 12, zoom: 1.0 } } = {}) {
  const d = await (await fetch('/app/shared/objects.json')).json();
  const o = (d.objects || d).find(x => x.id === 'earbuds');
  const ch = o.chapters.find(c => c.lens === 'explore') || o.chapters[0];
  const spec = structuredClone(ch.spec);
  spec.parts = spec.parts.filter(p => !DROP.has(p.id) && !DROP.has(p.parent));
  spec.beats = [
    { camera, move: 0.2, dur: 20, explode: 0 },                                         // 0: whole earbud
    { camera, move: 0.8, dur: 20, explode: 0, focus: [...MIC, ...SPK], labels: ['mic_out', 'cone'], play: ['cone'] }, // 1: mic + speaker
  ];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE * scale;
  const ex = new Explore(canvas);
  ex.load(spec);
  if (scale !== 1) {
    ex.renderer.setPixelRatio(scale); ex.renderer.setSize(SIZE, SIZE, false);
    for (const c of [ex.linesComposer, ex.realPipeline].filter(Boolean)) { c.setPixelRatio(scale); c.setSize(SIZE, SIZE); }
  }
  window.webglInfo = ex.info();
  return {
    canvas, explore: ex, size: SIZE * scale,
    draw(b, t, view) { if (view) ex.setView(view); ex.renderAt(b, Math.max(0, t)); return canvas; },
    labels(b, t) { return ex.labelsAt(b, Math.max(0, t)); },
  };
}
