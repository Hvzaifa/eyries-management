import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// The app uses the `@/…` path alias from tsconfig.json; vitest needs the same
// mapping to load modules under test that import through it.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
