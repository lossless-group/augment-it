import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Entry-point remote — corpora-curator. Pick/create a strategy, gather
// sources (metadata-first → fetch via Jina/PDF), pull extracts. Writes only
// through workspace capabilities (strategy.* / source.* / extract.* / tag.*).
// See context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.
// Own-origin asset prefix — see apps/chat/rsbuild.config.ts's comment for
// the full rationale (a federated remote's sub-chunks resolve against
// whatever assetPrefix it was compiled with, not the host's origin;
// dev.assetPrefix alone doesn't cover production builds).
// Missing this does not fail the build — it ships a remote that loads and then
// breaks on its first async sub-chunk, because the prefix falls back to
// localhost. `||` not `??`: an unset Docker ARG arrives as an empty string.
const ASSET_PREFIX = process.env.PUBLIC_CORPORA_CURATOR_ASSET_PREFIX || 'http://localhost:3017';

export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'corporaCurator',
      filename: 'remoteEntry.js',
      exposes: {
        './mount': './src/mount.ts',
        // The member's component library. A second contract alongside the
        // product surface: `./mount` is what this member does, `./gallery` is
        // what it is made of. Same bundle and same stylesheet, so the specimens
        // are the real components rather than a copy that drifted.
        // See context-v/specs/Federated-Component-Libraries.md.
        './gallery': './src/gallery/mount.ts',
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
    title: 'augment-it · corpora-curator',
  },
  server: {
    port: 3017,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: ASSET_PREFIX,
  },
});
