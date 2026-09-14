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
    alias: [
      // `resolve.alias`, NEVER `source.alias`. A probe that got this wrong on
      // 2026-09-13 bundled a real client and wrote a file into live client
      // data. This member is the sharpest case in the federation: src/lib/
      // surreal.ts embeds SURREAL_URL/USER/PASS at build time and opens a
      // socket from the BROWSER, so a test that resolves it for real is one
      // import away from writing to the canonical database. AffiliationCard's
      // import graph does not reach it today; these aliases make sure a future
      // one fails loudly rather than connecting.
      // EXACT match, not a prefix: a bare string key would also rewrite
      // `@augment-it/workspace/types` to `<stub>/types`, which does not exist.
      { find: /^@augment-it\/workspace$/, replacement: resolve(__dirname, 'test/stubs/no-service.ts') },
      { find: /^surrealdb$/, replacement: resolve(__dirname, 'test/stubs/no-service.ts') },
      { find: /^\.\.\/lib\/surreal$/, replacement: resolve(__dirname, 'test/stubs/no-service.ts') },
    ],
  },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
