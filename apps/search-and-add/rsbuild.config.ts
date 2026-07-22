import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federated remote — search-and-add. The second surface of the "Augment from
// DB" flow: launched from any 🔍 on the org-workbench card (pairing tile,
// spec D2), it shows the search term in an always-editable bar, fires through
// the provider palette (SearXNG free default, Exa/Tavily/SerpApi as peers via
// search.fire), and every result row one-click-adds to the launching entity's
// list. Deliberately its own remote, not a component inside org-workbench —
// the same surface will serve person cards (Phase 4) and other flows later.
// See context-v/specs/Augment-From-DB-Flow.md.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'searchAndAdd',
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
    title: 'augment-it · search-and-add',
  },
  server: {
    port: 3016,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3016',
  },
});
