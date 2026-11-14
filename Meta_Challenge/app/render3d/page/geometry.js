// Primitives of MODEL3D.md and their edge data (crease, boundary, silhouette candidates).
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const CREASE_DEG = 30;
export const MAX_POINTS = 128; // v2 limit per path or profile

const finite = value => typeof value === 'number' && Number.isFinite(value);
const num = (value, fallback) => (finite(value) ? value : fallback);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function vec3(value, fallback) {
  return Array.isArray(value) && value.length === 3 && value.every(finite) ? value : fallback;
}

function pointList(value, dims, min) {
  if (!Array.isArray(value)) return null;
  const out = value
    .slice(0, MAX_POINTS)
    .filter(point => Array.isArray(point) && point.length === dims && point.every(finite));
  return out.length >= min ? out : null;
}

/** A smooth curve through the points (centripetal Catmull-Rom); straight when there are only two. */
export function curveThrough(points, closed) {
  const vectors = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  if (vectors.length === 2 && !closed) return new THREE.LineCurve3(vectors[0], vectors[1]);
  return new THREE.CatmullRomCurve3(vectors, Boolean(closed), 'centripetal');
}

class HelixCurve extends THREE.Curve {
  constructor(r, h, turns) {
    super();
    this.r = r;
    this.h = h;
    this.turns = turns;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = Math.PI * 2 * this.turns * t;
    return target.set(this.r * Math.cos(angle), this.h * (t - 0.5), this.r * Math.sin(angle));
  }
}

function gearShape(teeth, r, depth) {
  const shape = new THREE.Shape();
  const root = Math.max(r * 0.2, r - depth);
  const pitch = (Math.PI * 2) / teeth;
  const at = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];
  for (let i = 0; i < teeth; i++) {
    const a = i * pitch;
    const pts = [
      at(root, a),
      at(r, a + pitch * 0.18),
      at(r, a + pitch * 0.45),
      at(root, a + pitch * 0.63),
    ];
    pts.forEach(([x, y], k) => (i === 0 && k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** Build the BufferGeometry of one part, centred on its own origin as MODEL3D.md implies. Null when unknown. */
export function buildGeometry(part) {
  switch (part.prim) {
    case 'box': {
      const size = vec3(part.size, [1, 1, 1]).map(v => Math.max(1e-3, Math.abs(v)));
      const round = Math.min(num(part.round, 0), Math.min(...size) * 0.499);
      if (round > 0) return new RoundedBoxGeometry(size[0], size[1], size[2], 3, round);
      return new THREE.BoxGeometry(size[0], size[1], size[2]);
    }
    case 'cylinder': {
      const r = Math.max(1e-3, num(part.r, 1));
      const r2 = Math.max(0, num(part.r2, r));
      const h = Math.max(1e-3, num(part.h, 1));
      const segments = clamp(Math.round(num(part.segments, 32)), 6, 48);
      return new THREE.CylinderGeometry(r2, r, h, segments, 1, false);
    }
    case 'sphere':
      return new THREE.SphereGeometry(Math.max(1e-3, num(part.r, 1)), 32, 20);
    case 'torus':
      return new THREE.TorusGeometry(Math.max(1e-3, num(part.r, 1)), Math.max(1e-3, num(part.tube, 0.2)), 18, 72);
    case 'lathe': {
      const profile = pointList(part.profile, 2, 2);
      if (!profile) return null;
      return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), 72);
    }
    case 'extrude': {
      const shapePoints = pointList(part.shape, 2, 3);
      if (!shapePoints) return null;
      const h = Math.max(1e-3, num(part.h, 1));
      // Shape is [x, z]; build it in (x, -z) so that the rotation below lands it on +z.
      const shape = new THREE.Shape(shapePoints.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geometry = new THREE.ExtrudeGeometry(shape, {depth: h, bevelEnabled: false, curveSegments: 8});
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -h / 2, 0);
      return geometry;
    }
    case 'tube': {
      const path = pointList(part.path, 3, 2);
      if (!path) return null;
      const closed = part.closed === true && path.length > 2;
      const curve = curveThrough(path, closed);
      const segments = clamp(path.length * 16, 24, 220);
      return new THREE.TubeGeometry(curve, segments, Math.max(1e-3, num(part.r, 0.2)), 16, closed);
    }
    case 'gear': {
      const teeth = clamp(Math.round(num(part.teeth, 24)), 6, 80);
      const r = Math.max(1e-3, num(part.r, 1));
      const h = Math.max(1e-3, num(part.h, 0.2));
      const depth = num(part.toothDepth, r * 0.12);
      const geometry = new THREE.ExtrudeGeometry(gearShape(teeth, r, depth), {depth: h, bevelEnabled: false, curveSegments: 24});
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -h / 2, 0);
      return geometry;
    }
    case 'capsule': {
      const r = Math.max(1e-3, num(part.r, 1));
      const h = Math.max(0, num(part.h, 1));
      return new THREE.CapsuleGeometry(r, h, 10, 32);
    }
    case 'helix': {
      const r = Math.max(1e-3, num(part.r, 1));
      const h = Math.max(1e-3, num(part.h, 1));
      const turns = clamp(num(part.turns, 5), 0.25, 40);
      const curve = new HelixCurve(r, h, turns);
      return new THREE.TubeGeometry(curve, clamp(Math.round(turns * 40), 24, 1600), Math.max(1e-3, num(part.tube, 0.1)), 16, false);
    }
    default:
      return null;
  }
}

