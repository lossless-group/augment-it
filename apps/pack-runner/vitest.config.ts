import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  // `conditions: ['browser']` is load-bearing. Copied from
  // packages/shared-ui/vitest.config.ts and NOT from apps/corpora-curator,
  // whose config omits it because its tests are logic-only. Without it Svelte
  // resolves to its SERVER build, where `mount()` throws
  // `lifecycle_function_unavailable` before a single assertion runs.
  resolve: { conditions: ['browser'] },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
