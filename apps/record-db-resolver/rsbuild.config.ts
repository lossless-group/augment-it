import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federated remote — record-db-resolver. The GENERIC resolver UI: read a
// record set's rows, and per record confirm which canonical org it is (→
// additive enrich) or create a new one. Deliberately DB-AGNOSTIC — it holds
// no database credentials. All candidate-finding + writes happen server-side
// via the `resolver.*` capabilities (today served by the SurrealDB-specific
// record-surrealdb-resolver service; a different DB later = different backend,
// same UI). See context-v/specs/Record-DB-Resolver.md.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'recordDbResolver',
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
    title: 'augment-it · record-db-resolver',
  },
  server: {
    port: 3008,
  },
  dev: {
    assetPrefix: 'http://localhost:3008',
  },
});
