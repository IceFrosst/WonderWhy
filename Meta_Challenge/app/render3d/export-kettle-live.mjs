import {readFile, writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {buildGeometry, curveThrough} from './page/geometry.js';

const library = JSON.parse(await readFile(new URL('../shared/objects.json', import.meta.url), 'utf8'));
const spec = library.objects.find(object => object.id === 'kettle').chapters.find(chapter => chapter.scene === 'model3d').spec;
const partsById = new Map(spec.parts.map(part => [part.id, part]));

function explodeOffset(part) {
  const own = part.explode ?? [0, 0, 0];
  const parent = partsById.get(part.parent);
  return parent ? explodeOffset(parent).map((delta, axis) => delta + own[axis]) : own;
}

const parts = spec.parts.map(part => {
  const closed = part.closed === true && part.path?.length > 2;
  const geometry = part.prim === 'tube'
    ? new THREE.TubeGeometry(curveThrough(part.path, closed), 24, part.r, 8, closed)
    : buildGeometry(part);
  if (!geometry) throw new Error(`Missing geometry: ${part.id}`);
  const radians = (part.rot ?? [0, 0, 0]).map(THREE.MathUtils.degToRad);
  const scale = Array.isArray(part.scale) ? part.scale : Array(3).fill(part.scale ?? 1);
  geometry.scale(...scale);
  geometry.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...radians)));
  geometry.translate(...(part.pos ?? [0, 0, 0]));
  const edges = new THREE.EdgesGeometry(geometry, part.prim === 'box' ? 5 : 18);
  const positions = Array.from(edges.attributes.position.array, value => Math.round(value * 100) / 100);
  return {id: part.id, role: part.role, positions, offset: explodeOffset(part)};
});

await writeFile(new URL('../glasses/src/kettle-live.json', import.meta.url), JSON.stringify(parts) + '\n');
