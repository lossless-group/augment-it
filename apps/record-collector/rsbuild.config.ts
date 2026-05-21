import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';

// Svelte 5 $state runes require native class fields. Force the JS toolchain
// to keep class fields native (ES2022+) instead of lowering them to
// _define_property — which would break $state's placement invariant.
export default defineConfig({
  plugins: [pluginSvelte()],
  source: {
    entry: { index: './src/index.ts' },
  },
  output: {
    target: 'web',
    overrideBrowserslist: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions'],
  },
  tools: {
    swc: {
      jsc: {
        target: 'es2022',
      },
    },
  },
  html: {
    title: 'augment-it · record-collector',
  },
  server: {
    port: 3002,
  },
});
