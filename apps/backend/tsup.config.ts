import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/server.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript sources and are bundled in.
  noExternal: ['@polymirror/shared'],
  external: ['@prisma/client', '.prisma/client'],
});
