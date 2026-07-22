import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federated remote — org-workbench. The first surface of the "Augment from
// DB" flow: start from a canonical SurrealDB organization (not a CSV row),
// smart-search to it, and work its card — identity/social links, pulse
// streams, corpus items — with an additive ➕ on every list. Credential-free
// by design: every read/write rides workspace.invoke → NATS →
// record-surrealdb-resolver (spec decision D1).
// See context-v/specs/Augment-From-DB-Flow.md.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'orgWorkbench',
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
    title: 'augment-it · org-workbench',
  },
  server: {
    port: 3014,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3014',
  },
});
