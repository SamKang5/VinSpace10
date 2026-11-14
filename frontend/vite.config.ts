import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app can be served from any path.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
