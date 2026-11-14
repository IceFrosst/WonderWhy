// holo.js: our real 3D objects (app/shared/objects.json, drawn by app/render3d/page/scene.js) on their own canvas,
// ready to composite over footage. The canvas is black where there is no object: draw it with
// globalCompositeOperation 'screen' or 'lighter' (glowing-line look), never 'source-over'.
//   import { hologram } from '../lib/holo.js';
//   const h = await hologram('printer3d', { scale: 2 });  // canvas is 600*scale px square
//   h.beats.length, h.plans[b] = { dur, loopFrom, frames }  (beat b clip = move s + dur s)
//   ctx.drawImage(h.draw(b, tInBeat, { yaw, pitch, explode }), x, y, w, w);
//   h.labels(b, t) -> [{ kind, text, side, x, y }] in 600x600 canvas units (multiply by w / 600)
// Read-only use of scene.js: never edit app/render3d or app/shared from a video page.
import { Explore, SIZE } from '/app/render3d/page/scene.js';

let objectsP = null;
export const objects = () => (objectsP ??= fetch('/app/shared/objects.json').then(r => r.json()).then(d => d.objects || d));

export async function hologram(id, { lens = 'explore', style, scale = 1 } = {}) {
  const o = (await objects()).find(x => x.id === id);
  if (!o) throw new Error(`holo: no object ${id}`);
  const ch = o.chapters.find(c => c.lens === lens) || o.chapters[0];
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE * scale;
  const ex = new Explore(canvas);
  const spec = structuredClone(ch.spec);
  if (style !== undefined) spec.style = style;
  ex.load(spec);
  if (scale !== 1) { // render at scale x 600 px; projections and labels stay in 600-px units
    ex.renderer.setPixelRatio(scale); ex.renderer.setSize(SIZE, SIZE, false);
    for (const c of [ex.linesComposer, ex.realPipeline].filter(Boolean)) { c.setPixelRatio(scale); c.setSize(SIZE, SIZE); }
  }
  window.webglInfo = ex.info();
  const plans = ex.beats.map((_, b) => ex.plan(b));
  return {
    id, object: o, chapter: ch, canvas, explore: ex, beats: ex.beats, plans, size: SIZE * scale,
    captions: ch.captions || [],
    draw(b, t, view) { if (view) ex.setView(view); ex.renderAt(b, Math.max(0, t)); return canvas; },
    labels(b, t) { return ex.labelsAt(b, Math.max(0, t)); },
  };
}
