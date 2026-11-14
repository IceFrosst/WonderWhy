// Explore lens renderer (MODEL3D.md): builds a three.js scene from a chapter spec and renders any
// (beat, time) deterministically. Driven by render.mjs through window.R3D.
import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {buildGeometry, curveThrough, edgeData, visibleEdges} from './geometry.js';
import {drawCard} from './overlay.js';

export const SIZE = 600;
export const STAGE = {top: 36, bottom: 500};
export const FPS = 30;
export const MOVE = 0.8;
const FOV = 26;
const FILL_FRACTION = 0.7;

export const ROLE = {
  object: '#ffffff',
  actor: '#4df0ff',
  energy: '#ffc247',
  loss: '#ff8a4d',
  answer: '#6dff9c',
  other: '#ff7ad9',
};
const SOFT = '#c9d4ff';

// The look. Everything that sets brightness lives here.
const LOOK = {
  solid: {edge: 0.82, width: 2.0, fill: 0.006, rim: 0.08, role: true},
  focus: {edge: 1.0, width: 2.6, fill: 0.018, rim: 0.12, role: true},
  dim: {edge: 0.16, width: 1.3, fill: 0.0, rim: 0.03, role: false},
  ghost: {edge: 0.26, width: 1.4, fill: 0.0, rim: 0.05, role: false},
  hidden: 0.08, // lines and fills behind a solid part
  depthFade: 0.6, // far side of the model is this much dimmer
  bloom: {strength: 0.9, radius: 0.0, threshold: 0.04, factors: [1.0, 0.3, 0.06, 0.0, 0.0]},
};

const finite = value => typeof value === 'number' && Number.isFinite(value);
const num = (value, fallback) => (finite(value) ? value : fallback);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const vec3 = (value, fallback = [0, 0, 0]) =>
  Array.isArray(value) && value.length === 3 && value.every(finite) ? value : fallback;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const cycles = (rate, period) => Math.max(1, Math.round(Math.abs(rate) * period));

function linear(hex) {
  return new THREE.Color(hex); // converted to linear by ColorManagement
}
const ROLE_LINEAR = Object.fromEntries(Object.entries(ROLE).map(([k, v]) => [k, linear(v)]));
const WHITE = linear('#ffffff');
const SOFT_LINEAR = linear(SOFT);
const roleColor = role => ROLE_LINEAR[role] ?? WHITE;

// Keep the caption band (bottom) and the top line mostly clear so text over the video stays legible.
const BAND_MASK = {
  uniforms: {tDiffuse: {value: null}},
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      float y = (1.0 - vUv.y) * ${SIZE.toFixed(1)};
      float bottom = mix(1.0, 0.16, smoothstep(${(STAGE.bottom - 12).toFixed(1)}, ${(STAGE.bottom + 40).toFixed(1)}, y));
      float top = mix(0.3, 1.0, smoothstep(18.0, ${(STAGE.top + 8).toFixed(1)}, y));
      gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * bottom * top, 1.0);
    }
  `,
};

// ---------------------------------------------------------------------------------------------
// Line batches: fixed-capacity instanced segments, rewritten every frame.

class LineBatch {
  constructor(scene, capacity = 512) {
    this.scene = scene;
    this.objects = [];
    this.n = 0;
    this.alloc(capacity);
  }

  alloc(capacity) {
    const old = this.geometry;
    const pos = new Float32Array(capacity * 6);
    const col = new Float32Array(capacity * 6);
    if (old) {
      pos.set(this.pos.subarray(0, this.n * 6));
      col.set(this.col.subarray(0, this.n * 6));
    }
    this.capacity = capacity;
    this.pos = pos;
    this.col = col;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(pos);
    geometry.setColors(col);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.geometry = geometry;
    for (const object of this.objects) object.geometry = geometry;
    if (old) old.dispose();
  }

  addMaterial(material, renderOrder) {
    const object = new LineSegments2(this.geometry, material);
    object.frustumCulled = false;
    object.renderOrder = renderOrder;
    this.scene.add(object);
    this.objects.push(object);
    return object;
  }

  begin() {
    this.n = 0;
  }

  push(ax, ay, az, bx, by, bz, r1, g1, b1, r2 = r1, g2 = g1, b2 = b1) {
    if (this.n >= this.capacity) this.alloc(this.capacity * 2);
    const i = this.n * 6;
    const p = this.pos;
    const c = this.col;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az; p[i + 3] = bx; p[i + 4] = by; p[i + 5] = bz;
    c[i] = r1; c[i + 1] = g1; c[i + 2] = b1; c[i + 3] = r2; c[i + 4] = g2; c[i + 5] = b2;
    this.n++;
  }

  commit() {
    this.geometry.instanceCount = this.n;
    this.geometry.attributes.instanceStart.data.needsUpdate = true;
    this.geometry.attributes.instanceColorStart.data.needsUpdate = true;
    for (const object of this.objects) object.visible = this.n > 0;
  }
}

function lineMaterial(width, options = {}) {
  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: width,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: options.depthTest ?? true,
    // Max blending: overlapping round caps of consecutive segments do not bead, and where two
    // lines cross the brighter one wins instead of the sum.
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    worldUnits: false,
  });
  material.resolution.set(SIZE, SIZE);
  if (options.depthFunc !== undefined) material.depthFunc = options.depthFunc;
  if (options.stencilRef !== undefined) stencilTest(material, options.stencilRef);
  return material;
}

function stencilTest(material, ref) {
  material.stencilWrite = true;
  material.stencilWriteMask = 0x00;
  material.stencilFunc = THREE.EqualStencilFunc;
  material.stencilRef = ref;
  material.stencilFuncMask = 0xff;
  material.stencilFail = THREE.KeepStencilOp;
  material.stencilZFail = THREE.KeepStencilOp;
  material.stencilZPass = THREE.KeepStencilOp;
}

const FILL_VERTEX = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const FILL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFill;
  uniform float uRim;
  uniform float uOpacity;
  uniform float uNear;
  uniform float uFar;
  uniform float uDepthFade;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float d = length(vV);
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - ndv, 3.0);
    float fade = 1.0 - uDepthFade * clamp((d - uNear) / max(1e-4, uFar - uNear), 0.0, 1.0);
    gl_FragColor = vec4(uColor * (uFill + uRim * rim) * fade * uOpacity, 1.0);
  }
`;

