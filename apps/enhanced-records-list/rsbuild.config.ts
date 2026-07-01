import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Sixth federated remote — the record-grained checkpoint surface that
// sits between enrichment passes. See:
//   context-v/specs/Enhanced-Records-List-and-Promotion-Checkpoint.md
//   context-v/blueprints/Original-and-Enhanced-Record-Instances.md
//
// Port 3007 — chat took 3006. Pattern matches apps/chat: mount function
// exposure, no `shared` block, .css side-effect imports.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'enhancedRecordsList',
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
    title: 'augment-it · enhanced-records-list',
  },
  server: {
    port: 3007,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3007',
  },
});
