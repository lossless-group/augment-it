---
title: "Federation host meets Svelte 5 — three lessons we couldn't find in the docs"
lede: "augment-it now has a real Module Federation host. The shell at :3000 mounts the record-collector remote at :3002, and the architecture has a federation boundary for the first time. Getting there meant fighting three subtle Svelte-5-plus-MF interactions that the official docs gloss over: shared-singleton factories that wouldn't register, $effect_orphan errors from cross-runtime mounts, and component-scoped CSS that quietly disappears across federation chunk boundaries. Each one has a fix worth keeping."
publish: true
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Module-Federation
  - Svelte-5
  - Microfrontends
  - Federation-Host
  - Rsbuild
  - Cross-Runtime-Mount
  - Cross-Boundary-CSS
files_changed:
  - pnpm-workspace.yaml
  - package.json
  - shell/package.json
  - shell/rsbuild.config.ts
  - shell/tsconfig.json
  - shell/src/index.ts
  - shell/src/App.svelte
  - apps/record-collector/package.json
  - apps/record-collector/rsbuild.config.ts
  - apps/record-collector/src/index.ts
  - apps/record-collector/src/mount.ts
  - apps/record-collector/src/App.svelte
  - apps/record-collector/src/app.css
---

## Why Care?

If you only read the Module Federation getting-started page, you'd think federating a Svelte 5 app into a host is just "add the plugin, declare the remote, import it." That's true if your remote happens to be the toy `App.svelte` from a tutorial. It's not true the moment your component uses runes, scoped CSS, or has any non-trivial state — and the official docs don't currently say so.

This entry exists because we hit three failure modes back-to-back, none of which were obvious from the error messages, and we figured each one out the hard way. The fixes are small and portable. Writing them down now means the next time we add a remote (or someone else adds one), nobody has to repeat the discovery loop.

It also marks a real milestone: augment-it now has a federation host (`shell/` on `:3000`) that dynamically loads the record-collector remote from `:3002`. Both ports run side by side. The remote also still works standalone. Both modes share the same backend (NATS + workspace-service + ingest + xlsx-ingest + row-store) — the federation boundary is purely a frontend concern.

## What's New?

- **`shell/`** is now a real workspace package: `package.json`, Rsbuild config with Svelte 5 + `@module-federation/rsbuild-plugin` configured as a host, and a small `App.svelte` that does layout + nav + dynamic-import of remotes.
- **`apps/record-collector/`** now exposes itself as a federation remote in addition to running standalone. The exposed module is a **mount function**, not the component itself (see lesson 2 below).
- **`apps/record-collector/src/app.css`** — extracted stylesheet that imports as a side effect from both entry points. All selectors namespaced under `.rc-app`.
- **`pnpm-workspace.yaml`** updated: `shell` (no `*`, because the directory IS the package).
- **Root `package.json` workspaces** glob updated to match.
- **`@module-federation/enhanced` + `@module-federation/rsbuild-plugin`** added to devDeps at root.
- **Standalone modes preserved.** Record-collector still runs at `:3002` end-to-end (CSV/XLSX ingest, row editing). The federation packaging is additive.

## Lesson 1 — shared-singleton MF + Svelte 5 + `.svelte.ts` is currently a dead-end

**The pitch:** Module Federation says "declare your framework as a `shared` module with `singleton: true` and the host + remote will use the same instance." For Svelte 5 this is supposedly load-bearing: two parallel Svelte runtimes mean two reactive systems, and `$state` mutations in one won't propagate to subscribers in the other.

**What we tried:**

```ts
shared: {
  svelte: { singleton: true, requiredVersion: '*' },
  '@augment-it/workspace': { singleton: true, requiredVersion: '*' },
},
```

**What we got:**

```
RUNTIME-006: Invalid loadShareSync function call from runtime
hostName: 'shell', sharedPkgName: '@augment-it/workspace'
```

Adding the **bootstrap pattern** (entry is a dynamic import of the real app) fixed RUNTIME-006 and revealed the next error:

```
RuntimeError: factory is undefined
(webpack/sharing/consume/default/svelte/svelte)
```

Setting `eager: true` on the host's shared modules didn't fix it. Setting eager on both sides didn't fix it. Moving `svelte` from `devDependencies` to `dependencies` didn't fix it. The factory genuinely wasn't being registered for shared modules whose dependency chain includes preprocessed `.svelte.ts` files.

**What works instead:** drop `shared` entirely. Each side bundles its own copy of svelte and its own copy of `@augment-it/workspace`. The cost is a duplicated framework runtime in the host bundle. The benefit is everything actually loads.