function fillMaterial(options = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: {value: new THREE.Color(1, 1, 1)},
      uFill: {value: 0},
      uRim: {value: 0},
      uOpacity: {value: 1},
      uNear: {value: 0},
      uFar: {value: 1},
      uDepthFade: {value: LOOK.depthFade},
    },
    vertexShader: FILL_VERTEX,
    fragmentShader: FILL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  if (options.depthFunc !== undefined) material.depthFunc = options.depthFunc;
  if (options.stencilRef !== undefined) stencilTest(material, options.stencilRef);
  return material;
}

function prepassMaterial() {
  return new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 2.5,
    polygonOffsetUnits: 4,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
  });
}

const POINT_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vC;
  void main() {
    vC = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize;
  }
`;
const POINT_FRAGMENT = /* glsl */ `
  varying vec3 vC;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(1.0, 0.45, r);
    float halo = smoothstep(1.0, 0.0, r) * 0.35;
    gl_FragColor = vec4(vC * (core + halo), 1.0);
  }
`;

class PointBatch {
  constructor(scene, capacity = 512) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: POINT_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 4;
    scene.add(this.object);
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  push(x, y, z, r, g, b, size) {
    if (this.n >= this.capacity) return;
    const i = this.n;
    this.pos.set([x, y, z], i * 3);
    this.col.set([r, g, b], i * 3);
    this.size[i] = size;
    this.n++;
  }

  commit() {
    for (const name of ['position', 'aColor', 'aSize']) this.geometry.attributes[name].needsUpdate = true;
    this.geometry.setDrawRange(0, this.n);
    this.object.visible = this.n > 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Spec normalisation (tolerant: unknown prims and fx are skipped, unknown ids ignored).

function normalise(spec) {
  const warnings = [];
  const parts = [];
  const ids = new Set();
  const sourceParts = Array.isArray(spec?.parts) ? spec.parts.slice(0, 32) : [];
  for (const raw of sourceParts) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || ids.has(raw.id)) continue;
    const geometry = buildGeometry(raw);
    if (!geometry) {
      warnings.push(`part ${raw.id}: unknown or invalid prim ${raw.prim}`);
      continue;
    }
    const scale = Array.isArray(raw.scale) ? vec3(raw.scale, [1, 1, 1]) : Array(3).fill(num(raw.scale, 1));
    const anim = raw.anim && typeof raw.anim === 'object' ? raw.anim : null;
    parts.push({
      id: raw.id,
      label: typeof raw.label === 'string' ? raw.label : raw.id,
      prim: raw.prim,
      role: ROLE[raw.role] ? raw.role : 'object',
      pos: new THREE.Vector3(...vec3(raw.pos)),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(...vec3(raw.rot).map(v => v * DEG), 'XYZ')),
      scale: new THREE.Vector3(...scale),
      explode: new THREE.Vector3(...vec3(raw.explode)),
      parent: typeof raw.parent === 'string' ? raw.parent : null,
      anim: normaliseAnim(anim),
      geometry,
      edges: edgeData(geometry),
    });
    ids.add(raw.id);
  }
  for (const part of parts) if (part.parent && !ids.has(part.parent)) part.parent = null;

  const idList = (value, max = 32) =>
    Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && ids.has(id)))].slice(0, max) : [];
  const beats = (Array.isArray(spec?.beats) ? spec.beats.slice(0, 6) : []).map((raw, index) => {
    const camera = raw?.camera ?? {};
    let target = null;
    if (typeof camera.target === 'string' && ids.has(camera.target)) target = camera.target;
    else if (Array.isArray(camera.target)) target = vec3(camera.target, null);
    const fx = (Array.isArray(raw?.fx) ? raw.fx.slice(0, 4) : []).filter(item => {
      const known = item && ['arrow', 'flow', 'heat', 'waves', 'trail', 'dim'].includes(item.type);
      if (!known) warnings.push(`beat ${index + 1}: unknown fx ${item?.type}`);
      return known;
    });
    return {
      index,
      yaw: num(camera.yaw, 30),
      pitch: clamp(num(camera.pitch, 20), -89, 89),
      zoom: clamp(num(camera.zoom, 1), 0.3, 6),
      target,
      turn: clamp(num(raw?.turn, 0), 0, 20),
      explode: clamp(num(raw?.explode, 0), 0, 1),
      focus: new Set(idList(raw?.focus)),
      ghost: new Set(idList(raw?.ghost)),
      labels: idList(raw?.labels, 3),
      play: new Set(idList(raw?.play)),
      fx,
      number: raw?.number && typeof raw.number === 'object' ? raw.number : null,
      dur: clamp(num(raw?.dur, 6), 3, 12),
    };
  });
  return {parts, beats, warnings};
}

function normaliseAnim(anim) {
  if (!anim) return null;
  for (const kind of ['spin', 'swing', 'shake']) {
    const source = anim[kind];
    if (!source || typeof source !== 'object') continue;
    const axis = new THREE.Vector3(...vec3(source.axis, [0, 1, 0]));
    if (axis.lengthSq() < 1e-12) continue;
    axis.normalize();
    if (kind === 'spin') return {kind, axis, rpm: num(source.rpm, 30)};
    if (kind === 'swing') return {kind, axis, deg: num(source.deg, 20), hz: Math.max(0.05, num(source.hz, 0.5))};
    return {kind, axis, amp: num(source.amp, 0.3), hz: Math.max(0.05, num(source.hz, 4))};
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The renderer.

class Explore {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.setClearColor(0x000000, 1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 5000);
    const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      type: THREE.HalfFloatType,
      samples: 4,
      stencilBuffer: true,
      depthBuffer: true,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setPixelRatio(1);
    this.composer.setSize(SIZE, SIZE);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const {strength, radius, threshold} = LOOK.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(SIZE, SIZE), strength, radius, threshold);
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = LOOK.bloom.factors;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(BAND_MASK));
    this.composer.addPass(new OutputPass());
  }

  info() {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      webgl2: this.renderer.capabilities.isWebGL2,
    };
  }

  load(spec) {
    this.clear();
    const {parts, beats, warnings} = normalise(spec);
    this.parts = parts;
    this.byId = new Map(parts.map(part => [part.id, part]));
    this.beats = beats;
    this.fxCache = new Map();
    for (const part of parts) {
      part.prepass = new THREE.Mesh(part.geometry, prepassMaterial());
      part.fills = [fillMaterial(), ...[1, 2, 3].map(ref => fillMaterial({depthFunc: THREE.GreaterDepth, stencilRef: ref}))].map(
        material => {
          const mesh = new THREE.Mesh(part.geometry, material);
          mesh.renderOrder = 1;
          return mesh;
        },
      );
      for (const mesh of [part.prepass, ...part.fills]) {
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
      }
      part.batch = new LineBatch(this.scene, 256);
      part.lineMaterials = [
        lineMaterial(2),
        ...[1, 2, 3].map(ref => lineMaterial(2, {depthFunc: THREE.GreaterDepth, stencilRef: ref})),
      ];
      for (const material of part.lineMaterials) part.batch.addMaterial(material, 2);
      part.restMatrix = new THREE.Matrix4().compose(part.pos, part.quat, part.scale);
      part.restInverse = part.restMatrix.clone().invert();
      part.scratchEdges = [];
    }
    this.fxThin = new LineBatch(this.scene, 512);
    this.fxThin.addMaterial(lineMaterial(1.3, {depthTest: false}), 3);
    this.fxMid = new LineBatch(this.scene, 512);
    this.fxMid.addMaterial(lineMaterial(2.4, {depthTest: false}), 3);
    this.fxWide = new LineBatch(this.scene, 512);
    this.fxWide.addMaterial(lineMaterial(7, {depthTest: false}), 3);
    this.points = new PointBatch(this.scene, 1024);
    this.arrowMeshes = [];

    // Bounding sphere of the assembled model.
    const worlds = this.partWorlds(() => null, 0);
    const points = [];
    const v = new THREE.Vector3();
    for (const part of parts) {
      const verts = part.edges.verts;
      const step = Math.max(1, Math.floor(verts.length / 3 / 600));
      for (let i = 0; i < verts.length / 3; i += step) points.push(v.fromArray(verts, i * 3).applyMatrix4(worlds.get(part.id)).clone());
    }
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    let radius = 0;
    for (const point of points) radius = Math.max(radius, point.distanceTo(center));
    this.sphere = new THREE.Sphere(center, radius || 1);

    this.rest = beats.map(beat => this.restState(beat));
    return {parts: parts.length, beats: beats.length, warnings, radius: this.sphere.radius};
  }

  clear() {
    for (const child of [...this.scene.children]) {
      this.scene.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    for (const part of this.parts ?? []) part.geometry.dispose();
  }

  // ----- transforms

  /** World matrices of every part for an explode amount and an anim function (part -> {angle, offset} | null). */
  partWorlds(animOf, explode) {
    const out = new Map();
    const visiting = new Set();
    const tmpQ = new THREE.Quaternion();
    const resolve = part => {
      if (out.has(part.id)) return out.get(part.id);
      if (visiting.has(part.id)) return part.restMatrix;
      visiting.add(part.id);
      const position = part.pos.clone().addScaledVector(part.explode, explode);
      const quat = part.quat.clone();
      const anim = part.anim ? animOf(part) : null;
      if (anim) {
        if (anim.angle) quat.premultiply(tmpQ.setFromAxisAngle(part.anim.axis, anim.angle));
        if (anim.offset) position.addScaledVector(part.anim.axis, anim.offset);
      }
      let matrix = new THREE.Matrix4().compose(position, quat, part.scale);
      if (part.parent && this.byId.has(part.parent)) {
        const parent = this.byId.get(part.parent);
        const delta = resolve(parent).clone().multiply(parent.restInverse);
        matrix = delta.multiply(matrix);
      }
      out.set(part.id, matrix);
      visiting.delete(part.id);
      return matrix;
    };
    for (const part of this.parts) resolve(part);
    return out;
  }

  partCenter(id, worlds) {
    const part = this.byId.get(id);
    const box = part.geometry.boundingBox.clone().applyMatrix4(worlds.get(id));
    return box.getCenter(new THREE.Vector3());
  }

  lookOf(beat, part) {
    let kind;
    if (beat.focus.size) kind = beat.focus.has(part.id) ? 'focus' : 'dim';
    else kind = beat.ghost.has(part.id) ? 'ghost' : 'solid';
    const base = LOOK[kind];
    let color = base.role ? roleColor(part.role) : WHITE;
    if (kind === 'focus' && beat.number) color = ROLE_LINEAR.answer;
    return {kind, color: color.clone(), edge: base.edge, width: base.width, fill: base.fill, rim: base.rim, occluder: kind === 'solid'};
  }

  restState(beat) {
    const worlds = this.partWorlds(() => null, beat.explode);
    let target;
    if (typeof beat.target === 'string') target = this.partCenter(beat.target, worlds);
    else if (Array.isArray(beat.target)) target = new THREE.Vector3(...beat.target);
    else target = this.sphere.center.clone();
    const halfFov = (FOV * DEG) / 2;
    const stageHeight = STAGE.bottom - STAGE.top;
    const dist = (this.sphere.radius * SIZE) / (FILL_FRACTION * stageHeight * beat.zoom * Math.tan(halfFov));
    const looks = new Map(this.parts.map(part => [part.id, this.lookOf(beat, part)]));
    const occluders = new Set(this.parts.filter(part => looks.get(part.id).occluder).map(part => part.id));
    return {cam: {yaw: beat.yaw, pitch: beat.pitch, dist, target}, looks, occluders};
  }

  // ----- timing

  plan(b) {
    const beat = this.beats[b];
    const end = MOVE + beat.dur;
    return {dur: Number(end.toFixed(3)), loopFrom: MOVE, frames: Math.round(end * FPS), loopFrame: Math.round(MOVE * FPS), beatDur: beat.dur};
  }

  /** Everything about the frame at clip time t of beat b, without drawing. */
  frameState(b, t, withCamera = true) {
    const beat = this.beats[b];
    const prevBeat = b > 0 ? this.beats[b - 1] : null;
    const cur = this.rest[b];
    const prev = b > 0 ? this.rest[b - 1] : null;
    const ramp = ease(clamp(t / MOVE, 0, 1));
    const L = beat.dur;

    // Camera: eased move from the previous beat's rest pose, then a slow back-and-forth turn.
    const from = prev
      ? prev.cam
      : {yaw: cur.cam.yaw + 24, pitch: cur.cam.pitch + 6, dist: cur.cam.dist * 1.12, target: cur.cam.target};
    let yaw = lerp(from.yaw, cur.cam.yaw, ramp);
    if (t > MOVE && beat.turn > 0) {
      const amplitude = (beat.turn * L) / Math.PI; // peak speed = turn deg/s
      yaw += (amplitude * (1 - Math.cos((TAU * (t - MOVE)) / L))) / 2;
    }
    const pitch = lerp(from.pitch, cur.cam.pitch, ramp);
    const dist = Math.exp(lerp(Math.log(from.dist), Math.log(cur.cam.dist), ramp));
    const target = from.target.clone().lerp(cur.cam.target, ramp);
    const explode = lerp(prevBeat ? prevBeat.explode : beat.explode, beat.explode, ramp);

    // Anims: the current beat's play list fades in, the previous one fades out.
    const animOf = part => {
      let angle = 0;
      let offset = 0;
      const add = (source, weight, tau, period) => {
        if (!source || weight <= 0 || !source.play.has(part.id)) return;
        const a = part.anim;
        if (a.kind === 'spin') {
          const revs = Math.sign(a.rpm || 1) * cycles(a.rpm / 60, period);
          angle += weight * TAU * revs * (tau / period);
        } else if (a.kind === 'swing') {
          angle += weight * a.deg * DEG * Math.sin((TAU * cycles(a.hz, period) * tau) / period);
        } else {
          offset += weight * a.amp * Math.sin((TAU * cycles(a.hz, period) * tau) / period);
        }
      };
      add(beat, ramp, t - MOVE, L);
      if (prevBeat) add(prevBeat, 1 - ramp, t, prevBeat.dur);
      return angle || offset ? {angle, offset} : null;
    };
    const worlds = this.partWorlds(animOf, explode);
    const shake = new Map();
    for (const part of this.parts) {
      if (part.anim?.kind !== 'shake') continue;
      const weight = (beat.play.has(part.id) ? ramp : 0) + (prevBeat?.play.has(part.id) ? 1 - ramp : 0);
      if (weight > 0.01) shake.set(part.id, weight * part.anim.amp);
    }

    // Looks.
    const looks = new Map();
    for (const part of this.parts) {
      const a = (prev ?? cur).looks.get(part.id);
      const c = cur.looks.get(part.id);
      looks.set(part.id, {
        color: a.color.clone().lerp(c.color, ramp),
        edge: lerp(a.edge, c.edge, ramp),
        width: lerp(a.width, c.width, ramp),
        fill: lerp(a.fill, c.fill, ramp),
        rim: lerp(a.rim, c.rim, ramp),
      });
    }
    const prevOcc = (prev ?? cur).occluders;
    const occClass = new Map();
    for (const part of this.parts) {
      const inPrev = prevOcc.has(part.id);
      const inCur = cur.occluders.has(part.id);
      if (t >= MOVE) {
        if (inCur) occClass.set(part.id, 1);
      } else if (inPrev && inCur) occClass.set(part.id, 1);
      else if (inPrev) occClass.set(part.id, 2);
      else if (inCur) occClass.set(part.id, 3);
    }
    const hiddenOpacity = [0, LOOK.hidden, lerp(LOOK.hidden, 1, ramp), lerp(1, LOOK.hidden, ramp)];

    // Effects.
    const fx = [];
    beat.fx.forEach((item, i) => fx.push({item, key: `${b}:${i}`, weight: ramp, tau: t - MOVE, period: L, beat}));
    if (prevBeat && ramp < 0.999) {
      prevBeat.fx.forEach((item, i) => fx.push({item, key: `${b - 1}:${i}`, weight: 1 - ramp, tau: t, period: prevBeat.dur, beat: prevBeat}));
    }

    if (!withCamera) return {worlds};
    // Camera matrices.
    const camera = this.camera;
    const dir = new THREE.Vector3(Math.sin(yaw * DEG) * Math.cos(pitch * DEG), Math.sin(pitch * DEG), Math.cos(yaw * DEG) * Math.cos(pitch * DEG));
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    const offsetY = SIZE / 2 - (STAGE.top + STAGE.bottom) / 2;
    camera.setViewOffset(SIZE, SIZE, 0, offsetY, SIZE, SIZE);
    camera.near = Math.max(0.01, dist - this.sphere.radius * 4);
    camera.far = dist + this.sphere.radius * 6;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const centerDist = camera.position.distanceTo(this.sphere.center);
    return {
      b, t, ramp, worlds, looks, occClass, hiddenOpacity, fx, shake, animOf, explode,
      near: centerDist - this.sphere.radius,
      far: centerDist + this.sphere.radius,
    };
  }

  // ----- drawing

  fade(state, x, y, z) {
    const d = Math.hypot(x - this.camera.position.x, y - this.camera.position.y, z - this.camera.position.z);
    return 1 - LOOK.depthFade * clamp((d - state.near) / Math.max(1e-6, state.far - state.near), 0, 1);
  }

  /** Push a part's visible edges (in world space) into a batch with a colour. */
  pushPartEdges(state, part, batch, color, intensity, offset = null) {
    const world = state.worlds.get(part.id);
    const inverse = world.clone().invert();
    const eye = this.camera.position.clone().applyMatrix4(inverse);
    const list = visibleEdges(part.edges, eye, part.scratchEdges);
    const e = world.elements;
    const ox = offset ? offset.x : 0;
    const oy = offset ? offset.y : 0;
    const oz = offset ? offset.z : 0;
    for (let k = 0; k < list.length; k += 6) {
      const x1 = list[k], y1 = list[k + 1], z1 = list[k + 2], x2 = list[k + 3], y2 = list[k + 4], z2 = list[k + 5];
      const ax = e[0] * x1 + e[4] * y1 + e[8] * z1 + e[12] + ox;
      const ay = e[1] * x1 + e[5] * y1 + e[9] * z1 + e[13] + oy;
      const az = e[2] * x1 + e[6] * y1 + e[10] * z1 + e[14] + oz;
      const bx = e[0] * x2 + e[4] * y2 + e[8] * z2 + e[12] + ox;
      const by = e[1] * x2 + e[5] * y2 + e[9] * z2 + e[13] + oy;
      const bz = e[2] * x2 + e[6] * y2 + e[10] * z2 + e[14] + oz;
      const fa = intensity * this.fade(state, ax, ay, az);
      const fb = intensity * this.fade(state, bx, by, bz);
      batch.push(ax, ay, az, bx, by, bz, color.r * fa, color.g * fa, color.b * fa, color.r * fb, color.g * fb, color.b * fb);
    }
  }

  draw(state) {
    const heat = this.heatWeights(state);
    for (const part of this.parts) {
      const look = state.looks.get(part.id);
      const world = state.worlds.get(part.id);
      const h = heat.get(part.id);
      let color = look.color;
      let edge = look.edge;
      let fill = look.fill;
      let rim = look.rim;
      if (h) {
        const shimmer = 0.85 + 0.15 * Math.sin((TAU * cycles(0.8, h.period) * h.tau) / h.period);
        color = look.color.clone().lerp(roleColor(h.role), h.weight);
        edge = lerp(edge, Math.max(edge, 1.0), h.weight);
        fill += 0.02 * h.weight * shimmer;
        rim += 0.1 * h.weight * shimmer;
      }
      // Fills.
      for (let k = 0; k < part.fills.length; k++) {
        const mesh = part.fills[k];
        mesh.matrix.copy(world);
        mesh.matrixWorldNeedsUpdate = true;
        const u = mesh.material.uniforms;
        u.uColor.value.copy(color);
        u.uFill.value = fill;
        u.uRim.value = rim;
        u.uOpacity.value = k === 0 ? 1 : state.hiddenOpacity[k];
        u.uNear.value = state.near;
        u.uFar.value = state.far;
        mesh.visible = fill + rim > 1e-4 && (k === 0 || state.hiddenOpacity[k] > 1e-3);
      }
      // Depth prepass for solid parts.
      const occ = state.occClass.get(part.id);
      part.prepass.visible = Boolean(occ);
      if (occ) {
        part.prepass.matrix.copy(world);
        part.prepass.matrixWorldNeedsUpdate = true;
        part.prepass.material.stencilRef = occ;
      }
      // Edges (plus faint motion ghosts when shaking).
      part.batch.begin();
      this.pushPartEdges(state, part, part.batch, color, edge);
      const amp = state.shake.get(part.id);
      if (amp) {
        const axis = part.anim.axis.clone().transformDirection(world);
        for (const s of [-1, 1]) this.pushPartEdges(state, part, part.batch, color, edge * 0.22, axis.clone().multiplyScalar(s * amp));
      }
      part.batch.commit();
      part.lineMaterials.forEach((material, k) => {
        material.linewidth = look.width;
        material.color.setScalar(k === 0 ? 1 : state.hiddenOpacity[k]);
      });
    }
    this.drawFx(state, heat);
    this.drawAnswerGlow(state);
    this.fxWide.commit();
    this.composer.render();
  }

  /** On a beat with a number, the focus parts breathe a soft green halo (the answer). */
  drawAnswerGlow(state) {
    const beat = this.beats[state.b];
    const prevBeat = state.b > 0 ? this.beats[state.b - 1] : null;
    const add = (source, weight, tau, period) => {
      if (!source?.number || weight < 0.002) return;
      const breathe = 0.6 + 0.4 * (0.5 - 0.5 * Math.cos((TAU * cycles(0.5, period) * tau) / period));
      for (const id of source.focus) {
        const part = this.byId.get(id);
        if (part) this.pushPartEdges(state, part, this.fxWide, ROLE_LINEAR.answer, 0.12 * weight * breathe);
      }
    };
    add(beat, state.ramp, state.t - MOVE, beat.dur);
    if (prevBeat) add(prevBeat, 1 - state.ramp, state.t, prevBeat.dur);
  }

  heatWeights(state) {
    const out = new Map();
    for (const entry of state.fx) {
      if (entry.item.type !== 'heat' || !this.byId.has(entry.item.on)) continue;
      const role = entry.item.role === 'loss' ? 'loss' : 'energy';
      const old = out.get(entry.item.on);
      if (!old || old.weight < entry.weight) out.set(entry.item.on, {weight: entry.weight, role, tau: entry.tau, period: entry.period});
    }
    return out;
  }

  // ----- effects

  refPoint(state, ref) {
    if (typeof ref === 'string' && this.byId.has(ref)) return this.partCenter(ref, state.worlds);
    const v = vec3(ref, null);
    return v ? new THREE.Vector3(...v) : null;
  }

  drawFx(state, heat) {
    this.fxThin.begin();
    this.fxMid.begin();
    this.fxWide.begin();
    this.points.begin();
    let arrows = 0;
    for (const entry of state.fx) {
      const {item, weight} = entry;
      if (weight < 0.002) continue;
      if (item.type === 'flow') this.fxFlow(state, entry);
      else if (item.type === 'heat') this.fxHeat(state, entry);
      else if (item.type === 'waves') this.fxWaves(state, entry);
      else if (item.type === 'trail') this.fxTrail(state, entry);
      else if (item.type === 'dim') this.fxDim(state, entry);
      else if (item.type === 'arrow') arrows = this.fxArrow(state, entry, arrows);
    }
    for (let i = arrows; i < this.arrowMeshes.length; i++) this.arrowMeshes[i].visible = false;
    this.fxThin.commit();
    this.fxMid.commit();
    this.fxWide.commit();
    this.points.commit();
  }

  flowData(entry) {
    let data = this.fxCache.get(entry.key);
    if (data) return data;
    const path = (Array.isArray(entry.item.path) ? entry.item.path : []).filter(p => Array.isArray(p) && p.length === 3 && p.every(finite)).slice(0, 64);
    if (path.length < 2) return null;
    const closed = entry.item.closed === true && path.length > 2;
    const curve = curveThrough(path, closed);
    const length = curve.getLength();
    const samples = curve.getSpacedPoints(400);
    const count = clamp(Math.round(num(entry.item.count, 6)), 1, 40);
    const spacing = length / count;
    const speed = Math.max(1e-6, num(entry.item.speed, length / 4));
    // Quantise the speed so the particle pattern repeats exactly once per loop.
    const steps = Math.max(1, Math.round((speed * entry.period) / spacing));
    const loopSpeed = (steps * spacing) / entry.period;
    data = {curve, closed, length, samples, count, loopSpeed, tail: Math.min(spacing * 0.55, length * 0.16, this.sphere.radius * 0.22)};
    this.fxCache.set(entry.key, data);
    return data;
  }

  sampleAt(data, u) {
    const n = data.samples.length - 1;
    const x = clamp(u, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(x));
    return data.samples[i].clone().lerp(data.samples[i + 1], x - i);
  }

  fxFlow(state, entry) {
    const data = this.flowData(entry);
    if (!data) return;
    const color = roleColor(entry.item.role ?? 'actor');
    const w = entry.weight;
    const endFade = u => (data.closed ? 1 : clamp(u / 0.06, 0, 1) * clamp((1 - u) / 0.06, 0, 1));
    // Faint guide of the whole path.
    for (let i = 0; i < data.samples.length - 1; i += 2) {
      const a = data.samples[i];
      const c = data.samples[Math.min(data.samples.length - 1, i + 2)];
      const u = i / (data.samples.length - 1);
      const k = 0.16 * w * endFade(u) * this.fade(state, a.x, a.y, a.z);
      this.fxThin.push(a.x, a.y, a.z, c.x, c.y, c.z, color.r * k, color.g * k, color.b * k);
    }
    const travelled = data.loopSpeed * entry.tau;
    const tailSteps = 10;
    for (let p = 0; p < data.count; p++) {
      let s = (p / data.count) * data.length + travelled;
      s = ((s % data.length) + data.length) % data.length;
      const u = s / data.length;
      const head = this.sampleAt(data, u);
      const f = w * endFade(u) * this.fade(state, head.x, head.y, head.z);
      this.points.push(head.x, head.y, head.z, color.r * f, color.g * f, color.b * f, 9);
      let prev = head;
      for (let k = 1; k <= tailSteps; k++) {
        let su = s - (data.tail * k) / tailSteps;
        if (!data.closed && su < 0) break;
        su = ((su % data.length) + data.length) % data.length;
        const point = this.sampleAt(data, su / data.length);
        const a = f * Math.pow(1 - (k - 1) / tailSteps, 1.6) * 0.95;
        const c = f * Math.pow(1 - k / tailSteps, 1.6) * 0.95;
        this.fxMid.push(prev.x, prev.y, prev.z, point.x, point.y, point.z, color.r * a, color.g * a, color.b * a, color.r * c, color.g * c, color.b * c);
        prev = point;
      }
    }
  }

  heatData(entry, part) {
    let data = this.fxCache.get(entry.key);
    if (data) return data;
    // Wisp roots: vertices on the upper side of the part, spread around its centre.
    const verts = part.edges.verts;
    const box = part.geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const candidates = [];
    for (let i = 0; i < verts.length; i += 3) {
      const v = new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2]);
      candidates.push(v);
    }
    const roots = [];
    const n = 7;
    for (let k = 0; k < n; k++) {
      const angle = (k / n) * TAU + 0.4;
      let best = null;
      let bestScore = -Infinity;
      for (const v of candidates) {
        const a = Math.atan2(v.z - center.z, v.x - center.x);
        const da = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
        const score = -da * 3 + (v.y - center.y) / Math.max(1e-6, box.max.y - box.min.y + 1e-6);
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (best) roots.push(best.clone());
    }
    data = {roots};
    this.fxCache.set(entry.key, data);
    return data;
  }

  fxHeat(state, entry) {
    const part = this.byId.get(entry.item.on);
    if (!part) return;
    const color = roleColor(entry.item.role === 'loss' ? 'loss' : 'energy');
    const w = entry.weight;
    const P = entry.period;
    // Halo: the part's own edges again, wide and faint, breathing slowly.
    const breathe = 0.75 + 0.25 * Math.sin((TAU * cycles(0.5, P) * entry.tau) / P);
    this.pushPartEdges(state, part, this.fxWide, color, 0.07 * w * breathe);
    // Shimmer: short wavy wisps rising from the part.
    const data = this.heatData(entry, part);
    const world = state.worlds.get(part.id);
    const rise = this.sphere.radius * 0.2;
    const segs = 8;
    const rate = cycles(0.7, P) / P;
    data.roots.forEach((root, k) => {
      const base = root.clone().applyMatrix4(world);
      const phase = (((entry.tau * rate + k / data.roots.length) % 1) + 1) % 1;
      const head = phase * rise * 1.4;
      const len = rise * 0.45;
      let prev = null;
      for (let s = 0; s <= segs; s++) {
        const h = head - len + (len * s) / segs;
        if (h < 0 || h > rise) {
          prev = null;
          continue;
        }
        const sway = Math.sin(h / rise * Math.PI * 2.2 + k * 1.7) * rise * 0.07;
        const point = new THREE.Vector3(base.x + sway, base.y + h, base.z + sway * 0.5);
        const life = Math.sin((h / rise) * Math.PI);
        const a = 0.7 * w * life * (s / segs);
        if (prev) this.fxMid.push(prev.p.x, prev.p.y, prev.p.z, point.x, point.y, point.z, color.r * prev.a, color.g * prev.a, color.b * prev.a, color.r * a, color.g * a, color.b * a);
        prev = {p: point, a};
      }
    });
  }

  fxWaves(state, entry) {
    const center = this.refPoint(state, entry.item.at);
    if (!center) return;
    const color = roleColor(entry.item.role ?? 'actor');
    const P = entry.period;
    const rate = cycles(num(entry.item.hz, 1), P) / P;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const maxR = this.sphere.radius * 0.45;
    for (let ring = 0; ring < 3; ring++) {
      const f = (((entry.tau * rate + ring / 3) % 1) + 1) % 1;
      const r = maxR * (0.08 + 0.92 * f);
      const a = entry.weight * Math.pow(1 - f, 1.4) * clamp(f / 0.08, 0, 1) * 0.9;
      const n = 56;
      for (let i = 0; i < n; i++) {
        const p = center.clone().addScaledVector(right, r * Math.cos((i / n) * TAU)).addScaledVector(up, r * Math.sin((i / n) * TAU));
        const q = center.clone().addScaledVector(right, r * Math.cos(((i + 1) / n) * TAU)).addScaledVector(up, r * Math.sin(((i + 1) / n) * TAU));
        this.fxMid.push(p.x, p.y, p.z, q.x, q.y, q.z, color.r * a, color.g * a, color.b * a);
      }
    }
  }

  fxTrail(state, entry) {
    const part = this.byId.get(entry.item.on);
    if (!part) return;
    const color = roleColor(part.role === 'object' ? 'actor' : part.role);
    const steps = 24;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      // Rebuild the part's anim at earlier times of the same beat (deterministic).
      const tt = state.t - k / FPS;
      const s = this.frameStateLite(state.b, tt);
      const p = this.partCenter(part.id, s);
      const a = entry.weight * Math.pow(1 - k / steps, 1.5) * 0.8;
      if (prev) this.fxMid.push(prev.p.x, prev.p.y, prev.p.z, p.x, p.y, p.z, color.r * prev.a, color.g * prev.a, color.b * prev.a, color.r * a, color.g * a, color.b * a);
      if (k % 6 === 3) this.points.push(p.x, p.y, p.z, color.r * a, color.g * a, color.b * a, 5);
      prev = {p, a};
    }
  }

  /** Part world matrices only, for trails (camera untouched). */
  frameStateLite(b, t) {
    return this.frameState(b, t, false).worlds;
  }

  dimGeometry(state, part) {
    const box = part.geometry.boundingBox.clone().applyMatrix4(state.worlds.get(part.id));
    const size = box.getSize(new THREE.Vector3());
    const gap = this.sphere.radius * 0.1;
    const tick = this.sphere.radius * 0.04;
    if (size.y >= size.x) {
      const x = box.max.x + gap;
      const z = (box.min.z + box.max.z) / 2;
      return {a: new THREE.Vector3(x, box.min.y, z), b: new THREE.Vector3(x, box.max.y, z), tick: new THREE.Vector3(tick, 0, 0)};
    }
    const y = box.min.y - gap;
    const z = (box.min.z + box.max.z) / 2;
    return {a: new THREE.Vector3(box.min.x, y, z), b: new THREE.Vector3(box.max.x, y, z), tick: new THREE.Vector3(0, tick, 0)};
  }

  fxDim(state, entry) {
    const part = this.byId.get(entry.item.on);
    if (!part) return;
    const {a, b, tick} = this.dimGeometry(state, part);
    const k = 0.7 * entry.weight;
    const c = SOFT_LINEAR;
    this.fxThin.push(a.x, a.y, a.z, b.x, b.y, b.z, c.r * k, c.g * k, c.b * k);
    for (const p of [a, b]) {
      this.fxThin.push(p.x - tick.x, p.y - tick.y, p.z - tick.z, p.x + tick.x, p.y + tick.y, p.z + tick.z, c.r * k, c.g * k, c.b * k);
    }
  }

  fxArrow(state, entry, used) {
    const from = this.refPoint(state, entry.item.from);
    const dir = new THREE.Vector3(...vec3(entry.item.dir, [0, 1, 0]));
    if (!from || dir.lengthSq() < 1e-12) return used;
    dir.normalize();
    const len = Math.max(1e-3, num(entry.item.len, this.sphere.radius * 0.4));
    let mesh = this.arrowMeshes[used];
    if (!mesh) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const shaft = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
      shaft.translate(0, 0.5, 0);
      const head = new THREE.ConeGeometry(1, 1, 24, 1);
      head.translate(0, 0.5, 0);
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(shaft, material), new THREE.Mesh(head, material));
      mesh.children.forEach(child => (child.renderOrder = 3));
      mesh.material = material;
      this.scene.add(mesh);
      this.arrowMeshes.push(mesh);
    }
    const P = entry.period;
    const pulse = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin((TAU * cycles(0.5, P) * entry.tau) / P));
    const color = roleColor(entry.item.role ?? 'energy');
    mesh.material.color.copy(color).multiplyScalar(0.8 * pulse * entry.weight);
    const headLen = Math.min(len * 0.32, this.sphere.radius * 0.12);
    const shaftR = Math.max(len * 0.03, this.sphere.radius * 0.012);
    const [shaft, head] = mesh.children;
    shaft.scale.set(shaftR, len - headLen, shaftR);
    head.position.set(0, len - headLen, 0);
    head.scale.set(shaftR * 2.8, headLen, shaftR * 2.8);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    mesh.visible = true;
    return used + 1;
  }

  // ----- public helpers

  renderAt(b, t) {
    const state = this.frameState(b, t);
    this.draw(state);
    return state;
  }

  project(point) {
    const p = point.clone().project(this.camera);
    return [(p.x + 1) * 0.5 * SIZE, (1 - p.y) * 0.5 * SIZE];
  }

  /** Label tracks for beat b: side and anchor screen positions at 10 Hz over the whole clip. */
  labelTracks(b) {
    const beat = this.beats[b];
    const plan = this.plan(b);
    const rest = this.frameState(b, MOVE);
    const midX = this.project(this.rest[b].cam.target)[0];
    const chosen = beat.labels.map(id => {
      const part = this.byId.get(id);
      const world = rest.worlds.get(id);
      const verts = part.edges.verts;
      const screen = [];
      let cx = 0;
      let cy = 0;
      // Only points inside the stage (inset) can anchor a label.
      const inStage = ([x, y]) => x > 40 && x < SIZE - 40 && y > STAGE.top + 12 && y < STAGE.bottom - 12;
      const all = [];
      for (let i = 0; i < verts.length; i += 3) {
        const [x, y] = this.project(new THREE.Vector3(verts[i], verts[i + 1], verts[i + 2]).applyMatrix4(world));
        all.push([x, y, i / 3]);
      }
      const inside = all.filter(inStage);
      screen.push(...(inside.length ? inside : all));
      for (const [x, y] of screen) {
        cx += x;
        cy += y;
      }
      cx /= screen.length;
      cy /= screen.length;
      return {id, part, screen, cx, cy, dx: cx - midX};
    });
    // Each label gets an anchor for either column: the part's point furthest towards that side
    // near the part's middle height. Both are sampled at 10 Hz over the whole clip.
    const pickAnchor = (label, side) => {
      const s = side === 'l' ? -1 : 1;
      let best = null;
      let bestScore = -Infinity;
      for (const [x, y, index] of label.screen) {
        const score = s * x - 0.6 * Math.abs(y - label.cy);
        if (score > bestScore) {
          bestScore = score;
          best = index;
        }
      }
      return best;
    };
    for (const label of chosen) label.vertex = {l: pickAnchor(label, 'l'), r: pickAnchor(label, 'r')};
    const times = [];
    for (let k = 0; k * 0.1 <= plan.dur + 1e-9; k++) times.push(Number((k * 0.1).toFixed(1)));
    for (const label of chosen) label.tracks = {l: [], r: []};
    for (const t of times) {
      const state = this.frameState(b, t);
      for (const label of chosen) {
        for (const side of ['l', 'r']) {
          const v = new THREE.Vector3().fromArray(label.part.edges.verts, label.vertex[side] * 3).applyMatrix4(state.worlds.get(label.id));
          const [x, y] = this.project(v);
          label.tracks[side].push([t, Number(x.toFixed(1)), Number(y.toFixed(1))]);
        }
      }
    }
    // Choose sides: labels go to the side their part is on, and two labels on one side are never
    // within 26 px of each other at any sampled time. Try every assignment (at most 3 labels).
    const clash = (a, sa, c, sc) => sa === sc && a.tracks[sa].some((p, i) => Math.abs(p[2] - c.tracks[sc][i][2]) < 26);
    let best = null;
    for (let mask = 0; mask < 1 << chosen.length; mask++) {
      const sides = chosen.map((_, i) => (mask >> i) & 1 ? 'r' : 'l');
      let cost = 0;
      chosen.forEach((label, i) => {
        const natural = label.dx < 0 ? 'l' : 'r';
        if (sides[i] !== natural) cost += 10 + Math.abs(label.dx);
      });
      let clashes = 0;
      for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) if (clash(chosen[i], sides[i], chosen[j], sides[j])) clashes++;
      cost += clashes * 100000;
      const left = sides.filter(side => side === 'l').length;
      cost += Math.abs(left - (chosen.length - left)) * 2;
      if (!best || cost < best.cost) best = {cost, sides, clashes};
    }
    chosen.forEach((label, i) => {
      label.side = best ? best.sides[i] : 'l';
      label.anchor = label.tracks[label.side];
    });
    const warnings = best && best.clashes ? [`${best.clashes} label pair(s) closer than 26 px on one side`] : [];
    return {labels: chosen.map(label => ({part: label.id, side: label.side, anchor: label.anchor})), warnings};
  }

  dimTracks(b) {
    const beat = this.beats[b];
    const plan = this.plan(b);
    const dims = beat.fx.filter(item => item.type === 'dim' && this.byId.has(item.on));
    if (!dims.length) return [];
    const out = dims.map(item => ({part: item.on, text: String(item.text ?? ''), anchor: []}));
    for (let k = 0; k * 0.1 <= plan.dur + 1e-9; k++) {
      const t = Number((k * 0.1).toFixed(1));
      const state = this.frameState(b, t);
      dims.forEach((item, i) => {
        const {a, b: end} = this.dimGeometry(state, this.byId.get(item.on));
        const [x, y] = this.project(a.clone().lerp(end, 0.5));
        out[i].anchor.push([t, Number(x.toFixed(1)), Number(y.toFixed(1))]);
      });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// window.R3D: the API render.mjs drives.

let explore = null;

window.R3D = {
  init() {
    const canvas = document.getElementById('stage');
    explore = new Explore(canvas);
    return explore.info();
  },
  load(spec) {
    return explore.load(spec);
  },
  plan(b) {
    return explore.plan(b);
  },
  /** Render frames [i0, i0 + count) of beat b and return them as PNG data URLs. */
  frames(b, i0, count) {
    const out = [];
    for (let i = i0; i < i0 + count; i++) {
      explore.renderAt(b, i / FPS);
      out.push(explore.canvas.toDataURL('image/png'));
    }
    return out;
  },
  frameAt(b, t) {
    explore.renderAt(b, t);
    return explore.canvas.toDataURL('image/png');
  },
  /** Max channel difference between two times of a beat (loop seam check). */
  diff(b, t1, t2) {
    const read = t => {
      explore.renderAt(b, t);
      const c = document.createElement('canvas');
      c.width = SIZE;
      c.height = SIZE;
      const ctx = c.getContext('2d');
      ctx.drawImage(explore.canvas, 0, 0);
      return ctx.getImageData(0, 0, SIZE, SIZE).data;
    };
    const a = read(t1);
    const c = read(t2);
    let max = 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = Math.abs(a[i] - c[i]);
      if (d > max) max = d;
      sum += d;
    }
    return {max, mean: sum / a.length};
  },
  /** Mean brightness of the rest frame (0..1) and the share of pixels above a faint level. */
  brightness(b) {
    explore.renderAt(b, MOVE);
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext('2d');
    ctx.drawImage(explore.canvas, 0, 0);
    const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
    let sum = 0;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      sum += v;
      if (v > 40) lit++;
    }
    return {mean: sum / (data.length / 4) / 255, lit: lit / (data.length / 4)};
  },
  labels(b) {
    return explore.labelTracks(b);
  },
  dims(b) {
    return explore.dimTracks(b);
  },
  /** Captioned still: the rest frame with top line, labels, number and caption. */
  async card(b, meta) {
    explore.renderAt(b, MOVE);
    return drawCard(explore.canvas, meta);
  },
};
window.R3D_READY = true;
