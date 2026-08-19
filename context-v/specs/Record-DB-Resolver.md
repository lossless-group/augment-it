---
title: "Record ↔ DB Resolver — operator-driven match/create bridge from row-store records to canonical organizations"
lede: >-
  Row-store records and canonical SurrealDB orgs were never bridged; the resolver closes the gap one record at a time, operator driving.
date_created: 2026-06-22
date_modified: 2026-07-21
date_first_published: 2026-06-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
status: Shipped
post_ship_note: "Shipped the day it was written — changelog carries four entries on 2026-06-22 (v0.0.0.1 bridge, v0.0.0.2 round-trip bond + editable canonical, edit-with-traceability, v0.0.0.3 auto-minted opportunities). Live as apps/record-db-resolver (:3008) + services/record-surrealdb-resolver; the person-aware sibling followed 2026-07-07."
tags:
  - Spec
  - Augment-It
  - Record-DB-Resolver
  - Canonical-Entity-Registry
  - SurrealDB
  - Org-Enrichment
  - Media-Streams
  - reach-edu
site_uuid: 5d7c93bb-c477-4da8-b590-563c30d55f63
hex_code: 1y8qg4
date_authored_initial_draft: 2026-06-22
date_authored_current_draft: 2026-06-22
publish: true
---

# Iterations

## v0.0.0.1
Shipped the basic resolver UI and backend service on June 22, 2026 at 17:00 CST.

## v0.0.0.2
1. Clarify how the DB entity matching works as it is saved in the record data. (Now we are working from a CSV file as it's represented in state. In theory, after the resolver augmentation is complete there is a "new version" of the CSV file that includes the canonical entity matches.)
2. Add support for the augment-it user altering the Name and slug fields on the canonical entity as it becomes represented in the DB  , yet don't lose the match to the source record.  If a user changes the name of an organization, the match should still be preserved even with the source CSV records. (The client will not want to lose their own terminology or notes, but after web research and augment-it augmentation, the data-augmenter (primary user) will want to update the name and slug of the cannonical source.)
   - Live example: The client has a record "Howard Schulz Foundation" but the canonical entity based on research is `schulz-family-foundation` as the slug and "The Schulz Family Foundation" as the name. 
3. Add support for creating a "person" canonical entity from a record.  Some of the records are not organizations but people. 

**Status (2026-06-22): items 1 + 2 SHIPPED** — round-trip row write-back
(`resolved_org_id`/`slug`/`name` stamped live onto the row) and editable canonical
name/slug with `aliases[]` on rename (id-as-bond). **Item 3 (person) deferred** —
its design questions are still open in [[Grilling-on-DB-Resolver--Future-Versions]] #3.
Decisions log: that same file, #1 + #2 locked.

## v0.0.0.3
1. We need a new relationship (could be a type of observation) to deal with multiple records that reference the same cannonical entity.  This happens for `accelerate-the-future` where there are multiple records that reference the same organization. What the client stakeholder intended was that these are separate "opportunities" rather than separate cannonical entities.  We either need to unfortunately get more CRM like and offer the ability to create and add to additional tables/data types, or hardcode "opportunities" as either its own relational table or as a type of observation. My preference here is probably to just go with opportunities as its own table, as there are CRM style features that would be useful to add in the future, as well as CRM style input data that would only make sense in an opportunitities table.  
> NOTE: There could be a way to `abstract` the concept of opportunities, such as with `record_subset` of type `opportunity` and then later if there is some other `record_subset` it can get handled as a different type.  Would need to use document style flexible data.

**Locked (2026-06-22) — see [[Grilling-on-DB-Resolver--Future-Versions]] #4/#5:**

- **Opportunities are a dedicated, client-scoped `opportunities` table** in SurrealDB
  (one DB, `client`-partitioned — the Lossless canonical intel; no per-client DBs).
  First-class, persists across imports, accumulates over time.
- **Cardinality:** an opportunity is **1:1 with a source record** (`record_uuid`),
  **many:1 to the canonical org** (`resolved_org_id`). The three accelerate-the-future
  records → three opportunities, one org. Each carries provenance (record_set + source).
- **The opportunity is the home for the deferred CRM columns** (Stage / $ / Owner /
  Next-Step …) — client-scoped, never on the shared org.
- **Never lose; duplicates are harmless; do NOT force-merge.** Same `record_uuid`
  re-resolved = update; new record same org = new opportunity. Matchmaking-to-merge
  is optional and later. (Redundancy over normalization.)
- **Auto-mint on resolve** — every resolved record mints/updates its opportunity, so
  the count is never lost.
- **Hardcode `opportunities`** as a SCHEMALESS table; no `record_subset` abstraction
  until a real second type appears.
- **Decile is a humain-vc-only push target**, never the store/source (reach-edu has
  no Decile — its pipeline is the CSV tracker).

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
