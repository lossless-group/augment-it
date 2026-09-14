import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  resolve: {
    // `conditions: ['browser']` is load-bearing and is NOT in the config
    // apps/corpora-curator uses. Without it Svelte resolves to its SERVER
    // build, where `mount()` throws `lifecycle_function_unavailable` before a
    // single assertion runs. Copied from packages/shared-ui/vitest.config.ts.
    conditions: ['browser'],
    alias: {
      // `resolve.alias`, NEVER `source.alias`. A probe that got this wrong on
      // 2026-09-13 bundled the REAL @augment-it/workspace, found a live
      // workspace-service, and wrote a file into live client data. The stub
      // serves READ capabilities from a fixture and THROWS on every write.
      '@augment-it/workspace': resolve(__dirname, 'test/stubs/workspace.ts'),
    },
  },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