**The architectural compensation:** cross-side state synchronization is handled by the **WebSocket broadcast** instead — both shell and remote can connect to the same Workspace Service, both receive `record_set.created` and `row.updated` events, both stay in sync via the wire we already built. Memopop's FlowState pattern uses a JS-runtime singleton because everything runs in one app; federation introduces a real boundary, and the right cross-boundary mechanism is the event bus, not shared memory. We were going to need to wire chat-package events through the WebSocket anyway, so this isn't a workaround — it's the architecture finding its own logic.

**Revisit:** if/when adding the in-app-agent chat panel turns out to need synchronous shared-state access (not just event reactions), this becomes important again. For now, the WS broadcast handles every cross-side case in the architecture.

## Lesson 2 — Don't expose a Svelte component; expose a mount function

After dropping `shared`, federation loaded cleanly. The shell fetched `recordEntry.js`, MF resolved the exposed module, the chunks downloaded with proper CORS — and the browser showed:

```
Uncaught Svelte error: effect_orphan
$effect can only be used inside an effect (e.g. during component initialisation)
```

**Why:** the remote's `App.svelte` has a `$effect(...)` block. When the shell imports `recordCollector/App` as a Svelte component and renders it inside the shell's component tree via `<Remote />`, the remote's effect attempts to register against the **shell's** Svelte runtime — which has no idea about the remote's reactive scope. Two separate Svelte runtimes don't share an effect-tracking context. The effect is orphaned the moment it tries to register.

**The fix:** the remote exposes a **mount function**, not a component:

```ts
// apps/record-collector/src/mount.ts
import { mount, unmount, type Component } from 'svelte';
import App from './App.svelte';

export function mountRecordCollector(target: HTMLElement) {
  const component = mount(App as Component, { target });
  return { destroy: () => unmount(component) };
}
```

```ts
// rsbuild.config.ts
exposes: {
  './mount': './src/mount.ts',
},
```

The shell creates a plain `<div bind:this={mountTarget}>`, dynamically imports the mount function, and calls it on the div. Now the remote's `mount(App, {target})` runs inside the **remote's own** Svelte runtime. The component's effects register against the remote's reactive scope, where they belong. No orphans.

The shell becomes a true framework-agnostic microfrontend host — it doesn't know or care what framework the remote uses. Future remotes could be React, Vue, vanilla JS; the mount-function contract is the only thing the shell sees. This is the textbook microfrontend pattern when framework-runtime singleton-sharing across the federation boundary isn't workable. It's documented in microfrontend literature; it's just not the *default* posture of MF's getting-started docs.

## Lesson 3 — Svelte's `append_styles` doesn't fire across the federation chunk boundary

With mount-function in place, the remote loaded, mounted, and rendered. The shell + remote talked to the backend. Capability invocations round-tripped. Then we noticed: **everything was unstyled.**

The component-scoped CSS in `App.svelte`'s `<style>` block — `.rc-layout`, `.row-card`, `.field-value`, etc. — was nowhere in the DOM. The elements rendered with their `class="rc-layout"` attributes but no matching CSS rule applied. In standalone mode at `:3002` everything looked right; in federation mode at `:3000` it was bare.

**Diagnosis:** Svelte 5 compiles `<style>` blocks to a CSS string embedded in the JS bundle, plus a runtime call:

```js
svelte_internal_client.append_styles($$anchor, $$css);
```

Inside `append_styles`, the actual DOM injection is wrapped in `effect(...)` — a reactive effect that runs on the next microtask and creates a `<style>` element in `document.head`. **That effect doesn't reliably fire when the component is mounted via a Module Federation dynamic import.** It might be an effect-scope timing issue when the chunk evaluates in the host's window context; it might be that the effect gets created but never flushed; the exact cause didn't matter because the workaround is clean.

**The fix:** ship CSS as CSS. Extract the styles to a real `.css` file. Import it as a module side effect from both entry points:

```ts
// index.ts (standalone)
import './app.css';
// ... rest of standalone entry

// mount.ts (federation)
import './app.css';
// ... rest of mount function
```

Webpack/rspack's CSS pipeline (style-loader in dev) handles the injection. When the module evaluates — whether in standalone mode or as a federation chunk — the CSS gets injected into `document.head`. Standard, well-tested behavior. No reliance on Svelte's runtime style injection.

**Discipline:** all selectors in `app.css` are namespaced under `.rc-app`, and the App template wraps its content in `<div class="rc-app">`. That ensures the styles can't bleed into the shell or into sibling remotes when more arrive. Equivalent to Svelte's component-scoped hash, just done by hand.

