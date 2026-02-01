import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/core/test/**/*.test.ts'],
    environment: 'node',
  },
});
