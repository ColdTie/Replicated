import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/.
export default defineConfig({
  base: '/Replicated/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    // Phaser in a chunk of its own: it never changes, so a deploy (the maker ships daily) only re-downloads the game
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  server: { host: true },
});
