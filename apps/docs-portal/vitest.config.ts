import { defineConfig } from 'vitest/config';

/**
 * Deliberately minimal, and deliberately WITHOUT a `resolve.alias` for
 * `@augment-it/workspace`. Sibling configs stub that alias because their suites
 * `mount()` components that reach a live workspace-service; on 2026-09-13 a
 * probe that used `source.alias` instead bundled the REAL client and wrote a
 * file into live client data. The safest version of that stub is not needing
 * one: this suite READS ITS OWN SOURCE off disk. Nothing is mounted, so no
 * module graph is built, so no alias can be got wrong — which matters more
 * here than anywhere, because this member is a HOST that mounts other members'
 * galleries over the network at runtime.
 */
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
