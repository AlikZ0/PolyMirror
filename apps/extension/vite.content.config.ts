import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** Content script: a single self-contained IIFE (`content.js`) added next to the main build. */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'es2022',
    sourcemap: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      name: 'PolyMirrorContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
