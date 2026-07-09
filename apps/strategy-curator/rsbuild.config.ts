import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Entry-point remote — strategy-curator. Pick/create a strategy, gather
// sources (metadata-first → fetch via Jina/PDF), pull extracts. Writes only
// through workspace capabilities (strategy.* / source.* / extract.* / tag.*).
// See context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.
// Own-origin asset prefix — see apps/chat/rsbuild.config.ts's comment for
// the full rationale (a federated remote's sub-chunks resolve against
// whatever assetPrefix it was compiled with, not the host's origin;
// dev.assetPrefix alone doesn't cover production builds).
const ASSET_PREFIX = process.env.PUBLIC_STRATEGY_CURATOR_ASSET_PREFIX || 'http://localhost:3017';

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
    assetPrefix: ASSET_PREFIX,
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
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: ASSET_PREFIX,
  },
});
