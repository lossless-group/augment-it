import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  // `conditions: ['browser']` is load-bearing for COMPONENT tests and was not
  // needed while this member's only suite was logic-only (curation.test.ts).
  // Without it Svelte resolves to its SERVER build, where `mount()` throws
  // `lifecycle_function_unavailable` — every component test fails before it
  // asserts anything. Copied from packages/shared-ui/vitest.config.ts.
  resolve: { conditions: ['browser'] },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
