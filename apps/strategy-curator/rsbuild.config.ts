import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Entry-point remote — strategy-curator. Pick/create a strategy, gather
// sources (metadata-first → fetch via Jina/PDF), pull extracts. Writes only
// through workspace capabilities (strategy.* / source.* / extract.* / tag.*).
// See context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'strategyCurator',
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
    title: 'augment-it · strategy-curator',
  },
  server: {
    port: 3017,
  },
  dev: {
    assetPrefix: 'http://localhost:3017',
  },
});
