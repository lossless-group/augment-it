import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Records Surface — per-record connector firing for finding OfficialUpdate URLs.
// Standalone at :3011; mounted by the shell via federation.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'recordsSurface',
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
    injectStyles: false,
  },
  tools: {
    swc: {
      jsc: {
        target: 'es2022',
      },
    },
  },
  html: {
    title: 'augment-it · records-surface',
  },
  server: {
    port: 3011,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3011',
  },
});
