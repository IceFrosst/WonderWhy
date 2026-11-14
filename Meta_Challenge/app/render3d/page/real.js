// style "real" (MODEL3D.md v2): physically based materials, a studio environment, camera-relative
// lights, a fresnel rim on every part, and a selective glow pass (emissive parts, fx, outlines).
import * as THREE from 'three';
import {Pass, FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

export const GLOW_LAYER = 1;

// Everything that sets the look of style "real" lives here.
export const REAL = {
  exposure: 1.05,
  envIntensity: 1.3,
  crease: 40, // degrees: faces meeting at a sharper angle get split normals
  rim: 0.5, // fresnel rim strength (linear), tinted by the material
  rimPow: 3.5, // a high power keeps the rim on the silhouette, off flat faces seen at an angle
  lift: 0.02, // flat ambient floor x base colour, so no lit side goes near black
  minLum: 0.045, // darkest allowed base colour (linear luminance) for non-metals
  dim: {bright: 0.35, desat: 0.85}, // non-focus parts on a focus beat
  ghost: {fill: 0.006, rim: 0.22}, // faint glass shell
  cutColor: '#4a4e55', // flat inside face of a cut shell (hardly dimmed)
  cutEdge: 0.55, // glowing line where the cut plane crosses a part
  glassTint: 0.3, // lit tint of see-through materials, x opacity (presets set their own)
  glassRim: 0.8, // their fresnel rim, x rim
  glassEnv: 0.35, // their environment reflections (a flat pane at a grazing angle otherwise turns white)
  edge: 0.22, // faint material-tinted edge line (0 = off)
  outline: {width: 1.5, strength: 0.7},
  glowEmissive: 0.55, // emissive colour written into the glow buffer
  fx: 1.15, // fx brightness multiplier
  bloom: {strength: 0.8, radius: 0.15, factors: [1.0, 0.55, 0.22, 0.0, 0.0]},
  key: {color: '#fff0dc', intensity: 1.6},
  fill: {color: '#cfe0ff', intensity: 0.55},
  rimLight: {color: '#e6efff', intensity: 3.2},
};

// Preset table of MODEL3D.md v2 (colours in sRGB). Dark materials are already lifted to a readable grey.
export const PRESETS = {
  steel: {color: '#c8cdd3', metalness: 1, roughness: 0.18},
  chrome: {color: '#eef0f2', metalness: 1, roughness: 0.06},
  aluminium: {color: '#d3d7db', metalness: 1, roughness: 0.42},
  iron: {color: '#7e8288', metalness: 0.75, roughness: 0.6},
  copper: {color: '#e8a07a', metalness: 1, roughness: 0.28},
  brass: {color: '#e3c27f', metalness: 1, roughness: 0.3},
  gold: {color: '#f6d47c', metalness: 1, roughness: 0.22},
  plastic: {color: '#9aa4ae', metalness: 0, roughness: 0.4, clearcoat: 0.25},
  plastic_white: {color: '#eceef0', metalness: 0, roughness: 0.36, clearcoat: 0.3},
  plastic_black: {color: '#43474e', metalness: 0, roughness: 0.32, clearcoat: 0.5},
  plastic_grey: {color: '#8c939b', metalness: 0, roughness: 0.42},
  rubber: {color: '#4b4f55', metalness: 0, roughness: 0.85},
  silicone: {color: '#b9c1c7', metalness: 0, roughness: 0.6, sheen: 0.6},
  glass: {color: '#e6f1f8', metalness: 0, roughness: 0.04, opacity: 0.16, glass: true, tint: 0.15},
  glass_tint: {color: '#5e6a76', metalness: 0, roughness: 0.06, opacity: 0.45, glass: true, tint: 0.2},
  screen: {color: '#30353c', metalness: 0.1, roughness: 0.12, clearcoat: 1},
  water: {color: '#7cc6ff', metalness: 0, roughness: 0.05, opacity: 0.38, glass: true, tint: 0.45},
  acrylic: {color: '#eef6ff', metalness: 0, roughness: 0.1, opacity: 0.28, glass: true, tint: 0.2},
  wood: {color: '#b27c47', metalness: 0, roughness: 0.62},
  wood_dark: {color: '#714b2f', metalness: 0, roughness: 0.55},
  stone: {color: '#9e988e', metalness: 0, roughness: 0.9},
  ceramic: {color: '#f2efe8', metalness: 0, roughness: 0.22, clearcoat: 0.8},
  fabric: {color: '#7c8895', metalness: 0, roughness: 1, sheen: 1},
  foam: {color: '#d7d2c5', metalness: 0, roughness: 0.95},
  leather: {color: '#7f4d2e', metalness: 0, roughness: 0.55, sheen: 0.3},
  pcb: {color: '#23843f', metalness: 0, roughness: 0.45, clearcoat: 0.4},
  chip: {color: '#3b3e45', metalness: 0, roughness: 0.4, clearcoat: 0.3},
  battery: {color: '#cfd3d8', metalness: 0.9, roughness: 0.35},
  magnet: {color: '#8f949a', metalness: 0.85, roughness: 0.4},
  led: {color: '#ffffff', metalness: 0, roughness: 0.3, emissive: 'self', glow: 1.5},
  emissive: {color: '#ffb347', metalness: 0, roughness: 0.5, emissive: 'self', glow: 2},
};

// Without `material`, the role decides.
const ROLE_PRESET = {
  object: ['plastic_grey'],
  actor: ['plastic', '#4fd6e6'],
  energy: ['emissive', '#ffc247'],
  loss: ['emissive', '#ff8a4d'],
  answer: ['emissive', '#6dff9c'],
  other: ['plastic', '#ff7ad9'],
};

const HEX = /^#[0-9a-f]{6}$/i;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const luminance = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Resolve a part's material fields (preset, overrides, role fallback). Pushes warnings. */
export function resolveMaterial(raw, role, warnings) {
  let name = typeof raw.material === 'string' ? raw.material : null;
  let roleColor = null;
  if (name && !PRESETS[name]) {
    warnings.push(`part ${raw.id}: unknown material "${name}", using the role default`);
    name = null;
  }
  if (!name) [name, roleColor] = ROLE_PRESET[role] ?? ROLE_PRESET.object;
  const preset = PRESETS[name];
  const color = new THREE.Color(HEX.test(raw.color ?? '') ? raw.color : roleColor ?? preset.color);
  const metalness = finite(raw.metalness) ? clamp(raw.metalness, 0, 1) : preset.metalness ?? 0;
  const roughness = finite(raw.roughness) ? clamp(raw.roughness, 0, 1) : preset.roughness ?? 0.5;
  const opacity = finite(raw.opacity) ? clamp(raw.opacity, 0.05, 1) : preset.opacity ?? 1;
  let emissive = null;
  if (HEX.test(raw.emissive ?? '')) emissive = new THREE.Color(raw.emissive);
  else if (preset.emissive === 'self') emissive = color.clone();
  const glow = finite(raw.glow) ? clamp(raw.glow, 0, 3) : emissive ? preset.glow ?? 1 : 0;
  if (!emissive && glow > 0) emissive = color.clone();
  // Black is see-through on the glasses: lift very dark base colours to a readable dark grey.
  if (!emissive && metalness < 0.5) {
    const lum = luminance(color);
    if (lum < REAL.minLum) {
      if (lum < 1e-4) color.setScalar(REAL.minLum);
      else color.multiplyScalar(REAL.minLum / lum);
    }
  }
  return {
    name, color, metalness, roughness, opacity, emissive, glow,
    glass: Boolean(preset.glass) || opacity < 1,
    tint: preset.tint ?? REAL.glassTint,
    clearcoat: preset.clearcoat ?? 0,
    sheen: preset.sheen ?? 0,
    anisotropy: preset.anisotropy ?? 0,
  };
}

/** Normals split at creases sharper than REAL.crease, so lathes are smooth and boxes crisp. */
export function creasedGeometry(geometry) {
  const out = toCreasedNormals(geometry.clone(), (REAL.crease * Math.PI) / 180);
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

const RIM_PARS = /* glsl */ `
uniform vec3 uRim;
uniform float uRimPow;
uniform float uLift;
uniform float uDesat;
uniform float uBright;
uniform float uCutFlat;
uniform vec3 uCutColor;
`;
const RIM_MAIN = /* glsl */ `
{
  float ndvR = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
  outgoingLight += uRim * pow(1.0 - ndvR, uRimPow);
  outgoingLight += uLift * diffuseColor.rgb;
  // Inside of a cut shell: its own light, never darker than a mid-dark grey, hardly dimmed.
  if (uCutFlat > 0.5 && !gl_FrontFacing) outgoingLight = (uCutColor + 0.12 * min(outgoingLight, vec3(0.25))) * mix(1.0, uBright, 0.25);
  else {
    float lumR = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
    outgoingLight = mix(outgoingLight, vec3(lumR), uDesat) * uBright;
  }
}
#include <opaque_fragment>
`;

/** The part's PBR material with the rim / dim / cut hooks. */
export function makeMaterial(mat) {
  const physical = mat.clearcoat > 0 || mat.sheen > 0 || mat.anisotropy > 0;
  // See-through materials are additive: reflections, rim and a faint lit tint are added to what is
  // behind (no absorption), the way glass reads on black and on an additive display.
  const glass = mat.glass;
  const options = {
    color: glass ? mat.color.clone().multiplyScalar(mat.opacity * mat.tint) : mat.color,
    metalness: mat.metalness,
    roughness: mat.roughness,
    side: THREE.DoubleSide,
    transparent: glass,
    opacity: 1,
    depthWrite: !glass,
    blending: glass ? THREE.AdditiveBlending : THREE.NormalBlending,
    emissive: new THREE.Color(0, 0, 0),
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  };
  let material;
  if (physical) {
    material = new THREE.MeshPhysicalMaterial({
      ...options,
      clearcoat: mat.clearcoat,
      clearcoatRoughness: 0.12,
      sheen: mat.sheen,
      sheenRoughness: 0.6,
      sheenColor: mat.color.clone().lerp(new THREE.Color(1, 1, 1), 0.4),
      anisotropy: mat.anisotropy,
    });
  } else material = new THREE.MeshStandardMaterial(options);
  const rimColor = mat.color.clone().lerp(new THREE.Color(1, 1, 1), 0.55).multiplyScalar(REAL.rim * (glass ? REAL.glassRim : 1));
  const u = {
    uRim: {value: rimColor},
    uRimPow: {value: glass ? REAL.rimPow + 1.5 : REAL.rimPow},
    uLift: {value: mat.glass ? 0 : REAL.lift},
    uDesat: {value: 0},
    uBright: {value: 1},
    uCutFlat: {value: 0},
    uCutColor: {value: new THREE.Color(REAL.cutColor)},
  };
  // The environment is set per material (scene.environment would override envMapIntensity).
  material.envMapIntensity = REAL.envIntensity * (glass ? REAL.glassEnv : 1);
  material.userData.u = u;
  material.userData.rimBase = rimColor.clone();
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RIM_PARS}`)
      .replace('#include <opaque_fragment>', RIM_MAIN);
  };
  material.customProgramCacheKey = () => 'r3d-real';
  return material;
}

/** Occluder / emitter in the glow buffer: black, or the part's own light. */
export function glowMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
}

const SHELL_VERTEX = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vV = -mvPosition.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const SHELL_FRAGMENT = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform float uFill;
  uniform float uRim;
  uniform float uAmount;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    #include <clipping_planes_fragment>
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - ndv, 2.5);
    gl_FragColor = vec4(uColor * (uFill + uRim * rim) * uAmount, 1.0);
  }
`;

/** Ghost: a faint additive glass shell with a fresnel rim, no depth write. */
export function shellMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: {value: color.clone().lerp(new THREE.Color(0.8, 0.88, 1), 0.6)},
      uFill: {value: REAL.ghost.fill},
      uRim: {value: REAL.ghost.rim},
      uAmount: {value: 0},
    },
    vertexShader: SHELL_VERTEX,
    fragmentShader: SHELL_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    clipping: true,
  });
}

