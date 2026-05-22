import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Second federated remote. Same pattern as record-collector — see the
// 2026-05-21_03 changelog for the three federation-meets-Svelte-5 lessons:
// expose a mount function (not a component), no `shared` block, ship CSS
// as a plain .css file imported as a side effect.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'promptTemplateManager',
      filename: 'remoteEntry.js',
      exposes: {
        './mount': './src/mount.ts',
      },
      dts: false,
    }),
  ],
  source: {
    entry: { index: './src/index.ts' },
  },
  output: {
    target: 'web',
    overrideBrowserslist: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions'],
  },
  tools: {
    swc: {
      jsc: { target: 'es2022' },
    },
  },
  html: {
    title: 'augment-it · prompt-template-manager',
  },
  server: {
    port: 3003,
  },
  dev: {
    assetPrefix: 'http://localhost:3003',
  },
});
