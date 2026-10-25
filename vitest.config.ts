import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // or jsdom if we add ui tests later
    testTimeout: 20000,
  },
});