/**
 * Studio environment (built once, PMREM): a dark grey dome brighter towards the top, an overhead
 * soft box, a warm key box front left, a cool fill front right and two tall rim strips behind.
 * Laid out for a camera on +z; the scene's environmentRotation turns it with the camera.
 */
export function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(100, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float y = vDir.y;
          vec3 low = vec3(0.03, 0.031, 0.035);
          vec3 mid = vec3(0.07, 0.073, 0.08);
          vec3 high = vec3(0.2, 0.205, 0.215);
          vec3 c = mix(low, mid, smoothstep(-0.6, 0.0, y));
          c = mix(c, high, smoothstep(0.2, 0.95, y));
          c *= mix(1.0, 0.45, smoothstep(-0.2, 0.8, vDir.z) * (1.0 - smoothstep(0.5, 0.9, y))); // darker behind the camera
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    }),
  );
  scene.add(dome);
  const box = (pos, w, h, intensity, color) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide}),
    );
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  box([0, 75, -10], 50, 26, 1.5, '#ffffff'); // overhead
  box([-62, 15, 38], 14, 90, 9.0, '#fff0dc'); // key strip, front left, warm
  box([66, 10, 30], 12, 90, 4.0, '#dce8ff'); // fill strip, front right, cool
  box([-55, 25, -62], 7, 90, 7.0, '#eef4ff'); // rim strip, back left
  box([58, 25, -58], 7, 90, 7.0, '#eef4ff'); // rim strip, back right
  box([0, -45, 60], 70, 10, 0.35, '#ffffff'); // low front bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.015, 0.1, 300);
  pmrem.dispose();
  scene.traverse(object => {
    object.geometry?.dispose?.();
    object.material?.dispose?.();
  });
  return target.texture;
}

