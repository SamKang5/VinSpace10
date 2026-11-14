import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app can be served from any path (GitHub Pages subpath, or a static host).
  base: './',
  server: {
    // Allow preview hosts (Cloudflare Pages, tunnel hostnames) to reach the dev server.
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
