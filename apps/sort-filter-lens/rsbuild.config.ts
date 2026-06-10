import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Seventh federated remote — sort-filter-lens. The first Lens; member of
// the AUGMENT composite alongside promptTemplateManager and packRunner.
// Renders the active record set as a sorted (later: filtered) list so the
// operator can build their tier-2 worklist before swapping back to Pack
// Firing to act on it.
//
// Spec: context-v/specs/Records-Surface-Sort-Step-and-UI.md
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'sortFilterLens',
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
    title: 'augment-it · sort-filter-lens',
  },
  server: {
    port: 3013,
  },
  dev: {
    assetPrefix: 'http://localhost:3013',
  },
});
