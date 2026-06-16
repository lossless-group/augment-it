---
title: "SurrealDB canonical layer lands with cross-client visibility — 1,059 persons, 10 orgs, 1 event, 1,245 observations, all client-tagged from day one"
lede: "Yesterday's [[Joined-People-UI-and-the-Network-First-Pivot]] exploration ended with a clear conclusion: the filesystem-as-substrate posture that has carried augment-it this far stops working the moment we try to blend canonical entity data (LinkedIn truth, refreshable, shareable across clients) with proprietary per-engagement commentary. Tonight that posture changes. SurrealDB Cloud is live on `main/main`, wired through the Node SDK with a working connector, seeded with the 882 humain-vc LinkedIn-network persons from last night's tagged-briefing pipeline AND the 177 reach-edu attendees from a Stand Together event held last month — two clients sharing one canonical schema with not a single row of leakage between them, courtesy of a `client_access` array materialized on every entity. Plus the spec for the UI that closes the loop — a per-event enrichment surface where the operator turns 177 email-only sparse rows into named persons + properly-tagged organizations one row at a time. The fact log (`observations` table) captures every claim with provenance — who said what, when, on behalf of which client — so the next time we refresh from LinkedIn or pull a new attendee list, nothing overwrites an operator's hand-curated note. The bus that left yesterday with a network-first pivot is back tonight with the data substrate to make the pivot real."
publish: true
date_created: 2026-06-15
date_modified: 2026-06-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - SurrealDB
  - Canonical-Layer
  - Multi-Client
  - Client-Tagging
  - FAIR
  - Gatsby-Events
  - Network-First
  - Org-People-Join
  - Reach-Edu
  - Humain-VC
semver: 0.0.3
files_changed:
  - context-v/plans/Canonical-Entity-Registry-on-SurrealDB-Cloud.md
  - context-v/specs/Client-Tagging-on-Canonical-Writes.md
  - context-v/specs/Sparse-Person-Enrichment-Surface.md
  - scripts/surreal-smoke-test.mjs
  - scripts/surreal-write-persons.mjs
  - scripts/surreal-write-locations.mjs
  - scripts/surreal-backfill-located-in.mjs
  - scripts/surreal-materialize-persons-locations.mjs
  - scripts/surreal-write-event.mjs
  - scripts/surreal-write-event-attendees.mjs
  - scripts/surreal-backfill-client-tagging.mjs
  - scripts/gatsby-parse-paste.mjs
  - tools/browser-snippets/gatsby-events/gatsby-events-table-to-rows.js
  - package.json
  - pnpm-lock.yaml
---

# SurrealDB canonical layer lands with cross-client visibility

## Why Care?

For nine months augment-it has lived on the filesystem. Markdown frontmatter for structured data; JSON for machine outputs; YAML for hand-edited config; git for the audit log. It is a beautiful posture and it has held up far longer than anyone had a right to expect, but it broke last week against a real architectural blend: how do you keep a *canonical* fact ("Charlene Kuo, GP at Acme Capital, located in NYC, refreshed nightly from LinkedIn") in the same view as a *proprietary* commentary ("met Charlene at SOSV '24, soft yes on the Series A, intro via Jane") without conflating them?

Markdown forces a choice: co-locate them in one file and watch git resolve canonical refreshes against operator-edited prose every night, or split across two files and rebuild a relational layer out of glob patterns. Yesterday's exploration named the problem; tonight we shipped the substrate.

