---
title: "Record ↔ DB Resolver — operator-driven match/create bridge from row-store records to canonical organizations"
lede: "The row-store records and the SurrealDB canonical orgs never got bridged. The resolver is the per-record surface that closes the gap: for each record, confirm which canonical org it is (→ additive enrich) or create a new one — one at a time, operator in the driver's seat."
date_created: 2026-06-22
date_modified: 2026-06-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
semantic_version: 0.0.0.1
status: Draft
tags:
  - Spec
  - Augment-It
  - Record-DB-Resolver
  - Canonical-Entity-Registry
  - SurrealDB
  - Org-Enrichment
  - Media-Streams
  - reach-edu
---

# Record ↔ DB Resolver

## Why this exists

augment-it grew in two eras. The **row-store / CSV** era produced *records* — record
sets, pack-runner, records-surface — and the per-record connector-firing UI writes
its findings into row columns (`socials`, `official_updates_index_urls`). The
**SurrealDB canonical** era produced *entities* — `persons` / `organizations` /
`observations` — but the `organizations` table is sparse (~10 orgs vs 1,059 persons),
populated only by hand on the person-enrichment surface.

The two never got bridged. The reach-edu **v10 pipeline tracker** (96 funder rows)
holds web-presence columns (`url`, `socials`, `official_updates_index_urls`,
`helpful_links`) that belong on canonical orgs — about half of those orgs already
exist in SurrealDB, half don't. The resolver is the bridge, built the augment-it way:
**not a batch script, but an operator-driven per-record match/create surface.** For
each record the operator confirms which canonical org it is (→ additive enrich) or
creates a new one. This is the first concrete slice of the org-enrichment /
[[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle|Funder-Fit]] substrate.

## Two components, one DB-agnostic contract

The UI is generic; the backend is store-specific. A different client or DB later
means a new backend implementing the same capability contract — same UI.

```
apps/record-db-resolver/             ─ generic resolver UI (Svelte remote, :3008)
  reads records via @augment-it/workspace (row.list)
  normalizes row.fields → a record { name, url, socials[], streams[], corpus[] }
         │  workspace.invoke('resolver.*')   (WS → workspace-service → NATS)
         ▼
services/record-surrealdb-resolver/  ─ SurrealDB-specific matching + additive write
  the FIRST service to talk SurrealDB server-side (SURREAL_* env, surrealdb SDK)
```

The UI never holds SurrealDB credentials (cleaner than person-enrichment, whose
browser-side creds were always flagged "v0 dev-only, a proxy replaces this"). This
service *is* that proxy for organizations.

## Capability contract

Registered in `services/workspace/src/capabilities.ts`; dispatched over NATS.

- **`resolver.candidates`** — `{ record, client }` → `{ candidates[], append_preview }`.
  Candidate matching reuses the [[#related|reconcile]] logic: exact `slug`
  (slugify(name) / `corpus_funder_slug`), `url`-domain ∈ `org.domains` / `org_links`,
  plus fuzzy name `CONTAINS`. Each candidate carries `score`, `match_reason`, and its
  existing arrays so the UI can preview what's new.
- **`resolver.search`** — `{ q }` → ranked org suggestions (manual autocomplete when
  auto-candidates miss).
- **`resolver.apply`** — `{ action: 'match'|'create', org_id?, record, client, source }`
  → `{ org_id, slug, created, appended }`. Additive, **dedup-by-URL**, never clobbers
  names or existing entries; client-tags (`client_access ∪ [client]`) + stamps
  `source` (e.g. `pipeline-tracker:v10`); creates `content_items` ledger rows for
  corpus/stream URLs via the find-or-create pattern.

## Field mapping on apply (locked 2026-06-22)

| record field (from `row.fields`) | canonical org destination |
|---|---|
| `Prospect / Organization` / `name` | `slug` + `complete_name` (match key / create) |
| `url` | `org_links` (kind `website`) |
| `socials[]` | `org_links` (kind inferred: linkedin/x/…) |
| `official_updates_index_url(s)` | **`media_streams`** `{ url, kind, party: 'first_party', url_domain, added_at }` |
| `helpful_links` | `org_corpus` (+ `content_items` ledger) |
| CRM/pipeline cols (Type, Owner, Stage, $, Notes…) | — **not written** (reach-edu-private; Decile is their home) |

`media_streams` does not exist anywhere yet — this service introduces the tier per
[[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]]'s identity / **stream** /
corpus-item model. A stream is the recurring *publisher* (blog index, RSS, newsroom),
not a single piece of content.

## Scope / non-goals (v0)

- **In:** per-record match/create, candidate ranking, append-preview (operator sees
  exactly what writes before committing), additive dedup write, the `media_streams`
  introduction, manual org autocomplete.
- **Out (deferred, worked one-by-one later):** row write-back stamping
  (`resolved_org_id`, `resolved_org_slug`, …), batch "accept all matches" (the surface
  is designed for it but v0 is deliberately one-at-a-time), stream cadence / RSS
  enrichment, the full org-enrichment pulse-surface (this is the reconciliation slice
  of it).

## Related

- [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] — the substrate this
  feeds; source of the identity/stream/corpus-item model and `media_streams`.
- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the `organizations` table.
- [[Client-Tagging-on-Canonical-Writes]] — every write carries the workspace `client`.
- [[Pulse-Pattern]] — names `apps/organization-enrichment/` as the broader surface;
  the resolver is its reconciliation slice.
- `scripts/surreal-reconcile-corpus.mjs` — the corpus-side Venn reconcile; the
  resolver's candidate-matching ports its slug + domain join logic.
- `apps/person-enrichment/src/App.svelte` — `ensureOrgExists` / `appendOrgLink` /
  `appendOrgCorpus` / `findOrCreateContent` / `slugify`, ported server-side here.
