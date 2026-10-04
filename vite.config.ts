import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/.
export default defineConfig({
  base: '/metanoia-replicants/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
