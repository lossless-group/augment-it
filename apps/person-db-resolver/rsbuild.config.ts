import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federated remote — person-db-resolver. Sibling to record-db-resolver, but
// for PEOPLE rows: match-or-create a person, then independently match-or-
// create their org and RELATE the affiliation with a role. No opportunity
// concept (that's an org/CRM concept). See
// context-v/plans/Person-Aware-Canonical-Resolver-Extension.md for why this
// is a separate remote rather than a mode inside record-db-resolver.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'personDbResolver',
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
    title: 'augment-it · person-db-resolver',
  },
  server: {
    port: 3010,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3010',
  },
});
