import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// The design-system portal. Exposed as a federation remote so the shell can
// mount it under its own header, AND runnable standalone on :3020.
//
// It is still not in DESIGN.md's member registry — it documents the system
// rather than consuming it as a product surface, so the per-member contract
// (prefix, root_class, tiering, its own DESIGN.md) does not apply.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'designSystem',
      filename: 'remoteEntry.js',
      exposes: { './mount': './src/mount.ts' },
      dts: false,
    }),
  ],
  source: { entry: { index: './src/index.ts' } },
  output: {
    target: 'web',
    overrideBrowserslist: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions'],
  },
  tools: { swc: { jsc: { target: 'es2022' } } },
  html: { title: 'augment-it · design system' },
  server: { port: 3020, cors: { origin: ['http://localhost:3100'] } },
  dev: { assetPrefix: 'http://localhost:3020' },
});
