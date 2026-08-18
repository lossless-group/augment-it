---
title: "Module Federation + Rsbuild — Dev Loop Gotchas"
lede: >-
  Five Rsbuild + Module Federation gotchas, cross-origin HMR first: none block adoption, all cost time if you don't see them coming.
date_created: 2026-05-18
date_modified: 2026-05-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Blueprint
  - Module-Federation
  - Rsbuild
  - Rspack
  - HMR
  - Dev-Environment
  - Gotchas
status: Draft
site_uuid: b3a24dfa-9a28-412d-8b6f-37fb28e645fb
hex_code: 7s4424
date_authored_initial_draft: 2026-05-18
date_authored_current_draft: 2026-05-18
---

# Module Federation + Rsbuild — Dev Loop Gotchas

## Why this blueprint exists

The Augment-It rewrite picked **rsbuild + Module Federation 2.0** as the bundler substrate ([[Federation-and-Bundler-Decision]]). Rsbuild is unfamiliar territory for the team. This doc captures the five operational gotchas to know going in, so they don't show up as a multi-hour debugging session each.

The gotchas aren't show-stoppers — every one of them has a known fix in a handful of config lines. The cost is silent-failure-shaped: things look like they're working until they aren't, and the symptoms point away from the actual cause. Documented here so the team and future AI sessions can short-circuit the diagnosis.

## 1. Cross-origin HMR — the silent-update killer

**What it is.** In Module Federation, each microfrontend runs its own dev server on its own port: host on `:3000`, remote on `:3001`, etc. When you save a file in a remote, that remote's dev server pushes an HMR update over a WebSocket. The host page (different origin) needs to receive that WebSocket message and apply it.

**The default behavior.** Rsbuild's dev server treats `:3001` and `:3000` as different origins. By default, the remote's dev server doesn't allow the host's page to subscribe to its HMR WebSocket. Connection drops silently.

**Symptoms.**

- You save a file in the remote. Its own dev tab shows `[HMR] update received`. The host page that mounted the remote does not update.
- Half-updates: a new module is loaded on the next user action, but live state is stale. Bugs appear that don't reproduce on hard reload.
- Works in Chrome but not Safari (the two browsers treat the WS allowlist subtly differently).
- Works locally but breaks when two devs run host + remote on different LAN IPs.
- Works in dev but the preview-deploy environment shows the same broken pattern.

**The fix.** ~5–10 lines per app in `rsbuild.config.ts`:

```ts
// in each remote
export default {
  server: {
    cors: true,                    // allow cross-origin
    host: '0.0.0.0',               // accept non-localhost connections
    port: 3001,                    // pin it
  },
  dev: {
    client: {
      protocol: 'ws',
      host: 'localhost',
      port: 3001,
      path: '/rsbuild-hmr',        // explicit path
    },
    writeToDisk: true,             // helps with some federation runtime fetches
  },
};
```

```ts
// in the host
export default {
  server: { port: 3000, cors: true },
  dev: {
    client: { protocol: 'ws', host: 'localhost', port: 3000 },
  },
};
```

The combination of CORS, an explicit WS path, and same protocol/host on the client config is what makes HMR survive cross-origin. The exact incantation evolves with rsbuild versions — verify against the version pinned in `package.json` when this comes up.

**Verification.** Open browser devtools → Network → WS. You should see one persistent WebSocket per dev server origin, and saving a file in a remote should fire a message visible in the host's WS connection to that remote's URL.

## 2. TypeScript across federation boundaries — `@module-federation/dts-plugin`

**What it is.** When a host imports `import { RecordList } from '@aug/record-collector/RecordList'`, the federation runtime fetches that module at runtime — but **TypeScript has no idea what shape it has** because the source lives in a different package built separately. Without help, the host treats the import as `any`, you lose autocomplete, and type errors in federated boundaries are invisible until they manifest at runtime.

**The fix.** `@module-federation/dts-plugin`. It emits `.d.ts` artifacts at the federation boundary on the remote side and consumes them on the host side. Set up once per host + per remote in their respective `rsbuild.config.ts`.

**Why this bites teams.** It's optional from the federation runtime's perspective — federation will *work* without it. So teams ship to staging happily, then discover their entire shared API is `any`-typed and a refactor broke three remotes silently. The discipline is to **set up dts-plugin before writing the first federated module**, not retrofit it after.

