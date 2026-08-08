import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';

// The design-system portal. Deliberately NOT a federation remote — it is not in
// DESIGN.md's member registry, it is a development surface for looking at the
// token system, and it must load the FULL theme.css (all three mode blocks) so
// the mode toggle has something to switch between.
export default defineConfig({
  plugins: [pluginSvelte()],
  source: { entry: { index: './src/index.ts' } },
  output: {
    target: 'web',
    overrideBrowserslist: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions'],
  },
  tools: { swc: { jsc: { target: 'es2022' } } },
  html: { title: 'augment-it · design system' },
  server: { port: 3020 },
  dev: { assetPrefix: 'http://localhost:3020' },
});
