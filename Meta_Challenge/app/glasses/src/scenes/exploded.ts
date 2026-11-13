import type {Readout, Scene, Step} from './types';
import type {ExplodedLayer, ExplodedSpec} from './specs/types';
import {C, clamp, clear, glowStroke} from './util';

// Cached paths in the footprint's x/z plane: move, line, quadratic, cubic, close.
const MOVE = 0, LINE = 1, QUAD = 2, CUBIC = 3, CLOSE = 4;
type FacePath = number[];
interface Part {
  layer: ExplodedLayer;
  outline: FacePath;
  detail: FacePath;
  corners: number[];
  x: number;
  z: number;
  thickness: number;
  y: number;
  depth: number;
  focused: boolean;
}

function rounded(path: FacePath, x: number, z: number, w: number, d: number, r: number): void {
  path.push(
    MOVE, x + r, z, LINE, x + w - r, z,
    QUAD, x + w, z, x + w, z + r, LINE, x + w, z + d - r,
    QUAD, x + w, z + d, x + w - r, z + d, LINE, x + r, z + d,
    QUAD, x, z + d, x, z + d - r, LINE, x, z + r,
    QUAD, x, z, x + r, z, CLOSE,
  );
}

function circle(path: FacePath, x: number, z: number, r: number): void {
  const k = r * 0.552285;
  path.push(
    MOVE, x + r, z,
    CUBIC, x + r, z + k, x + k, z + r, x, z + r,
    CUBIC, x - k, z + r, x - r, z + k, x - r, z,
    CUBIC, x - r, z - k, x - k, z - r, x, z - r,
    CUBIC, x + k, z - r, x + r, z - k, x + r, z, CLOSE,
  );
}

function makePart(layer: ExplodedLayer, spec: ExplodedSpec): Part {
  const rect = layer.rect ?? {x: 0, y: 0, w: 1, h: 1};
  const inset = layer.inset ?? 0;
  const w = rect.w * spec.footprint.w * (1 - 2 * inset);
  const d = rect.h * spec.footprint.d * (1 - 2 * inset);
  const x = (rect.x + rect.w * inset - 0.5) * spec.footprint.w;
  const z = (rect.y + rect.h * inset - 0.5) * spec.footprint.d;
  const r = Math.min(w, d) * 0.1;
  const outline: FacePath = [];
  const detail: FacePath = [];
  rounded(outline, x, z, w, d, r);
  // At most 16 detail segments per part: <=192 even at the parser's 12-part cap.
  switch (layer.shape) {
    case 'frame':
      rounded(detail, x + w * 0.11, z + d * 0.07, w * 0.78, d * 0.86, r * 0.7);
      break;
    case 'grid':
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        detail.push(MOVE, x + w * t, z + d * 0.08, LINE, x + w * t, z + d * 0.92);
        detail.push(MOVE, x + w * 0.08, z + d * t, LINE, x + w * 0.92, z + d * t);
      }
      break;
    case 'cells':
      // Round caps turn very short strokes into a sparse pixel/dot grid.
      for (let row = 1; row <= 4; row++) {
        for (let col = 1; col <= 4; col++) {
          const cx = x + w * col / 5;
          const cz = z + d * row / 5;
          detail.push(MOVE, cx, cz, LINE, cx + w * 0.006, cz);
        }
      }
      break;
    case 'chips':
      for (let i = 0; i < 3; i++) {
        const cx = x + w * (0.12 + i * 0.29);
        const cz = z + d * (i === 0 ? 0.22 : 0.35);
        const cw = w * 0.18;
        const cd = d * (i === 0 ? 0.56 : 0.3);
        detail.push(MOVE, cx, cz, LINE, cx + cw, cz, LINE, cx + cw, cz + cd, LINE, cx, cz + cd, CLOSE);
        detail.push(MOVE, cx + cw / 2, cz + cd, LINE, cx + cw / 2, z + d * 0.9);
      }
      break;
    case 'coil':
      for (let i = 1; i <= 2; i++) {
        const t = i * 0.13;
        rounded(detail, x + w * t, z + d * t, w * (1 - 2 * t), d * (1 - 2 * t), Math.min(w, d) * 0.15);
      }
      break;
    case 'lens':
      circle(detail, x + w / 2, z + d / 2, Math.min(w, d) * 0.34);
      circle(detail, x + w / 2, z + d / 2, Math.min(w, d) * 0.18);
      break;
  }
  const c = r * 0.293;
  return {
    layer, outline, detail,
    corners: [x + c, z + c, x + w - c, z + c, x + w - c, z + d - c, x + c, z + d - c],
    x: x + w / 2, z: z + d / 2,
    thickness: layer.thickness ?? spec.footprint.d * 0.006,
    y: 0, depth: 0, focused: true,
  };
}