**Cost of skipping.** Real. The whole point of TypeScript is the contracts at module boundaries; federation boundaries are the *highest-value* place for typing because they're literally the seam between independently-built deployables.

## 3. Module Federation config lives inside `tools.rspack` — the escape hatch

**What it is.** Rsbuild has a nice declarative API for most things, but Module Federation 2.0 config goes inside the **`tools.rspack`** escape hatch — i.e., you write the federation plugin config in raw rspack/webpack shape, not in rsbuild-native shape.

```ts
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';

export default {
  tools: {
    rspack: (config, { appendPlugins }) => {
      appendPlugins(
        new ModuleFederationPlugin({
          name: 'host',
          remotes: {
            recordCollector: 'recordCollector@http://localhost:3001/remoteEntry.js',
            // ...
          },
          shared: { react: { singleton: true }, 'react-dom': { singleton: true } },
        }),
      );
    },
  },
};
```

**Why this bites.** The rsbuild docs are full of nice declarative examples. Someone looking for "module federation" in those docs finds a brief paragraph that points at the rspack-config-shape. If they don't realize they have to step into the escape hatch, they reach for the wrong API surface.

**Cost of getting it wrong.** Lost time, mostly. The error messages do eventually point at the right shape, but only after a few iterations of "why isn't this config field doing anything."

## 4. Module Federation 1.0 vs 2.0 — most online tutorials are 1.0

**What it is.** Module Federation was born in webpack 5 (call it MF 1.0). The Module Federation team rewrote it as MF 2.0 with a new runtime, new plugin shape, new dts-plugin, and a different mental model for how shared dependencies negotiate versions. The 2.0 release is recent (~2024). **Most blog posts, Stack Overflow answers, and tutorials are still MF 1.0.**

**Symptoms of accidentally mixing them.**

- Config that "looks right" but produces a runtime that doesn't load remotes
- `Shared module is not available for eager consumption` errors that vanish in some configs and reappear in others
- The dts-plugin doesn't work at all (it's MF 2.0 only)
- "Why is everyone's example using `webpack.container.ModuleFederationPlugin` and mine is `@module-federation/enhanced`?" — that's the version split

**The fix.** Always reach for `@module-federation/enhanced` (or `@module-federation/rsbuild-plugin` which wraps it). When reading a tutorial, **check the date and the package import** — anything pre-2024 or importing from `webpack.container.*` is 1.0 and should be translated, not copied.

**A safer default.** Use the [official Module Federation examples repo](https://github.com/module-federation/module-federation-examples) as the reference, filter to the rsbuild + 2.0 examples specifically, and copy from there.

## 5. Plugin ecosystem smaller than Vite — but rsbuild can eat webpack plugins

**What it is.** Vite has a vast plugin ecosystem built up over the last few years. Rsbuild's official plugin set is smaller. But: **rspack is webpack-API-compatible**, which means most webpack plugins work in rsbuild via the `tools.rspack` escape hatch. The intersection of "thing rsbuild can't do natively and no webpack plugin does it either" is small in practice.

**What rsbuild has first-class.** React, Vue, Svelte, Tailwind 4, MDX, Sass, PostCSS, image processing, SVG, type checking. The common stuff is covered.

**Where it bites.** Niche Vite plugins — usually doing some specific transformation or dev-server hack — may not have a direct equivalent. Workarounds: (a) find the webpack equivalent, (b) write a quick rspack loader, (c) do the transformation pre-build.

**Cost.** Mostly research time. Once you accept "I need to look harder for rsbuild equivalents than I would for Vite," you adjust.

## When to read this doc

- **Setting up a new app in augment-it** — read all five.
- **Debugging an HMR issue** — read #1.
- **Type errors are silently `any` across federation boundaries** — read #2.
- **Plugin config doesn't take effect** — check #3, then #4.
- **Following an online tutorial that doesn't match what rsbuild reports** — read #4.
- **"Does rsbuild support X?"** — read #5, then check the official rsbuild plugin list before assuming.

## Related

- [[Federation-and-Bundler-Decision]]
- [[Tanuj-Request-Reviewer-As-Built]] — the prior Vite + MF 1.0 federation experiment
- Official Module Federation 2.0 docs: https://module-federation.io
- Rsbuild docs: https://rsbuild.dev
