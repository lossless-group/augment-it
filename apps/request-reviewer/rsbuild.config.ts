import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Third federated remote — the pre-flight request-review surface. Same
// pattern as record-collector / prompt-template-manager (see the
// 2026-05-21_03 changelog for the federation-meets-Svelte-5 lessons:
// expose a mount function, no `shared` block, ship CSS as a side effect).
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'requestReviewer',
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
  },
  tools: {
    swc: {
      jsc: { target: 'es2022' },
    },
  },
  html: {
    title: 'augment-it · request-reviewer',
  },
  server: {
    port: 3004,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3004',
  },
});
