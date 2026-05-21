import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Svelte 5 $state runes require native class fields. Force the JS toolchain
// to keep class fields native (ES2022+) instead of lowering them to
// _define_property — which would break $state's placement invariant.
//
// Module Federation: serves as both standalone (port 3002 / index.html) AND
// as a remote consumed by the shell. The exposed module './App' is the same
// Svelte component the standalone build uses — no duplicated entry point.
//
// Shared-singleton discipline: svelte + @augment-it/workspace MUST be
// singletons across the federation boundary. Otherwise the shell gets one
// reactive runtime + one workspace instance, the remote gets a different
// pair, and the whole "host and remote subscribe to the same singleton"
// premise breaks. See Per-App-Workspace-Conventions blueprint.
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'recordCollector',
      filename: 'remoteEntry.js',
      exposes: {
        // Expose a mount function rather than the component itself. The
        // remote owns its own Svelte runtime; the shell calls mount on a
        // host-provided div. See mount.ts for the rationale.
        './mount': './src/mount.ts',
      },
      // No `shared` block. See shell/rsbuild.config.ts comment.
      dts: false,
    }),
  ],
  source: {
    entry: { index: './src/index.ts' },
  },
  output: {
    target: 'web',
    overrideBrowserslist: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions'],
    // Extract CSS to separate files (default in prod, override here for dev).
    // Required for Module Federation: when the shell loads this remote's
    // exposed module, the MF runtime delivers the CSS assets listed in
    // mf-manifest.json's css.sync array. With injectStyles:true the CSS
    // would be inlined in JS and rely on Svelte's append_styles effect,
    // which doesn't fire reliably across federation chunk boundaries.
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
    title: 'augment-it · record-collector',
  },
  server: {
    port: 3002,
  },
  dev: {
    assetPrefix: 'http://localhost:3002',
  },
});
