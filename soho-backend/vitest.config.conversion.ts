import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['test/conversion-catalogo.db-spec.ts'],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
