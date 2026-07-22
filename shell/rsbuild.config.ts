import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';

// Federation host. Mounts remotes declared below; @augment-it/workspace
// is shared as a singleton so the host + every remote see the same
// reactive singleton instance — that's the load-bearing trick that makes
// Window microfrontends + Chat panel all subscribe to one workspace state
// (Per-App-Workspace-Conventions blueprint).
//
// strategyCurator and chat are the only two remotes the humain-vc deploy
// (Build-Order Step 9) actually mounts — their URLs are env-configurable so
// a production build can point at real hosted remoteEntry.js files instead
// of localhost. The other twelve stay hardcoded: they belong to flows this
// deploy doesn't use, Module Federation remotes are lazy-loaded, and
// leaving them pointed at localhost is the same "no isolation, they error
// if poked" rule the build order already established, just now true for
// federation URLs too — nobody on this instance ever navigates to them.
// `|| default` (not `?? default`) deliberately — an unset Docker ARG
// resolves to an EMPTY STRING once assigned to ENV, not undefined, so `??`
// alone would silently ship `strategyCurator@` / `chat@` (no host) instead
// of falling back. Caught locally: a docker build with these vars unset
// produced "TypeError: object null is not iterable" deep in rspack's
// Module Federation remote-info resolution — an empty remote URL, not a
// missing one.
const STRATEGY_CURATOR_REMOTE = process.env.PUBLIC_STRATEGY_CURATOR_REMOTE || 'http://localhost:3017/remoteEntry.js';
const CHAT_REMOTE = process.env.PUBLIC_CHAT_REMOTE || 'http://localhost:3006/remoteEntry.js';

export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'shell',
      remotes: {
        recordCollector: 'recordCollector@http://localhost:3002/remoteEntry.js',
        promptTemplateManager: 'promptTemplateManager@http://localhost:3003/remoteEntry.js',
        requestReviewer: 'requestReviewer@http://localhost:3004/remoteEntry.js',
        responseReviewer: 'responseReviewer@http://localhost:3005/remoteEntry.js',
        chat: `chat@${CHAT_REMOTE}`,
        enhancedRecordsList: 'enhancedRecordsList@http://localhost:3007/remoteEntry.js',
        packRunner: 'packRunner@http://localhost:3009/remoteEntry.js',
        recordsSurface: 'recordsSurface@http://localhost:3011/remoteEntry.js',
        sortFilterLens: 'sortFilterLens@http://localhost:3013/remoteEntry.js',
        personEnrichment: 'personEnrichment@http://localhost:3015/remoteEntry.js',
        recordDbResolver: 'recordDbResolver@http://localhost:3008/remoteEntry.js',
        personDbResolver: 'personDbResolver@http://localhost:3010/remoteEntry.js',
        strategyCurator: `strategyCurator@${STRATEGY_CURATOR_REMOTE}`,
        affiliationRatingResolver: 'affiliationRatingResolver@http://localhost:3012/remoteEntry.js',
        orgWorkbench: 'orgWorkbench@http://localhost:3014/remoteEntry.js',
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