**[SurrealDB Cloud](https://surrealdb.com/cloud) on `main/main`** now holds the canonical layer end-to-end. Two clients' worth of data — humain-vc's 882-person LinkedIn network and reach-edu's 177-person event — share one schema, with a `client_access` array on every entity that ensures reach-edu's workspace never sees humain-vc's data and vice versa. The operator types `WHERE client_access CONTAINS 'reach-edu'` and gets exactly what reach-edu's eye should be on. No tenant fragmentation, no data duplication, no leakage.

If you are a small-firm consultant who has been wondering whether you could build your own boring CRM out of off-the-shelf parts: yes, you can, and the parts cost ~$1/day on the multi-tenant tier of a modern cloud database.

## What's New?

- **SurrealDB Cloud connector** working end-to-end. HTTP/curl + Node SDK both round-trip cleanly. Five env vars in `.env`; one helper for the v2 SDK's `connect → signin → use` dance.
- **Five canonical tables** seeded with real data:

  | table | shape | count |
  |---|---:|---:|
  | `persons` | identity rows for humans | 1,059 |
  | `organizations` | identity rows for firms/foundations | 10 |
  | `locations` | normalized location strings | 59 |
  | `events` | first-class entity for gatherings | 1 |
  | `observations` | the fact log (subject / predicate / object / observed_at / source / client) | 1,245 |

- **Cross-client visibility** via a materialized `client_access: string[]` array on every entity. Three forms of "touched" (entered, updated, currently available) collapse into queries against the same observation log. No separate access table.
- **Two new specs** in `context-v/`:
  - [[Sparse-Person-Enrichment-Surface]] — the per-event UI for turning sparse rows into rich ones, one at a time. Three verbs: `create_org`, `add_profile`, `fill_out_query`.
  - [[Client-Tagging-on-Canonical-Writes]] — the architectural pattern every script and surface follows when writing to canonical.
- **A working gatsby-events ingest pipeline** that didn't exist 24 hours ago. Auto-extractor browser snippet failed against Gatsby's virtualized DOM; we pivoted to copy-paste, built a tolerant parser, and got all 177 attendees in cleanly. Same shape will work for any virtualized-table data the host won't give us API access to.

## How It Works

### The canonical / proprietary split, in one table-shaped picture

```
                            ┌─────────────────────────────────┐
                            │   SurrealDB main/main           │
                            │   (canonical layer)             │
                            │                                 │
   reach-edu workspace ─────┤   persons[client_access:        │
                            │     ["reach-edu", "humain-vc"]] │
   humain-vc workspace ─────┤                                 │
                            │   organizations, locations,     │
                            │   events, observations          │
                            └─────────────────────────────────┘

   reach-edu workspace ─────►  clients/reach-edu/  (filesystem,
                                                    proprietary commentary,
                                                    never crosses clients)

   humain-vc workspace ─────►  clients/humain-vc/  (same shape, per client)
```

The data layer is **cross-client by design**. One row per real-world human. Sharing is the point — when reach-edu's operator surfaces Charlene Kuo at an event and humain-vc's operator has Charlene on their LinkedIn network, they're looking at the same row. But each workspace reads through a `client_access CONTAINS $workspace_slug` filter, so they each see only the slice they've touched.

Proprietary commentary stays on the filesystem under `clients/<slug>/`. The two layers join by slug. Same shape the [[Joined-People-UI-and-the-Network-First-Pivot]] exploration recommended; tonight is the implementation.

### Every observation carries a `client` field

```sql
CREATE observations SET
  id          = rand::uuid::v7(),
  subject     = persons:⟨X⟩,
  predicate   = "invited_to",
  object      = events:⟨Y⟩,
  observed_at = d'2026-05-21T00:00:00Z',
  source      = "gatsby-events:reachuniversity:rNyU5vd8fYZsr4UVtsXXt1",
  client      = "reach-edu";   -- ← the load-bearing addition
```

The `client` field is the workspace slug from `clients/<slug>/`. Every writer script reads it from `--client` CLI arg (or `SURREAL_CLIENT` env) and aborts loudly if missing — no implicit writes, no silent leakage.

Every entity carries a denormalized `client_access` array refreshed at write time:

```js
{
  id: persons:<uuid>,
  email: "brett.hinkey@charleskochfoundation.org",
  client_access: ["reach-edu"],         // sorted by first-touch time
  first_touched_by: "reach-edu",
  last_touched_by:  "reach-edu",
  last_touched_at:  "2026-06-16T03:02:40Z",
}
```

When humain-vc eventually surfaces Brett (LinkedIn first-degree, second event, whatever), the same row's `client_access` becomes `["reach-edu", "humain-vc"]` and both workspaces see them. No second row.

### Org name family: two names, one slug

A real entity goes by multiple names depending on context, and we want both at hand:

```js
{
  complete_name:     "Columbia Southern University",   // formal, source of slug
  conventional_name: "Columbia Southern",              // what people actually say
  slug:              "columbia-southern-university",   // durable join key
}
```

For tonight's bulk ingest both fields land at the operator-typed `q2_company` value (`"Columbia Southern University"`). The enrichment surface lets the operator split them — set `conventional_name` to `"Columbia Southern"` while `complete_name` keeps the formal — wherever orgs are edited (`create_org` verb, future inline edits, agent edits, direct Surrealist edits). The fields are a pair, not primary-plus-optional. A surface that only edits one of them is broken.

Persons stay simpler. Humans don't typically have the conventional/formal split orgs do.

## Under The Hood

### The Gatsby paste-and-parse pipeline (because the auto-extractor failed)

Gatsby Events publishes attendee lists as "public table tabs" — JS-rendered, client-side virtualized grids. We tried Firecrawl first; it returned the first 28 of 177 rows (only the visible-on-screen slice — virtualization defeats one-shot scraping). We wrote a browser snippet that auto-detects the table shape and accumulates rows on scroll; it failed against Gatsby's specific DOM (sticky-column + absolute-positioned cells keyed by `offset` and CSS `top:` pixels — none of the four shapes we probed for matched).

So we did what the operator was going to do anyway: copy-paste. The user copied chunks of the on-screen table; we built a parser tolerant of both row orderings the selection could produce (rsvp-event-before-email vs email-before-rsvp), of header/footer junk getting glued to data rows, of orphan rows at chunk boundaries, and of inline company names that appeared mid-row without blank-line separators.

Fourteen pastes later we had all 177 attendees in a clean JSON file, deduped by email, with their rsvp_event + warnings + (where filled) company + position. The parser script (`scripts/gatsby-parse-paste.mjs`) is general enough to handle any future Gatsby event — the shape is theirs, not specific to Turning-Jobs-Into-Degrees.

The lesson: when a structured-data API isn't on offer and the table is virtualized, **paste-and-parse is the cheaper path than browser-snippet-walks-the-DOM.** We documented it that way in [[Joined-People-UI-and-the-Network-First-Pivot]] but tonight we lived through the proof.

### The data, one event-row at a time

For each of the 177 attendees the loader (`scripts/surreal-write-event-attendees.mjs`) writes:

- **One `persons` row** keyed by email (UNIQUE index), with `client_access = ["reach-edu"]`, `source = "gatsby-events"`.
- **One `has_email` observation** linking the person to their email string.
- **One funnel observation** based on the parsed `rsvp_event`:
  - `"Invited Apr 20"` → `predicate = "invited_to"`, `observed_at = d'2026-04-20'`
  - `"Visited May 18"` → `predicate = "visited_event_page"`, `observed_at = d'2026-05-18'`
  - `"Bounced May 14"` → `predicate = "email_bounced"`, `observed_at = d'2026-05-14'`
  - (luciano-decastro had no rsvp_event captured, so no funnel observation — the loader survives the gap)
- **For 11 attendees** whose Gatsby `q2_company` field was filled (NCAD ×2, Numinar, Strada, etc.): a new `organizations` row (deduped by slug) and one `affiliated_with` observation linking person to org.

Final observation breakdown for reach-edu:

| predicate | count |
|---|---:|
| `has_email` | 177 |
| `invited_to` | 169 |
| `email_bounced` | 4 |
| `visited_event_page` | 3 |
| `affiliated_with` | 11 |

The same shape extends cleanly to event attendance, conference rosters, donor lists, and anything else operator-pasted from a private dashboard. We pay the parse cost once per source-shape; the loader is reusable.

### Backfill humain-vc was the trickiest call

The 882 persons + 881 observations from the LinkedIn-network walker (yesterday's work) had no `client` field, no `client_access` array. Two options:

1. **Backfill** with `client = "humain-vc"` — the LinkedIn capture was unambiguously a humain-vc workflow. One-shot SurrealQL UPDATE, idempotent.
2. **Treat as legacy** — document the cohort, only enforce client-tagging on new writes.

We went with (1). Backfill ran in 1.1 seconds total across all four entity types. Verification at the end: reach-edu's workspace sees 177 persons; humain-vc's sees 882; neither sees the other. Identical canonical layer, different read predicates.

### Things named explicitly so they don't drift in later

The new specs are tight about what's out of scope:

- **No bulk auto-enrichment** in the sparse-person surface. Operator learns the verbs by hand first; if a deterministic pattern emerges, *then* we automate.
- **No fuzzy name-matching across clients.** humain-vc's 882 LinkedIn rows and reach-edu's 177 event rows have zero overlap by construction. `add_profile` and `create_org` default to *create*, not *match*. When same-human-across-clients shows up later, a `same_as` observation predicate handles it — but not before a real instance forces the design.
- **Search is "open a new tab," not a connector.** When the operator wants to look someone up they use Google or DuckDuckGo directly. The enrichment surface pre-fills the query for one click; the operator reads results their normal way and pastes back what they found.
- **Persons stay simpler than orgs.** No `conventional_name` field — humans don't typically have the colloquial-vs-formal split.

## What's Next

The data substrate is in. The UI specs are in. The next coherent slice is **the enrichment surface itself** — a new micro-frontend under `apps/person-enrichment/` that reads from `events:<id>`, walks un-enriched attendees one at a time, exposes the three verbs, and writes the operator's edits back as observations.

Two prerequisites before the surface lands:

1. **`personal_email_domains` table** on Surreal, seeded with ~25 common providers (gmail, yahoo, me.com, etc.). Both the enrichment surface AND a follow-on script that runs email-domain → org inference will read from it. Spec says it lives in SurrealDB so scripts and the database stay in sync; no file-vs-DB drift.
2. **One more loader pass** that walks the 114 reach-edu attendees with org-domain emails (114 = 177 − 63 personal), upserts an organization per unique domain, and writes `affiliated_with` observations with `qualifiers: {kind: "email-domain"}`. The 4 Sterling-Foundations spellings (`sterlingfoundations.com`, `sterling-foundations.com` ×2 + 1 more) test the multi-domain matching logic.

The surface itself can land in pieces — Step 1 (event picker) + Step 2 (per-row view + `create_org` + `add_profile`) first; `fill_out_query` follows once the URL-paste pattern earns its complexity.

## Files Changed

Specs and plans:

- `context-v/plans/Canonical-Entity-Registry-on-SurrealDB-Cloud.md` — the SurrealDB plan, updated with the client-visibility section and org name family
- `context-v/specs/Client-Tagging-on-Canonical-Writes.md` — new, the cross-cutting pattern every writer follows
- `context-v/specs/Sparse-Person-Enrichment-Surface.md` — new, the per-event UI for turning emails into named persons + orgs

Scripts (all under `scripts/`, all SurrealDB-related):

- `surreal-smoke-test.mjs` — connectivity probe (helper)
- `surreal-write-persons.mjs` — bulk persons loader, now `--client`-aware
- `surreal-write-locations.mjs` — bulk locations loader, now `--client`-aware
- `surreal-backfill-located-in.mjs` — `located_in` observation backfill, now `--client`-aware
- `surreal-materialize-persons-locations.mjs` — materializes `persons.location` + `persons.observations.locations`
- `surreal-write-event.mjs` — event writer (one row at a time)
- `surreal-write-event-attendees.mjs` — new, the loader that ingests the 177 reach-edu attendees
- `surreal-backfill-client-tagging.mjs` — new, one-shot backfill of `client_access` on the 882 humain-vc cohort
- `gatsby-parse-paste.mjs` — new, tolerant paste-and-parse for virtualized gatsby tables

Browser snippets:

- `tools/browser-snippets/gatsby-events/gatsby-events-table-to-rows.js` — DevTools paste-in for any future gatsby table where the auto-DOM walker happens to work

Dependencies:

- `package.json` + `pnpm-lock.yaml` — added `surrealdb ^2.0.3` (the Node SDK)

## See Also

- [[Joined-People-UI-and-the-Network-First-Pivot]] — yesterday's exploration that named the canonical/proprietary split and made tonight's work obvious
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — the privacy-axis sibling to tonight's schema-axis answer; both wear the same architectural seam differently
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — names the framing the sparse-person surface fills in as a second concrete flow shape
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — the chrome parent the enrichment surface reuses
- [[Funder-Content-Corpus]] — the still-on-filesystem dataset whose move into canonical would be the next storage-substrate question
