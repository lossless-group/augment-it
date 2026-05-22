import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Third federated remote — the pre-flight request-review surface. Same
// pattern as record-collector / prompt-template-manager (see the
// 2026-05-21_03 changelog for the federation-meets-Svelte-5 lessons:
// expose a mount function, no `shared` block, ship CSS as a side effect).
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'requestReviewer',
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
    title: 'augment-it · request-reviewer',
  },
  server: {
    port: 3004,
  },
  dev: {
    assetPrefix: 'http://localhost:3004',
  },
});
