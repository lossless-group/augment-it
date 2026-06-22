---
date_created: 2026-06-22
date_modified: 2026-06-22
title: "Record · DB Resolver — the first bridge from row-store records to canonical orgs"
lede: "augment-it grew in two eras that never met: the row-store records and the SurrealDB canonical orgs. A new per-record surface bridges them — match each record to a canonical organization (or create one) and land its web presence as additive, deduped facts. First iteration works out of the box; a little UI polish before it ships."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - context-v/specs/Record-DB-Resolver.md
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/record-surrealdb-resolver/src/surreal.ts
  - services/record-surrealdb-resolver/src/server.ts
  - apps/record-db-resolver/src/App.svelte
  - apps/record-db-resolver/src/components/CandidateList.svelte
  - apps/record-db-resolver/src/components/RecordCard.svelte
  - apps/record-db-resolver/src/lib/normalize.ts
  - apps/record-db-resolver/src/lib/resolver-client.ts
  - services/workspace/src/capabilities.ts
  - docker-compose.yml
  - shell/rsbuild.config.ts
  - shell/src/remotes.ts
tags:
  - Progress-Update
  - Record-DB-Resolver
  - SurrealDB
  - Canonical-Entity-Registry
  - Org-Enrichment
  - Media-Streams
  - Microfrontend
  - reach-edu
---

## Why Care?

augment-it was built in two eras that never shook hands. The **row-store / CSV**
era gave us *records* — pipeline trackers, record sets, the per-record
connector-firing UI. The **SurrealDB canonical** era gave us *entities* —
`persons`, `organizations`, the observations graph. But nothing connected them:
the powerful firing UI wrote its findings into row columns, while the canonical
`organizations` table stayed thin and was filled only by hand.

That gap is why "we made a bunch of orgs but never collected their streams and
socials" was *true and structural*, not an oversight. The **Record · DB
Resolver** is the bridge — and it's built the augment-it way: not a batch script
that auto-merges and hopes, but an **operator-driven, per-record surface**. You
look at one record, you see which canonical org it actually is (or that it's
new), and you commit. One at a time, you in the driver's seat. This is the first
concrete slice of the [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle|funder-fit substrate]]:
you can't reason over a funder's corpus until each org knows its own web presence.

## What's New?

- **A new microfrontend — `record-db-resolver`** (Flow step 2, port 3008). Pick a
  record set; for each record see ranked **candidate** canonical orgs, an
  **append-preview** of exactly what would be written, and one decision:
  **match → enrich**, **create new**, or **skip**. Manual org search when the
  auto-candidates miss.
- **A new microservice — `record-surrealdb-resolver`.** The **first augment-it
  service to talk SurrealDB server-side** (until now only the browser apps and
  one-off scripts did). It owns candidate-finding and the additive writes.
- **A new canonical tier — `media_streams`.** A funder's blog index / newsroom /
  RSS feed isn't *content*, it's a *recurring publisher*. Official-update indexes
  now land here, separate from `org_corpus` (the individual items), per the
  identity / stream / corpus-item model.
- **A clean architectural seam.** The UI is **DB-agnostic** (holds no database
  credentials); the backend is **DB-specific**. A different client or database
  later means a new backend implementing the same capability contract — same UI.

## How it Works

Records flow in from the row-store; the operator's decision flows out as additive
facts on a canonical org. The UI never touches a database — everything goes
through three capabilities over NATS.

```
apps/record-db-resolver/            ─ generic resolver UI (no DB creds)
  normalizes row.fields → { name, url, socials[], streams[], corpus[] }
        │  workspace.invoke('resolver.candidates' | 'resolver.search' | 'resolver.apply')
        ▼
services/record-surrealdb-resolver/ ─ SurrealDB matching + additive write
```

Matching ranks each candidate by how it was found:

| signal | score | how |
|---|---|---|
| **slug** | 100 | `corpus_funder_slug` or slugify(name) == `organizations.slug` |
| **domain** | 90 | the record's URL host ∈ the org's `domains` / `org_links` |
| **name** | 60 | fuzzy `CONTAINS` over complete/conventional name |

On **apply**, web-presence facts map onto the canonical org — additively,
deduped by URL, never clobbering names or existing entries, every write
client-tagged and source-stamped:

| record field | → canonical org |
|---|---|
| `url` | `org_links` (kind `website`) |
| `socials[]` | `org_links` (kind inferred) |
| `official_updates_index_url(s)` | **`media_streams`** (the new tier) |
| `helpful_links` | `org_corpus` (+ `content_items` ledger) |
| CRM/pipeline columns (stage, $, owner, notes…) | *not written* — reach-edu-private; Decile is their home |

## Under the Hood — and a fun five minutes

The matching logic is ported from the corpus-side `surreal-reconcile-corpus.mjs`
(the slug + domain joins) and the writers from the person-enrichment surface
(`ensureOrgExists` / `appendOrgLink` / `appendOrgCorpus` / `findOrCreateContent`),
lifted server-side so the browser stays credential-free.

The verification had a moment. The very first read-only probe — "Annie E. Casey,
slug `annie-e-casey`, aecf.org" — came back **zero candidates**, which looked
like a bug or a missing org. A direct SurrealDB query said otherwise: the org is
right there, `client_access: ["reach-edu"]`, matchable by slug, domain, *and*
name. Re-probing against the now-warm service returned it at **score 100
(slug, domain, name)**. The zero was a cold-start fluke on the service's first
lazy SurrealDB connect — the surface itself was correct out of the box.

The same query surfaced a better headline: there are **131** reach-edu orgs in
the canonical layer, not the ~10 we thought. Half the pipeline tracker will
**match**; the other half (Hewlett, Lumina, Schultz — in the corpus but not yet
canonical) will **create**. Exactly the half-and-half this tool exists for.

## Files Touched

- **Spec:** `context-v/specs/Record-DB-Resolver.md` — the two-component split,
  capability contract, locked field mapping.
- **Service:** `services/record-surrealdb-resolver/` — `resolver.ts`,
  `handlers.ts`, `surreal.ts`, `server.ts`.
- **UI:** `apps/record-db-resolver/` — `App.svelte`, `components/CandidateList.svelte`,
  `components/RecordCard.svelte`, `lib/normalize.ts`, `lib/resolver-client.ts`.
- **Wiring:** `services/workspace/src/capabilities.ts` (three `resolver.*`
  capabilities), `docker-compose.yml` (the new service + `SURREAL_*` env),
  `shell/rsbuild.config.ts` + `shell/src/remotes.ts` (Flow step).

## What's Next

- **UI polish** — a handful of improvements before this is properly *shipped*
  (detailed separately). The engine is right; the surface wants a little love.
- **Row write-back** — stamp the resolved org id back onto the record
  (`resolved_org_id`, `resolved_org_slug`) so a resolved record remembers its
  canonical home. Deferred deliberately, to be worked one field at a time.
- **Batch accept** — the surface is designed for an "accept all high-confidence
  matches" pass; v0 stays one-by-one on purpose.
