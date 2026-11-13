import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react()],
  // objects.json is shared with the bridge and lives one level up.
  server: {port: 5173, fs: {allow: ['..']}},
  preview: {port: 4173},
});