const depthOrder = (a: Part, b: Part): number => a.depth - b.depth;
const DEG = Math.PI / 180;

/** Perspective schematic driven entirely by serialisable object/step data. */
export class ExplodedScene implements Scene {
  private ctx: CanvasRenderingContext2D | null = null;
  private w = 0;
  private h = 0;
  private parts: Part[];
  private order: Part[];
  private readouts: Readout[] = [];
  private yaw = -25;
  private pitch = 35;
  private clock = 0;
  private explode = 0;
  private from = 0;
  private target = 0;
  private elapsed = 0.6;
  private solidHeight = 0;
  private gap: number;
  private camera: number;
  private cy = 1;
  private sy = 0;
  private cp = 1;
  private sp = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  // Projection scratch values; drawing never creates temporary point objects.
  private px = 0;
  private py = 0;

  constructor(private spec: ExplodedSpec) {
    this.parts = spec.layers.map(layer => makePart(layer, spec));
    this.order = this.parts.slice();
    for (const part of this.parts) this.solidHeight += part.thickness;
    this.gap = spec.footprint.d * 0.13;
    const fullHeight = this.solidHeight + Math.max(0, this.parts.length - 1) * this.gap;
    this.camera = 4 * Math.hypot(spec.footprint.w, spec.footprint.d, fullHeight);
    this.setStep(1);
  }

  init(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.ctx = ctx;
    this.resize(w, h);
  }

  resize(w: number, h: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
  }

  setParam(axis: 'x' | 'y', dir: -1 | 1): void {
    if (axis === 'x') this.yaw = ((this.yaw + dir * 15 + 540) % 360) - 180;
    else this.pitch = clamp(this.pitch + dir * 5, 15, 60);
  }

  setStep(step: Step): void {
    const index = Number.isFinite(step) ? clamp(Math.round(step) - 1, 0, this.spec.steps.length - 1) : 0;
    const state = this.spec.steps[index];
    if (!state) return;
    if (state.explode !== this.target) {
      this.from = this.explode;
      this.target = state.explode;
      this.elapsed = 0;
    }
    let count = 0;
    let single: ExplodedLayer | undefined;
    for (const part of this.parts) {
      part.focused = !state.focus.length || state.focus.includes(part.layer.id);
      if (state.focus.includes(part.layer.id)) {
        single = part.layer;
        count++;
      }
    }
    if (count === 1 && single) this.readouts = [{label: 'Layer', value: single.name}];
    else {
      this.readouts = [{label: 'Layers', value: String(this.parts.length)}];
      if (this.spec.thicknessLabel) this.readouts.push({label: 'Thickness', value: this.spec.thicknessLabel});
    }
  }

  param(): number {
    return this.yaw;
  }

  dispose(): void {
    this.ctx = null;
  }

  private project(x: number, y: number, z: number): void {
    const rx = x * this.cy - z * this.sy;
    const rz = x * this.sy + z * this.cy;
    const depth = rz * this.cp + y * this.sp;
    const perspective = this.camera / (this.camera - depth);
    this.px = this.ox + rx * perspective * this.scale;
    this.py = this.oy + (rz * this.sp - y * this.cp) * perspective * this.scale;
  }

  private path(ctx: CanvasRenderingContext2D, path: FacePath, y: number): void {
    let i = 0;
    while (i < path.length) {
      const command = path[i++];
      if (command === CLOSE) {
        ctx.closePath();
        continue;
      }
      this.project(path[i++], y, path[i++]);
      const x = this.px, z = this.py;
      if (command === MOVE) ctx.moveTo(x, z);
      else if (command === LINE) ctx.lineTo(x, z);
      else {
        this.project(path[i++], y, path[i++]);
        if (command === QUAD) ctx.quadraticCurveTo(x, z, this.px, this.py);
        else {
          const x2 = this.px, z2 = this.py;
          this.project(path[i++], y, path[i++]);
          ctx.bezierCurveTo(x, z, x2, z2, this.px, this.py);
        }
      }
    }
  }

