---
date_created: 2026-07-06
date_modified: 2026-07-06
title: "Corpora Curator: workspace awareness fixed, domain type now operator-defined"
lede: "Strategy Curator is now Corpora Curator, on-screen: the app stopped being strategy-specific the day humain-vc needed the identical shape for theses. Two fixes riding along — the curator was silently stuck on a stale workspace after switching from the shell's header, and the domain type it writes into (previously a hardcoded 'strategy' constant) is now a plain text field the operator sets per corpus, no code change required to start a 'thesis' or anything else."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - apps/strategy-curator/src/curation.svelte.ts
  - apps/strategy-curator/src/App.svelte
  - apps/strategy-curator/src/StrategyPicker.svelte
  - apps/strategy-curator/src/SourceList.svelte
  - packages/workspace/src/index.ts
tags:
  - Progress-Update
  - Strategy-Curator
  - Corpora-Curator
  - Thesis-Curator
  - Workspaces
  - Domain-Catalog
  - Bug-Fix
---

## Why Care?

Right after the "Build Corpora" popdown shipped, the operator hit it live and
caught a real bug immediately: the curator's header showed "— no workspace —"
even though the shell's own header knew the active workspace was humain-vc.
Same session, the operator named the next structural gap — the app still
assumes every corpus is a "strategy," but humain-vc's corpora are "theses,"
and there will be more types after that. Both fixed.

## What's New?

- **Workspace awareness bug, fixed.** Each federation remote loads its own
  separate `@augment-it/workspace` singleton (no `shared` block in the
  shell's rsbuild config). The shared package already broadcasts a
  `WORKSPACE_CHANGED_EVENT` on every switch so remotes stay in sync — but
  `curation.svelte.ts`'s own local `clientSlug` mirror (the value actually
  threaded into every `domain.*`/`source.*` call) was a one-time snapshot
  taken at bootstrap, never re-synced. Switching workspaces from the shell's
  `WorkspaceSwitcher` updated the shared package's `active_client_id`
  correctly but left the curator silently scoped to whatever it saw first.
  Now the curator listens for the same broadcast and reconciles through one
  shared `applyWorkspaceChange` path, whether the switch happened here or
  anywhere else in the shell.
- **"Corpora Curator," on-screen.** The brand, section headers, and copy
  ("Corpora" / "Pick a corpus…" / "New corpus" / "‹ corpora") now match what
  the app actually is — a generic domain-type curator, not a strategy-only
  one. The package, folder, and remote id (`strategyCurator`) are unchanged;
  this is a display-copy rename, not a code-identity one.
- **Domain type, operator-defined.** `DOMAIN_TYPE` — a hardcoded `'strategy'`
  module constant threaded into every single capability call — is gone.
  Replaced with a reactive `domainType` field (persisted per-browser),
  editable via a new **Type** field on the "New corpus" form (free text,
  defaults to `'strategy'`). Creating a domain with a different type
  switches the active type and does a full list reload, so the operator
  immediately sees what they just created rather than it silently vanishing
  into a type the list isn't currently scoped to. The "writes to" preview
  line now computes the real pluralized folder (`theses/`, `strategies/`,
  `topics/`, …) via the same mapping content-ingest already uses server-side,
  instead of hardcoding `strategies/`.
- **Small loading-state fix, riding along.** The workspace pill now
  distinguishes "still connecting" from "connected but genuinely no
  workspace" instead of collapsing both into the same "— no workspace —"
  text — the exact ambiguity that made the original bug report a little
  harder to diagnose at a glance.

## What's Next

Build-Order step 5's remaining scope — a per-workspace *default* type
(so a fresh humain-vc session starts on "thesis" without the operator
typing it), singular/plural noun rendering through the rest of the UI, and
a `domain.retype` handler for moving an existing domain between types.
None of it blocks today's fix; typing the type once per session is a
reasonable floor.