This pattern generalizes: **for any remote whose styles need to appear in federation mode, ship them as an imported `.css` file, not as a Svelte `<style>` block.** Same lesson applies to React's `styled-components` (ServerStyleSheet collisions across federation) and Vue's single-file-component scoped styles. The robust portable answer is plain CSS.

## The Bun question, while we're here

The pre-flight spec ([[Walking-Skeleton-Pre-Flight-Decisions]]) originally named **Bun** as the workspace-service runtime. That decision was already superseded earlier in this same session in writing — when the wire became WebSocket + NATS instead of HTTP-to-localhost-sidecar, the role that would have been Bun's disappeared entirely.

We confirmed again in this push: Bun is not coming back for the shell. The shell runs on Node + Rsbuild, same toolchain as the remote and the services. If a future domain microservice has a Bun-shaped problem (concurrent HTTP fetches, fast cold start), we'll add Bun for that service specifically — container-isolated, letting the heterogeneity be its own demo point. But shell + remote + workspace-service all stay on Node.

## How the shell and remote actually compose now

```
http://localhost:3000/  (the shell)
   │
   ├── shell's bundle loads:
   │     - Svelte 5 (its own copy)
   │     - shell/src/App.svelte (layout + nav + mountTarget div)
   │
   ├── shell's onMount fires:
   │     - dynamic import('recordCollector/mount')
   │     - MF runtime fetches http://localhost:3002/remoteEntry.js
   │     - then fetches the exposed-module chunks
   │     - mount.ts evaluates:
   │         ↳ import './app.css' (style-loader injects to document.head)
   │         ↳ exports mountRecordCollector
   │     - shell calls mountRecordCollector(mountTarget)
   │
   └── remote's mount runs:
         - remote's own Svelte 5 instance mounts App.svelte into the div
         - App.svelte's onMount calls workspace.connect(...)
         - WebSocket opens to ws://localhost:3001/ws (the workspace-service)
         - Record sets list populates, rows render, edits round-trip
```

The shell is now ~100 lines of Svelte that does layout + nav + dynamic-import. Adding a second remote is a six-line entry in the `REMOTES` array, plus configuring that remote to expose its own `./mount`. The architectural cost of a new remote is bounded and visible.

## Files Worth Knowing About

- `shell/src/App.svelte` — the federation host. Reads like a router: a list of remotes, an active selection, a mount target. Framework-agnostic by design.
- `apps/record-collector/src/mount.ts` — the federation-exposed mount function. Five lines of actual logic, plus a CSS side-effect import. Read alongside the lesson-2 commentary above; this file is the contract.
- `apps/record-collector/src/app.css` — namespaced styles. Read alongside lesson 3.
- `shell/rsbuild.config.ts` and `apps/record-collector/rsbuild.config.ts` — the MF configs. No `shared` blocks, intentionally. Inline comments explain why.

## What's Next

Phase 5 (originally "wire one federated remote through the workspace") is now genuinely done. The walking skeleton's full architectural arc is complete: backend (5 containers + NATS + WebSocket + dynamic schema), frontend (Svelte 5 workspace package + record-collector remote), federation host (shell + Module Federation + cross-runtime mount + cross-boundary CSS). Anything from here builds on this substrate.

Next moves, in increasing scope:

1. **A second remote.** Pick one of the empty `apps/*` stubs (`apps/highlight-collector` or `apps/insight-manager`). Build it as a Svelte 5 remote following the same mount-function + namespaced-CSS pattern. Adding a second remote is the second proof that the architecture scales.
2. **A second domain microservice.** Something like `research-service` subscribing to `row.research.requested` — the second proof that the "27th service is cheap" claim holds on the backend side, this time with semantic intent rather than just a second input format.
3. **The chat surface.** This is where the deferred shared-singleton question from lesson 1 may re-emerge. Most likely it resolves to "chat connects to the same WebSocket and reacts to the same broadcast events" — no shared-singleton required. We'll find out.
4. **Upsert / merge.** Still deferred ([[project_augment_it_recordset_open_features]]) — the duplicate record sets in the store are this problem made visible. Pick a primary-key approach and ship it.
5. **Retire `shell/rsbuild.config.ts`'s former React reference** has happened — but `apps/record-collector/package.json` still has dropped-React traces only in the lockfile. Cleanup pass when convenient.

## See also

- [[2026-05-21_01_Workspace-Walking-Skeleton-Phase-1]] — Phase 1 (containers boot).
- [[2026-05-21_02_Workspace-Phases-2-through-5]] — Phases 2 through 5 (the backend + Svelte 5 standalone).
- This entry — the federation milestone.
- [[Augment-It-Workspace-Walking-Skeleton]] — the plan.
- [[Per-App-Workspace-Conventions]] — the blueprint that called for a federation host; now has an actual implementation pointing at it.
