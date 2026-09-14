import { defineConfig } from 'vitest/config';

/**
 * Deliberately minimal — and deliberately WITHOUT a `resolve.alias` for
 * `@augment-it/workspace`.
 *
 * The sibling members' configs stub that alias because their suites `mount()`
 * components that reach for a live workspace-service; on 2026-09-13 a probe
 * that reached for `source.alias` instead of `resolve.alias` bundled the REAL
 * client and wrote a file into live client data. The safest version of that
 * stub is not needing it: this member's only suite READS ITS OWN SOURCE off
 * disk and asserts on the text. No component is mounted, so no module graph is
 * built, so there is nothing for an alias to get wrong.
 *
 * environment: 'node' for the same reason — no DOM is touched.
 */
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