/** Key, fill and rim lights, re-aimed every frame relative to the camera. */
export class StudioLights {
  constructor() {
    this.key = new THREE.DirectionalLight(REAL.key.color, REAL.key.intensity);
    this.fill = new THREE.DirectionalLight(REAL.fill.color, REAL.fill.intensity);
    this.rim = new THREE.DirectionalLight(REAL.rimLight.color, REAL.rimLight.intensity);
    this.rim2 = new THREE.DirectionalLight(REAL.rimLight.color, REAL.rimLight.intensity * 0.6);
    this.lights = [this.key, this.fill, this.rim, this.rim2];
    // Directions in camera space: x right, y up, z towards the camera.
    this.dirs = [
      new THREE.Vector3(-0.65, 0.75, 0.55),
      new THREE.Vector3(0.85, 0.05, 0.45),
      new THREE.Vector3(0.55, 0.6, -0.9),
      new THREE.Vector3(-0.7, 0.35, -0.85),
    ].map(v => v.normalize());
  }

  addTo(scene) {
    for (const light of this.lights) {
      scene.add(light);
      scene.add(light.target);
    }
  }

  aim(camera, target, radius) {
    const basis = new THREE.Matrix3().setFromMatrix4(camera.matrixWorld);
    this.lights.forEach((light, i) => {
      const dir = this.dirs[i].clone().applyMatrix3(basis).normalize();
      light.position.copy(target).addScaledVector(dir, radius * 4);
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
    });
  }
}

