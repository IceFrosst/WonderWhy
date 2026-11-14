import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments,
  OrthographicCamera, Scene, WebGLRenderer,
} from 'three';
import parts from './kettle-live.json';

const colors = {actor: '#64e4ff', energy: '#ffd47d'};
const radians = Math.PI / 180;

export function createLiveKettle(canvas) {
  const renderer = new WebGLRenderer({canvas, alpha: false, antialias: false, powerPreference: 'low-power'});
  renderer.setSize(canvas.width, canvas.height, false);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera.position.z = 100;
  const tilt = new Group();
  const turn = new Group();
  tilt.add(turn);
  scene.add(tilt);

  let radius = 1;
  const lines = parts.map(part => {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(part.positions);
    for (let i = 0; i < positions.length; i += 3) {
      radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
    }
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({
      color: colors[part.role] ?? '#a6c7da',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const line = new LineSegments(geometry, material);
    turn.add(line);
    return {part, line, internal: ['channel', 'disc', 'element'].includes(part.id)};
  });

  return {
    draw(pose, separation) {
      const halfSize = radius / (0.74 * pose.zoom);
      camera.left = -halfSize;
      camera.right = halfSize;
      camera.top = halfSize;
      camera.bottom = -halfSize;
      camera.updateProjectionMatrix();
      const scale = 2 * halfSize / canvas.width;
      tilt.position.set(pose.x * scale, -pose.y * scale, 0);
      tilt.rotation.x = (pose.pitch + 16) * radians;
      turn.rotation.y = (30 - pose.angle) * radians;

      for (const {part, line, internal} of lines) {
        line.visible = !internal || separation >= 0.015;
        line.material.opacity = internal ? separation * 0.85 : part.id === 'body' ? 0.57 - separation * 0.25 : 0.55;
        line.position.set(part.offset[0] * separation, part.offset[1] * separation, part.offset[2] * separation);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      for (const {line} of lines) {
        line.geometry.dispose();
        line.material.dispose();
      }
      renderer.dispose();
    },
  };
}
