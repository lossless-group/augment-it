import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Fifth federated remote — the in-app chat surface. Same shape as
// prompt-template-manager (mount-function exposure, no `shared` block,
// .css side-effect imports). See changelog entries:
// - 2026-05-21_03 — federation-meets-Svelte-5 lessons
// - 2026-05-23_01 — in-app chat v0.0.1 (this surface)
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'chat',
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
    title: 'augment-it · chat',
  },
  server: {
    // 3006 — next after 3005 (response-reviewer). Avoiding :3000 per
    // the user's port discipline (Open WebUI lives there).
    port: 3006,
  },
  dev: {
    assetPrefix: 'http://localhost:3006',
  },
});
