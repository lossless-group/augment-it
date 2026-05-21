import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federation host. Mounts remotes declared below; @augment-it/workspace
// is shared as a singleton so the host + every remote see the same
// reactive singleton instance — that's the load-bearing trick that makes
// Window microfrontends + Chat panel all subscribe to one workspace state
// (Per-App-Workspace-Conventions blueprint).
export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'shell',
      remotes: {
        recordCollector: 'recordCollector@http://localhost:3002/remoteEntry.js',
      },
      // No `shared` block — sharing Svelte 5's reactive runtime and a
      // .svelte.ts singleton across federation has known issues with the
      // current @module-federation/rsbuild-plugin (factory-undefined at
      // consume time, even with eager:true + bootstrap pattern). For the
      // walking skeleton, each side owns its own Svelte runtime and its
      // own workspace singleton. Cross-side state coherence is handled by
      // the WebSocket broadcast (record_set.created, row.updated) — both
      // sides connect to the same Workspace Service and stay in sync via
      // events, not via a shared in-memory singleton.
      // Revisit when adding the chat panel if the cross-federation
      // shared-singleton claim becomes load-bearing.
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
      jsc: {
        target: 'es2022',
      },
    },
  },
  html: {
    title: 'augment-it · shell',
  },
  server: {
    // Port 3000 is commonly squatted (Open WebUI on this machine, also
    // Next.js / Create-React-App / Open WebUI default). Using 3100 to
    // sit alongside :3001 (workspace-service) and :3002 (record-collector).
    port: 3100,
  },
});
