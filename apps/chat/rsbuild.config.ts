import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Fifth federated remote — the in-app chat surface. Same shape as
// prompt-template-manager (mount-function exposure, no `shared` block,
// .css side-effect imports). See changelog entries:
// - 2026-05-21_03 — federation-meets-Svelte-5 lessons
// - 2026-05-23_01 — in-app chat v0.0.1 (this surface)
// Own-origin asset prefix — a federated remote's sub-chunks (async imports,
// __federation_expose_mount, etc.) resolve against whatever `assetPrefix`
// this build was compiled with, NOT the host page's origin. Missing this
// in production silently 404s every chunk beyond remoteEntry.js itself
// against the SHELL's origin (which serves its own SPA fallback HTML for
// unknown paths) — "SyntaxError: Unexpected token '<'" is that HTML being
// eval'd as JS. `dev.assetPrefix` alone only covers the local dev server;
// `output.assetPrefix` is the field that also applies to production builds.
const ASSET_PREFIX = process.env.PUBLIC_CHAT_ASSET_PREFIX || 'http://localhost:3006';

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
    assetPrefix: ASSET_PREFIX,
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
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: ASSET_PREFIX,
  },
});
