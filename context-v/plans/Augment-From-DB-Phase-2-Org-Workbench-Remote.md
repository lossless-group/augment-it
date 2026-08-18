---
title: "Augment from DB · Phase 2 — the org-workbench remote: flow registration, org search, org card"
lede: >-
  Autocomplete to a canonical org and work its card with a live ➕ on every list — plus the verb the spec missed, `organization.streams.add`.
date_created: 2026-07-22
date_modified: 2026-07-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
date_first_published: 2026-07-22
spec_reference: "[[../specs/Augment-From-DB-Flow]] §Phase 2"
post_ship_note: "Executed same day as authored. All scriptable checks green: svelte-check 0/0, both builds emit (remoteEntry.js on :3014, HTTP 200 smoke), services typecheck, organization.streams.add proven live (Aspen Institute 0→1 streams, blog_index/first_party inferred), Phase 1 proof re-run 7/7. Browser walk-through left to the operator."
tags:
  - Plan
  - Augment-It
  - Augment-From-DB
  - Phase-2
  - Org-Workbench
  - Microfrontend
  - Module-Federation
status: Shipped
site_uuid: 5436a8ee-22e3-4bfc-8ad6-00d69725d33b
hex_code: 60kcf9
date_authored_initial_draft: 2026-07-22
date_authored_current_draft: 2026-07-22
---

# Augment from DB · Phase 2 — org-workbench remote

## Spec reference

Implements **Phase 2** of [[../specs/Augment-From-DB-Flow]] (Implementing). Scaffold template: `apps/person-db-resolver` (package.json, tsconfig, rsbuild config, mount contract, `workspace.connect` + `workspace.active` client-derivation idiom, `augment-it:workspace-changed` listener). Branch: `rebuild/turbo-rsbuild`.

**One spec gap discovered and closed here:** the spec's Phase 2 assumed "existing add verbs" cover all three lists, but only `organization.links.add` / `organization.corpus.add` exist — there is no single-entry verb for `media_streams[]` (streams only ever arrived via `resolver.apply`'s batch path). This plan adds **`organization.streams.add`** (mirrors `addOrgLink`, reuses the module-private `shapeStream` → kind auto-inferred, `party: 'first_party'`), plus its handler, capability-map entry, and 30s timeout.

## Steps

1. **Service verb** — `addOrgStream` in `services/record-surrealdb-resolver/src/resolver.ts` (`{org_slug, url, kind?, client}` → `{ok, org_id, stream}`); handler block in `handlers.ts` (`organization.streams.add.requested`); `capabilities.ts` map + timeout entries.
2. **Scaffold `apps/org-workbench/`** (:3014) — package.json (`@augment-it/org-workbench`), tsconfig, rsbuild config (federation name `orgWorkbench`, exposes `./mount`, cors origin :3100, assetPrefix :3014), `src/{index.ts, mount.ts (mountOrgWorkbench), css.d.ts, app.css (ow-* prefix)}`.
3. **Client lib** — `src/lib/types.ts` (`OrgSuggestion`, `OrgDetail`, `SearchRequestDetail` for Phase 3); `src/lib/org-client.ts` — typed wrappers over `workspace.invoke` for `resolver.search`, `organization.detail`, `organization.links.add`, `organization.streams.add`, `organization.corpus.add`.
4. **Components** — `OrgSearch.svelte` (debounced ≥250ms autocomplete over `resolver.search`, keyboard-free v1: click to pick); `AdditiveList.svelte` (generic: entries with kind badge + host + added-date, inline ➕ form → caller-supplied add fn, busy/error localized per list); `OrgCard.svelte` (identity block: names, slug, aliases, domains; three AdditiveLists); `App.svelte` (header strip "SurrealDB · main/main · Organizations", client badge, ws status; search → card; refetch on `augment-it:entity-updated` and on every successful add).
5. **Shell registration** — `AUGMENT_FROM_DB_ROTATION = ['orgWorkbench']` + REMOTES entry in `remotes.ts`; `augmentFromDb` FLOWS entry in `flows.svelte.ts`; `orgWorkbench@http://localhost:3014/remoteEntry.js` in `rsbuild.config.ts`.
6. **Verify** (see below), changelog, commit + push as `attempt(augment-from-db, org-workbench, step2):`.

## Verification

- `pnpm install` links the new workspace package; `pnpm check` (svelte-check) green in `apps/org-workbench`; `pnpm build` green in `apps/org-workbench` and `shell`; `pnpm typecheck` green in the two touched services.
- `organization.streams.add` proven over raw NATS (rebuild `record-surrealdb-resolver` + `workspace-service` containers): add a stream URL to a known org → `organization.detail` re-read shows it with inferred kind + `party: 'first_party'`.
- Dev-server smoke: `pnpm dev` in org-workbench, `curl -sf localhost:3014/remoteEntry.js` returns the federation manifest.
- Browser walk-through (operator): Flows popdown → "Augment from DB" → search → card → ➕ on each list. Deferred to the operator; everything scriptable is scripted.

## Out of scope

People reveal / add-person (Phase 4), the 🔍 search-launch buttons and `search-and-add` remote (Phase 3), stream scanning (Phase 5).