  /** Project the eight bounding-box corners; perspective extrema lie at vertices. */
  private fit(height: number): void {
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      this.project(
        (i & 1 ? 0.5 : -0.5) * this.spec.footprint.w,
        (i & 2 ? 0.5 : -0.5) * height,
        (i & 4 ? 0.5 : -0.5) * this.spec.footprint.d,
      );
      minX = Math.min(minX, this.px);
      maxX = Math.max(maxX, this.px);
      minY = Math.min(minY, this.py);
      maxY = Math.max(maxY, this.py);
    }
    const margin = Math.min(22, Math.min(this.w, this.h) * 0.08);
    this.scale = Math.min((this.w - 2 * margin) / (maxX - minX), (this.h - 2 * margin) / (maxY - minY));
    this.ox = this.w / 2 - (minX + maxX) / 2 * this.scale;
    this.oy = this.h / 2 - (minY + maxY) / 2 * this.scale;
  }

  frame(dt: number): Readout[] {
    const ctx = this.ctx;
    if (!ctx) return this.readouts;
    const delta = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.clock = (this.clock + delta) % (Math.PI * 20);
    this.elapsed = Math.min(0.6, this.elapsed + delta);
    const t = this.elapsed / 0.6;
    this.explode = this.from + (this.target - this.from) * t * t * (3 - 2 * t);
    const yaw = (this.yaw + Math.sin(this.clock * 0.1) * 4) * DEG;
    this.cy = Math.cos(yaw);
    this.sy = Math.sin(yaw);
    this.cp = Math.cos(this.pitch * DEG);
    this.sp = Math.sin(this.pitch * DEG);
    const gap = this.gap * this.explode;
    const height = this.solidHeight + Math.max(0, this.parts.length - 1) * gap;
    this.fit(height);
    clear(ctx, this.w, this.h);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Quiet alignment spines at two opposite footprint corners.
    ctx.beginPath();
    for (let i = -1; i <= 1; i += 2) {
      const x = i * this.spec.footprint.w * 0.46;
      const z = i * this.spec.footprint.d * 0.48;
      this.project(x, -height / 2, z);
      ctx.moveTo(this.px, this.py);
      this.project(x, height / 2, z);
      ctx.lineTo(this.px, this.py);
    }
    ctx.strokeStyle = C.white;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    let top = height / 2;
    for (const part of this.parts) {
      part.y = top;
      const middle = top - part.thickness / 2;
      part.depth = (part.x * this.sy + part.z * this.cy) * this.cp + middle * this.sp;
      top -= part.thickness + gap;
    }
    this.order.sort(depthOrder);
    for (const part of this.order) {
      const color = C[part.layer.color];
      const brightness = part.focused ? 1 : 0.25;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = brightness * 0.5;
      ctx.beginPath();
      this.path(ctx, part.outline, part.y - part.thickness);
      for (let i = 0; i < part.corners.length; i += 2) {
        this.project(part.corners[i], part.y - part.thickness, part.corners[i + 1]);
        ctx.moveTo(this.px, this.py);
        this.project(part.corners[i], part.y, part.corners[i + 1]);
        ctx.lineTo(this.px, this.py);
      }
      ctx.stroke();

      ctx.beginPath();
      this.path(ctx, part.outline, part.y);
      if (part.layer.shape === 'frame') this.path(ctx, part.detail, part.y);
      ctx.globalAlpha = brightness * 0.035;
      ctx.fill('evenodd');
      ctx.globalAlpha = brightness;
      if (part.focused) glowStroke(ctx, color, 1.4);
      else {
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      if (part.layer.shape !== 'frame' && part.detail.length) {
        ctx.beginPath();
        this.path(ctx, part.detail, part.y);
        ctx.lineWidth = part.layer.shape === 'cells' ? 2 : 1.1;
        ctx.stroke();
      }
    }
    ctx.restore();
    return this.readouts;
  }
}