/**
 * Edge data for a geometry: unique vertices, fixed segments (creases over CREASE_DEG and open
 * boundaries), face-pair silhouette candidates for flat-shaded faces, and the smooth triangles
 * (with their vertex normals) whose silhouette is traced as an interpolated contour.
 */
export function edgeData(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const index = geometry.index ? geometry.index.array : null;
  geometry.computeBoundingBox();
  const diagonal = geometry.boundingBox.getSize(new THREE.Vector3()).length() || 1;
  const eps = diagonal * 2e-5;

  const vertexId = new Int32Array(position.count);
  const verts = [];
  const lookup = new Map();
  // Merge coincident vertices (seams of lathes, tubes, cylinders). Neighbouring cells are searched
  // too, so two copies of one point never split across a rounding boundary.
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const kx = Math.round(x / eps);
    const ky = Math.round(y / eps);
    const kz = Math.round(z / eps);
    let id;
    search: for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const found = lookup.get(`${kx + dx}|${ky + dy}|${kz + dz}`);
          if (found !== undefined && Math.abs(verts[found * 3] - x) <= eps && Math.abs(verts[found * 3 + 1] - y) <= eps && Math.abs(verts[found * 3 + 2] - z) <= eps) {
            id = found;
            break search;
          }
        }
      }
    }
    if (id === undefined) {
      id = verts.length / 3;
      verts.push(x, y, z);
      lookup.set(`${kx}|${ky}|${kz}`, id);
    }
    vertexId[i] = id;
  }

  const triangles = index ? index.length / 3 : position.count / 3;
  const faceNormal = [];
  const facePoint = [];
  const faceSmooth = [];
  const smooth = []; // per smooth triangle: 3 x (px, py, pz, nx, ny, nz)
  const edges = new Map();
  const nv = verts.length / 3;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const vn = new THREE.Vector3();
  for (let t = 0; t < triangles; t++) {
    const raw = [0, 1, 2].map(k => (index ? index[t * 3 + k] : t * 3 + k));
    const [i0, i1, i2] = raw.map(r => vertexId[r]);
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    a.fromArray(verts, i0 * 3);
    b.fromArray(verts, i1 * 3);
    c.fromArray(verts, i2 * 3);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac);
    const area = ab.length();
    if (area < eps * eps) continue;
    ab.divideScalar(area);
    const face = faceNormal.length / 3;
    faceNormal.push(ab.x, ab.y, ab.z);
    facePoint.push(a.x, a.y, a.z);
    // Smooth when the vertex normals differ from the face normal (curved surface).
    let isSmooth = false;
    if (normal) {
      for (const r of raw) {
        vn.fromBufferAttribute(normal, r);
        if (vn.lengthSq() > 0 && vn.normalize().dot(ab) < 0.99985) isSmooth = true;
      }
    }
    faceSmooth.push(isSmooth);
    if (isSmooth) {
      for (const r of raw) {
        vn.fromBufferAttribute(normal, r).normalize();
        smooth.push(position.getX(r), position.getY(r), position.getZ(r), vn.x, vn.y, vn.z);
      }
    }
    for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) {
      const lo = Math.min(p, q);
      const hi = Math.max(p, q);
      const key = lo * nv + hi;
      const entry = edges.get(key);
      if (entry) entry.push(face);
      else edges.set(key, [lo, hi, face]);
    }
  }

  const cosCrease = Math.cos((CREASE_DEG * Math.PI) / 180);
  const fixed = [];
  const candidates = [];
  const creases = []; // crease edges with their two faces (silhouette test for outlines)
  const boundary = [];
  for (const entry of edges.values()) {
    const [lo, hi, f1, f2] = entry;
    const faces = entry.length - 2;
    if (faces === 2) {
      const dot =
        faceNormal[f1 * 3] * faceNormal[f2 * 3] +
        faceNormal[f1 * 3 + 1] * faceNormal[f2 * 3 + 1] +
        faceNormal[f1 * 3 + 2] * faceNormal[f2 * 3 + 2];
      if (dot < cosCrease) {
        fixed.push(lo, hi);
        creases.push(lo, hi, f1, f2);
      } else if (dot < 0.99999 && !(faceSmooth[f1] && faceSmooth[f2])) candidates.push(lo, hi, f1, f2);
    } else {
      fixed.push(lo, hi);
      boundary.push(lo, hi);
    }
  }
  return {
    verts: new Float32Array(verts),
    fixed: new Uint32Array(fixed),
    candidates: new Uint32Array(candidates),
    faceNormal: new Float32Array(faceNormal),
    facePoint: new Float32Array(facePoint),
    smooth: new Float32Array(smooth),
    creases: new Uint32Array(creases),
    boundary: new Uint32Array(boundary),
  };
}

