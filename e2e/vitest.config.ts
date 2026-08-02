import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts'],
    environment: 'node',
    // The disposable backend chain (docker NATS + surreal + 3 tsx services)
    // takes several seconds to stand up in beforeAll.
    hookTimeout: 90_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
