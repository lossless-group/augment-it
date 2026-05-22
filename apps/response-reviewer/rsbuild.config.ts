import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Fourth federated remote — the post-flight response-review surface. Same
// pattern as the other remotes (see the 2026-05-21_03 changelog: expose a
// mount function, no `shared` block, ship CSS as a side effect).
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'responseReviewer',
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
    title: 'augment-it · response-reviewer',
  },
  server: {
    port: 3005,
  },
  dev: {
    assetPrefix: 'http://localhost:3005',
  },
});