/**
 * Segments (local space, flat [ax, ay, az, bx, by, bz, ...]) to draw for a camera at `eye`
 * (local space): fixed edges, face-pair silhouettes of flat faces, and the smooth contour where
 * the interpolated n . (eye - p) changes sign inside a triangle.
 */
export function visibleEdges(data, eye, out) {
  out.length = 0;
  const {verts, fixed, candidates, faceNormal: n, facePoint: p, smooth} = data;
  const pushPair = (i, j) => out.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2], verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2]);
  for (let i = 0; i < fixed.length; i += 2) pushPair(fixed[i], fixed[i + 1]);
  for (let i = 0; i < candidates.length; i += 4) {
    const f1 = candidates[i + 2] * 3;
    const f2 = candidates[i + 3] * 3;
    const s1 = n[f1] * (eye.x - p[f1]) + n[f1 + 1] * (eye.y - p[f1 + 1]) + n[f1 + 2] * (eye.z - p[f1 + 2]);
    const s2 = n[f2] * (eye.x - p[f2]) + n[f2 + 1] * (eye.y - p[f2 + 1]) + n[f2 + 2] * (eye.z - p[f2 + 2]);
    if ((s1 > 0) !== (s2 > 0)) pushPair(candidates[i], candidates[i + 1]);
  }
  smoothContour(smooth, eye, out);
  return out;
}

/** Outline only (style "real"): open boundaries plus silhouette edges (crease, flat and smooth). */
export function outlineEdges(data, eye, out) {
  out.length = 0;
  const {verts, creases, boundary, candidates, faceNormal: n, facePoint: p, smooth} = data;
  const pushPair = (i, j) => out.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2], verts[j * 3], verts[j * 3 + 1], verts[j * 3 + 2]);
  const facing = f => n[f] * (eye.x - p[f]) + n[f + 1] * (eye.y - p[f + 1]) + n[f + 2] * (eye.z - p[f + 2]) > 0;
  for (let i = 0; i < boundary.length; i += 2) pushPair(boundary[i], boundary[i + 1]);
  for (const list of [creases, candidates]) {
    for (let i = 0; i < list.length; i += 4) {
      if (facing(list[i + 2] * 3) !== facing(list[i + 3] * 3)) pushPair(list[i], list[i + 1]);
    }
  }
  smoothContour(smooth, eye, out);
  return out;
}

function smoothContour(smooth, eye, out) {
  const g = [0, 0, 0];
  const cross = [];
  for (let t = 0; t < smooth.length; t += 18) {
    for (let k = 0; k < 3; k++) {
      const o = t + k * 6;
      const v = smooth[o + 3] * (eye.x - smooth[o]) + smooth[o + 4] * (eye.y - smooth[o + 1]) + smooth[o + 5] * (eye.z - smooth[o + 2]);
      g[k] = v === 0 ? 1e-12 : v;
    }
    if ((g[0] > 0) === (g[1] > 0) && (g[1] > 0) === (g[2] > 0)) continue;
    cross.length = 0;
    for (const [k, l] of [[0, 1], [1, 2], [2, 0]]) {
      if ((g[k] > 0) === (g[l] > 0)) continue;
      const s = g[k] / (g[k] - g[l]);
      const ok = t + k * 6;
      const ol = t + l * 6;
      cross.push(
        smooth[ok] + (smooth[ol] - smooth[ok]) * s,
        smooth[ok + 1] + (smooth[ol + 1] - smooth[ok + 1]) * s,
        smooth[ok + 2] + (smooth[ol + 2] - smooth[ok + 2]) * s,
      );
    }
    if (cross.length === 6) out.push(...cross);
  }
  return out;
}
