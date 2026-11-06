import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages project subpath.
  base: './',
  // three.js (~140 kB gzipped) is a lazily loaded chunk for the 3D view only.
  build: { chunkSizeWarningLimit: 600 },
});
