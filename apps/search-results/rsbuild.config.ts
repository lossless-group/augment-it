import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federated remote — search-results. The queue where every agent search
// lands: a persistent right rail (the chat rail's mirror) rendering the
// workspace service's search registry as cards — collapsed while running,
// signalling on arrival, expanding into the accept surfaces, dismissed when
// dealt with. Fire many, walk away, triage on arrival.
// See context-v/specs/Search-Results-Queue-Remote.md.
//
// Port 3018 — the spec said 3017, but strategy-curator had already claimed
// it by build time.
// Own-origin asset prefix for production (chat/strategy-curator pattern) —
// sub-chunks resolve against the prefix baked at build, not the host page.
const ASSET_PREFIX = process.env.PUBLIC_SEARCH_RESULTS_ASSET_PREFIX || 'http://localhost:3018';

export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'searchResults',
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
    title: 'augment-it · search-results',
  },
  server: {
    port: 3018,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3018',
  },
});
