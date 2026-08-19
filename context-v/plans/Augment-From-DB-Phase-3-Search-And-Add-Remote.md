---
title: "Augment from DB · Phase 3 — the search-and-add remote: editable term, provider palette, one-click add"
lede: >-
  Launched from any 🔍 on the org card: an always-editable term bar, a provider palette, one-click add back to the launching list.
date_created: 2026-07-22
date_modified: 2026-07-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
date_first_published: 2026-07-22
spec_reference: "[[../specs/Augment-From-DB-Flow]] §Phase 3"
post_ship_note: "Executed same day as authored. svelte-check 0/0 both remotes; builds green incl. shell; :3016 smoke HTTP 200; Phase 1 proof 7/7 regression. The localStorage-hardened launch contract went in as planned. Browser loop left to the operator."
tags:
  - Plan
  - Augment-It
  - Augment-From-DB
  - Phase-3
  - Search-And-Add
  - Microfrontend
  - Search-Providers
status: Shipped
site_uuid: a6a5993f-64f0-45dd-953e-6bec1e8701af
hex_code: 28qu8m
date_authored_initial_draft: 2026-07-22
date_authored_current_draft: 2026-07-22
publish: true
---

# Augment from DB · Phase 3 — search-and-add remote

## Spec reference

Implements **Phase 3** of [[../specs/Augment-From-DB-Flow]]. Scaffold template: `apps/org-workbench` (Phase 2). Branch: `rebuild/turbo-rsbuild`.

**One robustness decision beyond the spec (D2 refinement):** the `augment-it:search-request` CustomEvent alone is racy — if search-and-add isn't mounted when the 🔍 is clicked (its pairing opens via `augment-it:navigate`, and the federation import is async), the event is gone before the listener exists. The launch envelope therefore ALSO persists to `localStorage['augment-it:search-request']` (the repo's established cross-remount pattern — active-flow, active-record-set, session-token all live there); search-and-add reads it on mount and listens for live events thereafter. Same-origin remotes share localStorage, no shared federation memory needed.

## Steps

1. **Scaffold `apps/search-and-add/`** (:3016) — same shape as org-workbench; federation name `searchAndAdd`, `saa-*` CSS prefix.
2. **Lib** — `types.ts` (`SearchRequestDetail` mirror, `ConnectorResult`, `ConnectorInfo`); `search-client.ts` (wrappers: `search.fire`, `connectors.inventory`, and the five add verbs — org links/streams/corpus, person links/corpus); `search-context.svelte.ts` ($state singleton: current request from localStorage-then-events).
3. **Components** — `TermBar.svelte` (the standing constraint: term always visible, always editable, Enter/Search re-fires); `ProviderPalette.svelte` (chips from `connectors.inventory`: `short_label` + cost-tier styling, needs-env/disabled rendered dark and unclickable, SearXNG preselected, "auto" chip = registry default); `ResultRow.svelte` (title/host/snippet/date, one ➕ routed by `entity`+`target`, per-row "added ✓" / localized error); `ResultsList.svelte`; `App.svelte` (context banner "Adding to: <entity> · <target>", auto-fire once when a fresh request arrives — searches are reads, the gating thesis governs writes; every add dispatches `augment-it:entity-updated`).
4. **Verb routing** — org: links→`organization.links.add`, streams→`organization.streams.add`, corpus→`organization.corpus.add`; person: links→`person.links.add`, corpus→`person.corpus.add` (persons have no streams — target disabled for person entities).
5. **org-workbench 🔍** — `AdditiveList` gains an optional `onsearch` prop; `OrgCard` supplies per-target seed terms (links: `"<name>" LinkedIn` · streams: `"<name>" blog` · corpus: `"<name>" news` — hardcoded v1 per spec open question); a shared `requestSearch()` helper writes localStorage + dispatches `augment-it:search-request` + `augment-it:navigate {remoteId:'searchAndAdd'}`.
6. **Shell** — `SEARCH_AND_ADD_REMOTE` in EXTRA_REMOTES; `PAIRINGS += {key:'orgWorkbench+searchAndAdd', left:'orgWorkbench', right:'searchAndAdd', defaultLeftPct:55}`; federation map line (:3016). Appended LAST so `PAIRINGS[0]` (the default pair) is unchanged.
7. **Verify** — svelte-check + build both apps + shell build; dev-server smoke `:3016/remoteEntry.js`; `search.fire` regression via the Phase 1 proof; verb-routing unit sanity is svelte-check-level (the verbs themselves were proven in Phases 1–2). Browser walk-through (🔍 → pairing opens → edit term → swap provider → ➕ → card refreshes) is the operator's check.
8. Changelog, commit + push as `attempt(augment-from-db, search-and-add, step3):`.

## Out of scope

People reveal / person-shaped 🔍 dispatch (Phase 4 — the person routing in step 4 is wired but nothing dispatches person entities yet), stream scanning (Phase 5), fire-log persistence (spec open question — ephemeral v1).
