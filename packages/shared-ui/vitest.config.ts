import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  // `conditions: ['browser']` is load-bearing and is NOT in the config this was
  // copied from. Without it Svelte resolves to its SERVER build, where `mount()`
  // throws `lifecycle_function_unavailable` — so every component test fails
  // before it asserts anything. apps/corpora-curator never hit this because its
  // tests are logic-only; this is the federation's first COMPONENT test.
  resolve: { conditions: ['browser'] },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
