import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 5000,
    hookTimeout: 30000,
    sequence: {
      concurrent: false,
    },
  },
});
