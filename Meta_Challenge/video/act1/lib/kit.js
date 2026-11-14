// kit.js: shared deterministic helpers for the Act 1 variants (A, B, C).
// Rule: every frame is a pure function of t. No Math.random, no Date, no rAF clocks.
(function () {
  const K = {};
  K.W = 1920; K.H = 1080;

  // ---- maths -------------------------------------------------------------
  K.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.prog = (t, a, b) => K.clamp((t - a) / (b - a));
  K.ease = {
    lin: x => x,
    in2: x => x * x,
    in3: x => x * x * x,
    out2: x => 1 - (1 - x) * (1 - x),
    out3: x => 1 - Math.pow(1 - x, 3),
    out5: x => 1 - Math.pow(1 - x, 5),
    inOut: x => x * x * (3 - 2 * x),
    inOut3: x => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outBack: x => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  // integer hash -> [0,1). Deterministic replacement for Math.random.
  K.hash = n => {
    let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
  K.hash2 = (a, b) => K.hash(Math.imul(a | 0, 7919) + Math.imul(b | 0, 104729) + 13);
  // smooth 1D value noise in [-1,1]
  K.noise = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return K.lerp(K.hash2(i, seed), K.hash2(i + 1, seed), u) * 2 - 1;
  };
  K.mulberry = seed => () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  // ---- colour ------------------------------------------------------------
  K.rgb = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  K.mix = (a, b, t, alpha = 1) => {
    const A = K.rgb(a), B = K.rgb(b);
    return `rgba(${Math.round(K.lerp(A[0], B[0], t))},${Math.round(K.lerp(A[1], B[1], t))},${Math.round(K.lerp(A[2], B[2], t))},${alpha})`;
  };
  K.rgba = (hex, a) => { const c = K.rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  // ---- canvas helpers ----------------------------------------------------
  K.layer = (w = K.W, h = K.H) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  K.radial = (ctx, inner, outer, cx = K.W / 2, cy = K.H / 2, r = 1150) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(0, 0, K.W, K.H);
  };
  // Additive glow: draws `src` blurred on top of ctx (cheap, via a quarter-size buffer).
  let glowBuf = null;
  K.glow = (ctx, src, radius = 18, strength = 0.9) => {
    if (!glowBuf) glowBuf = K.layer(K.W / 4, K.H / 4);
    const g = glowBuf.getContext('2d');
    g.clearRect(0, 0, glowBuf.width, glowBuf.height);
    g.filter = `blur(${radius / 4}px)`;
    g.drawImage(src, 0, 0, glowBuf.width, glowBuf.height);
    g.filter = 'none';
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = strength;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(glowBuf, 0, 0, K.W, K.H); ctx.restore();
  };
  K.vignette = (ctx, s = 0.35, rgb = '0,0,0') => {
    const g = ctx.createRadialGradient(K.W / 2, K.H / 2, K.H * 0.45, K.W / 2, K.H / 2, K.W * 0.72);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${s})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, K.W, K.H); ctx.restore();
  };
  // Film grain: three seeded noise tiles, picked and offset by the frame number.
  let grainTiles = null;
  K.grain = (ctx, t, amount = 0.07, fps = 30) => {
    if (!grainTiles) {
      grainTiles = [11, 23, 37].map(seed => {
        const c = K.layer(256, 256), g = c.getContext('2d'), im = g.createImageData(256, 256), r = K.mulberry(seed);
        for (let i = 0; i < 256 * 256; i++) { const v = (r() + r() + r()) / 3 * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
        g.putImageData(im, 0, 0); return c;
      });
    }
    const f = Math.round(t * fps), tile = grainTiles[((f % 3) + 3) % 3];
    const ox = Math.floor(K.hash(f * 3 + 1) * 256), oy = Math.floor(K.hash(f * 3 + 2) * 256);
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = amount;
    ctx.translate(-ox * 2, -oy * 2); ctx.scale(2, 2);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, K.W / 2 + 256, K.H / 2 + 256);
    ctx.restore();
  };

  // ---- fonts (OFL, in ../fonts) -------------------------------------------
  K.loadFonts = async () => {
    const a = new FontFace('Archivo', 'url(../fonts/Archivo.ttf)', { weight: '100 900', stretch: '62% 125%' });
    const c = new FontFace('Caveat', 'url(../fonts/Caveat.ttf)', { weight: '400 700' });
    await Promise.all([a.load(), c.load()]);
    document.fonts.add(a); document.fonts.add(c);
    await document.fonts.ready;
  };

  // ---- footage slots -------------------------------------------------------
  // lib/render.mjs extracts every config.footage.<key>.path that exists to <variant>/frames/<key>/%05d.jpg
  // and writes <variant>/frames/footage.json = { key: { frames: n, fps: 30 } }. No file -> placeholder.
  K.footage = {};
  K.loadFootage = async () => {
    try { const r = await fetch('frames/footage.json', { cache: 'no-store' }); if (r.ok) K.footage = await r.json(); } catch (e) { K.footage = {}; }
  };
  const imgCache = new Map();
  // Returns a decoded image for footage `key` at local time `lt` seconds (clamped), or null (use a placeholder).
  K.footageFrame = async (key, lt, fps = 30) => {
    const m = K.footage[key]; if (!m || !m.frames) return null;
    const i = K.clamp(Math.round(lt * (m.fps || fps)), 0, m.frames - 1) + 1;
    const url = `frames/${key}/${String(i).padStart(5, '0')}.jpg`;
    if (imgCache.has(url)) return imgCache.get(url);
    const im = new Image(); im.src = url;
    try { await im.decode(); } catch (e) { return null; }
    if (imgCache.size > 6) imgCache.delete(imgCache.keys().next().value);
    imgCache.set(url, im); return im;
  };
  // cover-fit draw with zoom about (fx, fy) in 0..1
  K.cover = (ctx, im, zoom = 1, fx = .5, fy = .5) => {
    const s = Math.max(K.W / im.width, K.H / im.height) * zoom, w = im.width * s, h = im.height * s;
    ctx.drawImage(im, (K.W - w) * fx, (K.H - h) * fy, w, h);
  };
  // Clearly labelled stand-in for a real shot that is not on disk yet.
  K.placeholder = (ctx, label, sub, o = {}) => {
    const { top = '#2a2118', bottom = '#0d0a07', ink = '#f4e6c8', zoom = 1 } = o;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, K.H); g.addColorStop(0, top); g.addColorStop(1, bottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, K.W, K.H);
    ctx.translate(K.W / 2, K.H / 2); ctx.scale(zoom, zoom); ctx.translate(-K.W / 2, -K.H / 2);
    ctx.globalAlpha = 0.07; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = -K.H; x < K.W; x += 64) { ctx.moveTo(x, K.H); ctx.lineTo(x + K.H, 0); }
    ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.lineWidth = 3; const m = 70, L = 60; ctx.beginPath();
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [K.W - m, m, -1, 1], [m, K.H - m, 1, -1], [K.W - m, K.H - m, -1, -1]]) {
      ctx.moveTo(x + sx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * L);
    }
    ctx.stroke();
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.62; ctx.font = '700 semi-condensed 44px Archivo'; ctx.fillText(label, K.W / 2, o.y || 150);
    if (sub) { ctx.globalAlpha = 0.4; ctx.font = '500 26px Archivo'; ctx.fillText(sub, K.W / 2, (o.y || 150) + 48); }
    ctx.restore();
  };
  // Small corner slate, used when a variant has a code-drawn stand-in on screen but a real shot is planned.
  K.slate = (ctx, text, ink = '#ffffff', alpha = 0.5) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '600 semi-condensed 24px Archivo'; ctx.fillText(text, 48, K.H - 40); ctx.restore();
  };

  // ---- dandelion seed (code-drawn, used by all three variants) -------------
  // Draws one seed at (x,y): stalk of length s, pappus fan on top. Stroke style is set by the caller.
  K.seed = (ctx, x, y, s, rot, id = 0) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -s * 0.62);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - .5) * 2.5, r = s * (0.36 + 0.1 * K.hash2(id, i));
      ctx.moveTo(0, -s * 0.62); ctx.lineTo(Math.cos(a) * r, -s * 0.62 + Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.035, s * 0.09, 0, 0, 7); ctx.fill();
    ctx.restore();
  };

  // Real motion blur: average n sub-frame samples of draw(g, time) over `shutter` seconds starting at t.
  let accBuf = null;
  K.accumulate = (ctx, t, n, shutter, draw) => {
    if (n <= 1) { draw(ctx, t); return; }
    if (!accBuf) accBuf = K.layer();
    const g = accBuf.getContext('2d');
    for (let i = 0; i < n; i++) {
      g.save(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none';
      draw(g, t + (i / n) * shutter); g.restore();
      ctx.save(); ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(accBuf, 0, 0); ctx.restore();
    }
  };

  // ---- the grey beat shared by A and C: footage slot (or labelled placeholder), drained of colour ----------------
  // f = config.footage.earbuds_in, lt = seconds since the grey beat started.
  K.coldPlate = async (g, f, t, lt) => {
    const im = await K.footageFrame('earbuds_in', t - f.start);
    if (im) {
      g.save(); g.filter = 'grayscale(1) contrast(1.12) brightness(0.78)'; K.cover(g, im, 1.06 - 0.012 * lt); g.restore();
      g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(70,110,170,0.55)'; g.fillRect(0, 0, K.W, K.H); g.restore();
      g.fillStyle = 'rgba(12,14,18,0.26)'; g.fillRect(0, 0, K.W, K.H);
    } else {
      K.placeholder(g, f.label, f.sub, { top: '#2a2f36', bottom: '#121519', ink: '#aeb8c8', zoom: 1.05 - 0.012 * lt, y: 130 });
    }
  };
  // "YOU USED TO / ASK WHY." in the cold Act 2 type. rows appear at t1 and t2, each over `fade` seconds (0 = hard).
  let coldLay = null;
  K.coldTitle = (g, t, t1, t2, fade = 0, ink = '#d3dae6') => {
    const font = '500 semi-condensed', rowW = 1400, cy = 580;
    if (!coldLay) {
      const m = K.layer(8, 8).getContext('2d'); m.font = `${font} 100px Archivo`;
      const wd = s => m.measureText(s).width / 100, cap = m.measureText('H').actualBoundingBoxAscent / 100;
      const rows = [{ text: 'YOU USED TO' }, { text: 'ASK WHY.' }];
      rows.forEach(r => { r.fs = rowW / wd(r.text); r.cap = r.fs * cap; });
      let total = rows[0].cap + rows[1].cap, gap = 0.42 * total / 2; const k = Math.min(1, 560 / (total + gap));
      rows.forEach(r => { r.fs *= k; r.cap *= k; }); gap *= k; total *= k;
      const x0 = (K.W - rowW * k) / 2, y0 = cy - (total + gap) / 2;
      rows[0].y = y0 + rows[0].cap; rows[1].y = rows[0].y + gap + rows[1].cap;
      rows[0].x = rows[1].x = x0; rows[1].x2 = x0 + wd('ASK ') * rows[1].fs;
      coldLay = rows;
    }
    const [r1, r2] = coldLay, z = 1.05 - 0.02 * Math.max(0, t - t1);
    const a1 = fade ? K.prog(t, t1, t1 + fade) : +(t >= t1), a2 = fade ? K.prog(t, t2, t2 + fade) : +(t >= t2);
    g.save(); g.translate(K.W / 2, K.H / 2); g.scale(z, z); g.translate(-K.W / 2, -K.H / 2);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.fillStyle = g.strokeStyle = ink;
    if (a1 > 0) { g.globalAlpha = 0.92 * a1; g.font = `${font} ${r1.fs}px Archivo`; g.fillText('YOU USED TO', r1.x, r1.y); }
    if (a2 > 0) {
      g.globalAlpha = 0.92 * a2; g.font = `${font} ${r2.fs}px Archivo`; g.fillText('ASK', r2.x, r2.y);
      g.lineWidth = Math.max(3, r2.fs * 0.022); g.strokeText('WHY.', r2.x2, r2.y);
    }
    g.restore();
  };

  window.K = K;
})();
