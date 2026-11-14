// ink.js (V08): hand-drawn ink, deterministic. Wobbly circles, arrows, strike-throughs, Caveat text written on
// with a moving clip and a pen nib, question marks that give way to the answer. `boil` (frame / 8 fps) adds the
// small line jitter of hand-drawn animation. No Math.random anywhere: shapes come from K.noise / K.hash.
export function makeInk(K) {
  const FONT = s => `600 ${s}px Caveat`;

  // stroke the first p (0..1, by length) of a polyline; returns the pen point and direction
  function strokeP(g, pts, p) {
    if (p <= 0 || pts.length < 2) return null;
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const target = L[L.length - 1] * Math.min(1, p);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    let end = pts[0], dir = [1, 0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], seg = L[i] - L[i - 1];
      dir = seg > 0 ? [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg] : dir;
      if (L[i] >= target) { const u = seg > 0 ? (target - L[i - 1]) / seg : 1; end = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; g.lineTo(end[0], end[1]); break; }
      g.lineTo(b[0], b[1]); end = b;
    }
    g.stroke();
    return { pt: end, dir };
  }
  const pen = (g, col, lw, alpha = 1) => { g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = alpha; g.setLineDash([]); };
  const nib = (g, x, y, r) => { g.save(); g.globalAlpha = 1; g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); };

  function circle(g, { cx, cy, rx, ry, rot = 0, seed, boil, p, col, lw = 3.5 }) {
    if (p <= 0) return;
    const N = 90, a0 = -2.2 + K.hash(seed) * 0.8, turn = Math.PI * 2 * 1.13, r = rot * Math.PI / 180, pts = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, ang = a0 + s * turn;
      const k = 1 + 0.05 * K.noise(s * 5, seed) + 0.05 * s + 0.008 * K.noise(s * 11, seed + boil * 31);
      const x = Math.cos(ang) * rx * k, y = Math.sin(ang) * ry * k;
      pts.push([cx + x * Math.cos(r) - y * Math.sin(r), cy + x * Math.sin(r) + y * Math.cos(r)]);
    }
    g.save(); pen(g, col, lw);
    const e = strokeP(g, pts, K.ease.inOut(p));
    if (e && p < 1) nib(g, e.pt[0], e.pt[1], lw * 0.9);
    g.restore();
  }

  function arrow(g, { from, to, bow = 40, seed, boil, p, col, lw = 3.2, dash = null, pull = 18 }) {
    if (p <= 0) return;
    let [x0, y0] = from, [x1, y1] = to;
    const d0 = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / d0, uy = (y1 - y0) / d0;
    x1 -= ux * pull; y1 -= uy * pull;
    const nx = -uy, ny = ux, mx = (x0 + x1) / 2 + nx * bow, my = (y0 + y1) / 2 + ny * bow;
    const N = 48, pts = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
      const w = (2.6 * K.noise(s * 4, seed) + 0.9 * K.noise(s * 13, seed + boil * 17)) * Math.sin(Math.PI * s);
      pts.push([a * x0 + b * mx + c * x1 + nx * w, a * y0 + b * my + c * y1 + ny * w]);
    }
    g.save(); pen(g, col, lw);
    if (dash) g.setLineDash(dash);
    const pl = K.ease.inOut(K.prog(p, 0, 0.78));
    const e = strokeP(g, pts, pl);
    g.setLineDash([]);
    if (e && pl < 1) nib(g, e.pt[0], e.pt[1], lw * 0.9);
    if (pl >= 1) { // two short head strokes, one after the other
      const t2 = pts[N - 3], dx = x1 - t2[0], dy = y1 - t2[1], dl = Math.hypot(dx, dy) || 1, hx = dx / dl, hy = dy / dl;
      for (const [j, sgn] of [[0, 1], [1, -1]]) {
        const q = K.prog(p, 0.78 + j * 0.11, 0.89 + j * 0.11); if (q <= 0) continue;
        const ang = sgn * (0.5 + 0.08 * K.noise(j, seed + 3)), len = 20 + 3 * K.hash(seed + j);
        const bx = Math.cos(ang) * -hx - Math.sin(ang) * -hy, by = Math.sin(ang) * -hx + Math.cos(ang) * -hy;
        strokeP(g, [[x1, y1], [x1 + bx * len * 0.55 + nx * 0.6, y1 + by * len * 0.55 + ny * 0.6], [x1 + bx * len, y1 + by * len]], q);
      }
    }
    g.restore();
  }

  function layout(g, { text, size }) {
    g.save(); g.font = FONT(size);
    const lines = text.split('\n'), w = Math.max(...lines.map(l => g.measureText(l).width));
    g.restore();
    return { lines, w, h: lines.length * size * 1.04 };
  }

  // writes `text` (top-left x, y) up to p; returns its box in the note's own (rotated) frame
  function text(g, { text: str, x, y, size, col, alpha = 1, seed, boil, p, rot = 0 }) {
    const lay = layout(g, { text: str, size }), lh = size * 1.04;
    const box = { x, y, w: lay.w, h: lay.h, rot, ox: x, oy: y };
    if (p <= 0) return box;
    g.save(); g.font = FONT(size); g.fillStyle = col; g.globalAlpha = alpha; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.translate(x + 0.7 * K.noise(boil * 1.7, seed), y + 0.7 * K.noise(boil * 1.7, seed + 9));
    g.rotate(rot * Math.PI / 180);
    // per-character timing: every letter takes about the same time, spaces are quick
    const chars = [];
    lay.lines.forEach((line, li) => {
      for (let i = 0; i < line.length; i++) {
        const pre = g.measureText(line.slice(0, i)).width, cw = g.measureText(line.slice(0, i + 1)).width - pre;
        chars.push({ li, pre, cw, wt: line[i] === ' ' ? 0.35 : 1 });
      }
    });
    const total = chars.reduce((s, c) => s + c.wt, 0);
    let budget = K.clamp(p) * total, nibAt = null;
    const reach = lay.lines.map(() => -1);
    for (const c of chars) {
      if (budget <= 0) break;
      const f = Math.min(1, budget / c.wt); budget -= c.wt;
      reach[c.li] = c.pre + c.cw * f;
      if (f < 1) nibAt = [c.pre + c.cw * f, c.li];
    }
    const full = lay.lines.map(l => g.measureText(l).width), done = li => reach[li] >= full[li] - 0.01;
    lay.lines.forEach((line, li) => {
      if (reach[li] < 0) return;
      const base = size * 0.8 + li * lh;
      g.save(); g.beginPath(); g.rect(-20, base - size * 1.05, reach[li] + 20 + (done(li) ? size : 2), size * 1.5); g.clip();
      g.fillText(line, 0, base); g.restore();
    });
    if (nibAt && p < 1) {
      const base = size * 0.8 + nibAt[1] * lh;
      nib(g, nibAt[0], base - size * 0.3 + size * 0.2 * K.noise(nibAt[0] * 0.08, seed + 4), size * 0.055);
    }
    g.restore();
    return box;
  }

  function strike(g, { box, seed, boil, p, col, lw = 3.5 }) {
    if (p <= 0) return;
    g.save(); g.translate(box.ox, box.oy); g.rotate(box.rot * Math.PI / 180); pen(g, col, lw);
    const mk = (ya, yb, dir, sd) => {
      const pts = [];
      for (let i = 0; i <= 30; i++) {
        const s = i / 30, u = dir > 0 ? s : 1 - s;
        pts.push([-10 + u * (box.w + 20), box.h * K.lerp(ya, yb, u) + 2.2 * K.noise(s * 6, sd) + 0.7 * K.noise(s * 14, sd + boil * 13)]);
      }
      return pts;
    };
    strokeP(g, mk(0.6, 0.5, 1, seed), K.prog(p, 0, 0.55));
    strokeP(g, mk(0.72, 0.6, -1, seed + 1), K.prog(p, 0.45, 1));
    g.restore();
  }

  // a "?" written at `at`, wiggling while it waits, then shrinking away as the answer is written (t1)
  function question(g, { at, toward, size, col, seed, boil, t, t0, t1 }) {
    const w = K.prog(t, t0, t0 + 0.28), gone = K.ease.in2(K.prog(t, t1, t1 + 0.4));
    if (w <= 0 || gone >= 1) return;
    const dx = at[0] - toward[0], dy = at[1] - toward[1], d = Math.hypot(dx, dy) || 1;
    const x = at[0] + dx / d * size * 0.45, y = at[1] + dy / d * size * 0.45;
    g.save(); g.translate(x, y);
    g.rotate((Math.sin((t - t0) * 9) * 6 * (1 - gone) + 28 * gone - 6) * Math.PI / 180);
    const s = 1 - 0.55 * gone; g.scale(s, s);
    text(g, { text: '?', x: -size * 0.2, y: -size * 0.55, size, col, alpha: 1 - gone, seed, boil, p: w });
    g.restore();
  }

  return { circle, arrow, text, layout, strike, question, strokeP };
}
