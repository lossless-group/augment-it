---
title: "Seventeen mount files become one, and `pnpm build` works for the first time"
lede: "A knowledge graph over the codebase found eleven micro-frontend mount files differing by a single line each, 250 lines nothing imports, and a task runner that was never installed. All of it is gone — 466 lines lighter, 19 packages building, 1,494 files typechecking clean."
date_created: 2026-08-06
date_modified: 2026-08-06
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - packages/federation/src/index.ts
  - apps/*/src/mount.ts
  - apps/*/tsconfig.json
  - tsconfig.base.json
  - services/workspace/src/types.ts
  - services/social-search/src/search.ts
  - package.json
  - turbo.json
tags:
  - Augment-It
  - Refactor
  - Module-Federation
  - Monorepo
  - Dead-Code
  - Knowledge-Graph
---

# Seventeen mount files become one

We have never refactored this codebase. Seventeen micro-frontends and eleven
services got built one at a time, each correct on its own, none of them looking
sideways at the last. That accrues a specific kind of debt — not bugs, but
repetition with no home — and the only honest way to find it was to stop
guessing and measure.

So we built a knowledge graph of the source: 4,330 nodes and 6,011 directed
edges over 490 files, for zero tokens, because code is parsed structurally
rather than by a model. Then we verified every candidate it surfaced against
the actual files, because a graph tells you where to look and not what is true.

## What it found, and what we did

**Eleven of the seventeen `mount.ts` files differed from each other by exactly
one line** — the exported function name. The other six differed only in
comments. Four hundred and six lines of it, none carrying distinct behaviour.
They now share one factory in a new `@augment-it/federation` package, and each
member is down to twelve lines.

The nervous question is whether sharing code costs a micro-frontend its
independence. It does not, and that is structural rather than hopeful: the
federation host declares no `shared` block, so a workspace import is **inlined
into each remote's own bundle at build time**. One source of truth in the repo,
seventeen independent artifacts, every remote still booting with every other
remote down. We proved it — `record-collector`'s built stylesheet is
byte-identical before and after, same content hash.

It also puts the repo's most fragile constraint in one place. `theme.css` must
load before a member's `app.css`, or that member's `var()` references resolve
against tokens that do not exist yet. That rule was previously restated in
seventeen file headers and enforced by nobody.

**Two hundred and fifty lines that nothing imports** are deleted: an
`OrgCreate.svelte` whose five siblings are all wired up, and two orphaned
`bundles.ts` modules kept alive by a comment that pointed at them without
importing them.

**`pnpm build` now works, for the first time in this repo's history.** It
called `turbo run build`, and turbo was never a dependency and was never
installed. Turbo also had no job here: its whole purpose is ordering a
dependency graph, and no package in `packages/` has a build step — they export
raw source, bundled by each app. The task graph had zero edges. `turbo.json`
also used a Turbo v1 key renamed in v2, and declared Next.js output paths in a
repo that emits `dist/`. It is gone; the root scripts use pnpm's own recursive
runner.

**The one import cycle is broken.** `capabilities.ts` and `searches.ts` pointed
at each other. It was type-only and therefore harmless at runtime, but it made
the module graph lie about which direction the dependency runs.

**Three tsconfigs became one.** The apps carried three byte-distinct variants in
an 8/7/2 split — drift, not intent. Each app's config is now four lines.

## The finding that changes the roadmap

We expected the frontend to be full of copy-pasted CSS waiting to be deleted.
**It is not.** Of 1,392 distinct selectors across 5,434 lines of app CSS,
**1,386 are unique to a single app.** The six shared ones are keyframe stops
and media queries.

There is almost nothing to deduplicate. There are seventeen independently
invented vocabularies that have never had to agree. That inverts the component
library from a consolidation job into greenfield extraction plus migration —
worth knowing before starting rather than after. The token layer underneath is
already working: 1,519 token references against 490 hardcoded escapes.

## Verified, not assumed

19 packages build. 1,494 files pass `svelte-check` with zero errors. Every test
suite passes except the end-to-end group, which needs Docker running and was
skipped. Net **−466 lines across 65 files**.

One caveat we are keeping visible: "nothing imports this" is a candidate list,
not a verdict. Two components first looked dead and were not — they are
imported through package subpath exports that static analysis cannot follow.
Everything deleted here was confirmed by hand afterwards.

Full backlog, including the deferred items and why they were deferred:
`context-v/refactors/Structural-Refactors-Surfaced-by-the-Codebase-Graph.md`.
