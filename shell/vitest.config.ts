import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  resolve: {
    // `conditions: ['browser']` is load-bearing. Copied from
    // packages/shared-ui/vitest.config.ts, NOT from apps/corpora-curator whose
    // config omits it because its tests are logic-only. Without it Svelte
    // resolves to its SERVER build, where `mount()` throws
    // `lifecycle_function_unavailable` before a single assertion runs.
    conditions: ['browser'],
    alias: [
      // `resolve.alias`, NEVER `source.alias`. A probe that got this wrong on
      // 2026-09-13 bundled the REAL @augment-it/workspace, found a live
      // workspace-service on this machine, and wrote a file into live client
      // data. This member is the FEDERATION HOST and its workspace singleton is
      // the one every remote shares — the blast radius of getting it wrong here
      // is the whole tree. The stub opens no socket and throws on every write
      // verb, and the tests ASSERT it is in play (a sandbox that is not
      // asserted is not a sandbox).
      // EXACT match, not a prefix: a bare string key would also rewrite
      // `@augment-it/workspace/types` to `<stub>/types`, which does not exist.
      { find: /^@augment-it\/workspace$/, replacement: resolve(__dirname, 'test/stubs/workspace.ts') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