const ADD_SHADER = {
  uniforms: {tDiffuse: {value: null}},
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }
  `,
};

/**
 * Selective glow: renders the GLOW_LAYER (black occluders, emissive parts, outlines, fx) into a
 * small buffer (half size, no MSAA: it only feeds the blur), blooms it, and adds the bloom alone
 * onto the frame. The sharp lines and emissive parts are already in the main pass. White plastic
 * never blooms.
 */
export class GlowPass extends Pass {
  constructor(scene, camera, size) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    const half = Math.round(size / 2);
    this.target = new THREE.WebGLRenderTarget(half, half, {type: THREE.HalfFloatType, samples: 0, depthBuffer: true});
    const {strength, radius, factors} = REAL.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size, size), strength, radius, 0);
    this.bloom.compositeMaterial.uniforms.bloomFactors.value = factors;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ADD_SHADER.uniforms),
      vertexShader: ADD_SHADER.vertexShader,
      fragmentShader: ADD_SHADER.fragmentShader,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer, writeBuffer, readBuffer) {
    const mask = this.camera.layers.mask;
    const background = this.scene.background;
    const oldAutoClear = renderer.autoClear;
    const oldClear = renderer.getClearColor(new THREE.Color());
    const oldAlpha = renderer.getClearAlpha();
    this.camera.layers.set(GLOW_LAYER);
    this.scene.background = null;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    this.onBefore?.();
    renderer.render(this.scene, this.camera);
    this.onAfter?.();
    this.camera.layers.mask = mask;
    this.scene.background = background;
    this.bloom.render(renderer, null, this.target, 0, false);
    // The blurred mips alone (UnrealBloomPass composites them here before blending onto its input).
    renderer.autoClear = false;
    this.material.uniforms.tDiffuse.value = this.bloom.renderTargetsHorizontal[0].texture;
    renderer.setRenderTarget(readBuffer);
    this.quad.render(renderer);
    renderer.autoClear = oldAutoClear;
    renderer.setClearColor(oldClear, oldAlpha);
  }
}
