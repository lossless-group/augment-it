import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  // `conditions: ['browser']` is load-bearing. Copied from
  // packages/shared-ui/vitest.config.ts and NOT from apps/corpora-curator,
  // whose config omits it because its tests are logic-only. Without it Svelte
  // resolves to its SERVER build, where `mount()` throws
  // `lifecycle_function_unavailable` before a single assertion runs.
  resolve: {
    conditions: ['browser'],
    alias: [
      // `resolve.alias`, NEVER `source.alias`. A probe that got this wrong on
      // 2026-09-13 bundled the REAL @augment-it/workspace, found a live
      // workspace-service on the machine, and wrote a file into live client
      // data. EXACT match, not a prefix: a bare string key would also rewrite
      // `@augment-it/workspace/types` to `<stub>/types`, which does not exist.
      { find: /^@augment-it\/workspace$/, replacement: resolve(__dirname, 'test/stubs/workspace.ts') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
