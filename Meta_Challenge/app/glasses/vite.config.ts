import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// Explore and Turn it share the renderer's own live module (render3d/page). render3d has
// its own node_modules/three: dedupe and the alias make every 'three' import resolve to this app's
// copy, so three is bundled once (in the lazy scene chunk).
const local = (relative: string): string => decodeURIComponent(new URL(relative, import.meta.url).pathname);
const three = local('./node_modules/three');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {find: '@r3d', replacement: local('../render3d/page')},
      {find: /^three$/, replacement: `${three}/build/three.module.js`},
      {find: /^three\/addons\/(.*)$/, replacement: `${three}/examples/jsm/$1`},
    ],
    dedupe: ['three'],
  },
  // objects.json is shared with the bridge and lives one level up.
  server: {port: 5173, fs: {allow: ['..']}},
  preview: {port: 4173},
});
