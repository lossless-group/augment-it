---
date_created: 2026-07-22
date_modified: 2026-07-22
title: "The org-workbench remote ships — 'Augment from DB' becomes the sixth flow, with a live org card and a ➕ on every list"
lede: "The first of the flow's two new microfrontends: pick 'Augment from DB' at the front door, autocomplete to a canonical org (names, aliases, or domains), and work its card — identity/social links, pulse streams, corpus items — each list additive in place. Plus the verb the spec missed: organization.streams.add, proven live against The Aspen Institute's blog."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - apps/org-workbench/package.json
  - apps/org-workbench/tsconfig.json
  - apps/org-workbench/rsbuild.config.ts
  - apps/org-workbench/src/index.ts
  - apps/org-workbench/src/mount.ts
  - apps/org-workbench/src/css.d.ts
  - apps/org-workbench/src/app.css
  - apps/org-workbench/src/App.svelte
  - apps/org-workbench/src/OrgSearch.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/lib/types.ts
  - shell/src/flows.svelte.ts
  - shell/src/remotes.ts
  - shell/rsbuild.config.ts
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - pnpm-lock.yaml
  - context-v/plans/Augment-From-DB-Phase-2-Org-Workbench-Remote.md
tags:
  - Progress-Update
  - Augment-From-DB
  - Org-Workbench
  - Microfrontend
  - Module-Federation
---

# Org-workbench ships — the sixth flow gets its front door

Phase 2 of [[../context-v/specs/Augment-From-DB-Flow.md]]: `apps/org-workbench` (:3014) is scaffolded, federation-registered, and wired as the **"Augment from DB"** flow — the sixth entry in the shell's Flows popdown and the second flow whose input is the canonical layer rather than a CSV.

## What shipped

**The remote.** Copy-adapted from person-db-resolver's proven scaffold: credential-free (everything rides `workspace.invoke` per spec D1), client derived from `workspace.active` with `augment-it:workspace-changed` handling (a client switch drops the card rather than show rows the new client may not access), last-worked org restored from localStorage on remount. `OrgSearch` debounces 300ms over the now-alias-aware `resolver.search` with a stale-response guard; `OrgCard` is one screen that views and edits in place; `AdditiveList` is the generic organ — kind badge, host, date, inline ➕ with per-list localized errors, "added ✓" pulse.

**One spec gap closed.** The spec's Phase 2 assumed existing add verbs covered all three lists — but `media_streams[]` had no single-entry verb (streams only ever arrived via `resolver.apply`'s batch path). `organization.streams.add` now exists: mirrors `addOrgLink`, reuses `shapeStream` (kind auto-inferred, `party: 'first_party'`), with handler + capability map + timeout.

**Shell registration.** `AUGMENT_FROM_DB_ROTATION = ['orgWorkbench']`, the `augmentFromDb` FLOWS entry, the REMOTES entry, and the federation map line — the exact "adding a flow is a FLOWS entry + a rotation array" shape the front-door refactor promised.

## Proof

- svelte-check: 0 errors / 0 warnings; org-workbench and shell both build (remoteEntry.js emitted); both touched services typecheck clean.
- Dev-server smoke: `:3014/remoteEntry.js` → HTTP 200.
- `organization.streams.add` live: The Aspen Institute went 0 → 1 streams with `https://www.aspeninstitute.org/blog/` inferred as `blog_index` / `first_party`, visible on `organization.detail` re-read.
- Phase 1 proof re-run as regression: 7/7 green (detail now shows `streams=1`).

Browser walk-through (Flows popdown → search → card → ➕ on each list) is the operator's remaining check — everything scriptable is scripted.

## What's next

Phase 3: the `search-and-add` remote (:3016) — the always-editable search term, the provider palette over `connectors.inventory`, result rows with one-click add, and the `augment-it:search-request` / `entity-updated` event loop that pairs it with this card.
