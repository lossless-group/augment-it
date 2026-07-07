import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federated remote — affiliation-rating-resolver. The write half of the
// Augment-from-Affiliations CSV round-trip: reimport a rating-edited CSV
// (uploaded through the existing Record Collector path), map columns once,
// then write relevance/relevance_note onto each row's `affiliations` edge
// via the affiliation.rate capability. No match/create — every row's
// person + org already exist in canonical; this only resolves the LOOKUP
// key (person_uuid, org_slug) and writes the rating. See
// context-v/specs/Augment-From-Affiliations.md.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'affiliationRatingResolver',
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
    title: 'augment-it · affiliation-rating-resolver',
  },
  server: {
    port: 3012,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3012',
  },
});
