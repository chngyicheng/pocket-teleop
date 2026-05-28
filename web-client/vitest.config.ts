import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 5000,
    hookTimeout: 30000,
    // integration.test.ts uses real WebSocket server with 500ms idle watchdog;
    // parallel file workers cause CPU contention that delays close-event delivery
    // past the test's timing guards. Force serial file execution.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
