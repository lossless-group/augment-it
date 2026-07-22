---
date_created: 2026-07-22
date_modified: 2026-07-22
title: "The search-and-add remote ships — editable search terms, a provider palette, and one-click add wired back to the org card"
lede: "The flow's second microfrontend: every 🔍 on the org card opens a paired search rail with the term in an always-editable bar, providers a chip away (SearXNG preselected, Exa/Tavily/SerpApi as peers), and every result row one ➕ from landing on the launching entity's list — with the card refetching the instant it does."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - apps/search-and-add/package.json
  - apps/search-and-add/tsconfig.json
  - apps/search-and-add/rsbuild.config.ts
  - apps/search-and-add/src/index.ts
  - apps/search-and-add/src/mount.ts
  - apps/search-and-add/src/css.d.ts
  - apps/search-and-add/src/app.css
  - apps/search-and-add/src/App.svelte
  - apps/search-and-add/src/TermBar.svelte
  - apps/search-and-add/src/ProviderPalette.svelte
  - apps/search-and-add/src/ResultRow.svelte
  - apps/search-and-add/src/ResultsList.svelte
  - apps/search-and-add/src/lib/types.ts
  - apps/search-and-add/src/lib/search-client.ts
  - apps/search-and-add/src/lib/search-context.svelte.ts
  - apps/org-workbench/src/lib/search-request.ts
  - apps/org-workbench/src/lib/types.ts
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - shell/src/remotes.ts
  - shell/rsbuild.config.ts
  - pnpm-lock.yaml
  - context-v/plans/Augment-From-DB-Phase-3-Search-And-Add-Remote.md
tags:
  - Progress-Update
  - Augment-From-DB
  - Search-And-Add
  - Microfrontend
  - Search-Providers
---

# Search-and-add ships — the flow's heartbeat loop is wired

Phase 3 of [[../context-v/specs/Augment-From-DB-Flow.md]]: `apps/search-and-add` (:3016) exists, and the spec's search→add sequence diagram is now real chrome. Click 🔍 next to any list on the org card → the shell opens the `orgWorkbench+searchAndAdd` pairing (card keeps 55%) → the seeded term sits in an editable bar → results land → one ➕ per row adds to exactly the list that launched the search → the card refetches via `augment-it:entity-updated`.

## What shipped

**The remote.** `TermBar` is the standing constraint made chrome — the term is always visible, always editable, Enter re-fires. `ProviderPalette` renders `connectors.inventory` as chips (`short_label` + cost tier, paid tiers dash-bordered, needs-env dark and unclickable, "auto" = registry free-tier-first). `ResultRow` carries the one-click ➕ with per-row added/error state — re-adds are server-side dedup'd anyway. Auto-fires once per fresh envelope: searches are reads; the gating thesis governs writes, and every write here is one deliberate click.

**The launch contract, hardened (D2 refinement).** The `augment-it:search-request` CustomEvent alone is racy — search-and-add mounts asynchronously when its pairing first opens, so a dispatch-then-mount ordering would drop the payload. The envelope therefore ALSO persists to `localStorage['augment-it:search-request']` (the repo's established cross-remount pattern); the remote reads it on mount, then listens live. `org-workbench`'s `requestSearch()` does all three writes in order: localStorage → search-request event → `augment-it:navigate {remoteId:'searchAndAdd'}`.

**Verb routing.** org: links/streams/corpus → the three `organization.*.add` verbs; person: links/corpus → the two `person.*.add` verbs (persons have no streams — the combination is guarded at both the client and App level). Person-shaped envelopes are fully wired but nothing dispatches them until Phase 4's people reveal.

**Seed terms, hardcoded v1** (spec open question stands): links `"<name>" LinkedIn` · streams `"<name>" blog` · corpus `"<name>" news`. The operator rewrites them freely — that's the point of the TermBar.

## Proof

svelte-check 0/0 on both remotes; both build plus the shell; `:3016/remoteEntry.js` → HTTP 200; Phase 1 proof re-run 7/7 (the `search.fire` + inventory paths this remote consumes). The full browser loop — 🔍 → pairing opens → edit term → swap to Exa → ➕ → card refreshes → dedup on second ➕ — is the operator's walk-through; every scriptable leg beneath it is scripted.

## What's next

Phase 4: the people reveal — `organization.affiliations` rendered as person rows under the org card, nested person links/corpus with their own ➕ and 🔍 (the person-shaped envelopes this remote already routes), and add-person-with-automatic-affiliation via `person.affiliate`.
