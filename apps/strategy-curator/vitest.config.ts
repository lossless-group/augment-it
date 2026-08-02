import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true } })],
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', testTimeout: 10_000 },
});
