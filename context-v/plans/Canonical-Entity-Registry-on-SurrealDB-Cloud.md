---
title: "Canonical Entity Registry on SurrealDB Cloud — just write records"
lede: "SurrealDB Cloud is up at main/main with three SCHEMALESS tables (persons, organizations, affiliations). Goal: write records from tonight's CSV+JSONL into those tables. SCHEMALESS stays. No field discipline up front."
date_created: 2026-06-15
date_modified: 2026-06-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
revisions:
  - 2026-06-15 — Revised. Dropped SCHEMAFULL; the existing DB is SCHEMALESS and that's the call. Cut phasing down to what actually has to happen: connect, then write. Fixed SDK auth (v2 needs connect → signin → use, not the `auth:` option).
  - 2026-06-15 — Initial draft.
tags:
  - Plan
  - Augment-It
  - SurrealDB
  - Canonical-Layer
status: Draft
site_uuid: 82371c70-3f6a-460f-b87a-b9fa4c677dab
hex_code: q997wb
date_authored_initial_draft: 2026-06-15
date_authored_current_draft: 2026-06-15
publish: true
---

# Canonical Entity Registry on SurrealDB Cloud

## State

- Instance up at `rustic-forest-…aws-use1.surreal.cloud`, scope `main/main`.
- Tables already exist, all SCHEMALESS: `persons`, `organizations`,
  `affiliations` (a RELATION edge from `persons` ↔ `organizations`).
- HTTP API + Node SDK both round-trip cleanly (see
  `scripts/surreal-smoke-test.mjs`).
- Credentials in `.env` at repo root. Source with
  `set -a; . ./.env; set +a` before running scripts.

## SCHEMALESS stays

Ad-hoc variability rules. LinkedIn shapes differ per profile, Crawlbase
shapes have shifted twice this week. No `DEFINE FIELD` discipline up
front. Write what we have, query what's there.

The only structural commitment: **slug as the join key**. Person's
LinkedIn vanity slug, org's LinkedIn company slug, school's LinkedIn
school slug. The proprietary commentary on the filesystem joins to
canonical by this same slug.

## Connect

v2 SDK pattern (the `auth:` option in `connect()` doesn't work — the
WebSocket handshake passes but every subsequent query runs as
anonymous):

```javascript
import { Surreal } from 'surrealdb';
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({
  username: process.env.SURREAL_USER,
  password: process.env.SURREAL_PASS,
});
await db.use({
  namespace: process.env.SURREAL_NS,  // 'main'
  database: process.env.SURREAL_DB,   // 'main'
});
```

## Write records

One script: `scripts/surreal-ingest-canonical.mjs`. Walks
`clients/*/inputs/*.jsonl`. For each line:

- Upsert one `persons` row keyed by slug (derived from `profile_url`).
  Write whatever fields are present in the Crawlbase JSON. Drop nothing.
- Upsert one `organizations` row per company/school referenced in the
  experience/education arrays, keyed by org slug (derived from the
  LinkedIn company/school URL when present; from a slugified name
  otherwise).
- `RELATE` one `affiliations` edge per experience/education entry.
  Carry whatever shape the source has (title, dates, role kind).

Idempotent: re-running over the same JSONL upserts, doesn't duplicate.
Slug is the dedup key.

## Organization name family

Every `organizations` row carries **two name fields plus a slug**, because
real entities almost always have a formal name and a different colloquial
shorthand, and the operator needs both at hand for search, display, and
correctness:

| field | example for Columbia Southern University |
|---|---|
| `complete_name` | `"Columbia Southern University"` (formal/canonical; source of truth for `slug`) |
| `conventional_name` | `"Columbia Southern"` (the shorthand people actually say in conversation; what shows on a credibility card or in a briefing doc) |
| `slug` | `"columbia-southern-university"` (derived from `complete_name`, durable join key) |

SCHEMALESS so the fields appear the moment we start writing them. The
initial bulk ingest from the gatsby attendee data set both to the
operator-typed `q2_company` value (one source of truth, no inference);
the enrichment surface lets the operator split them — e.g. set
`conventional_name` to "Columbia Southern" while `complete_name` keeps
"Columbia Southern University".

**Editability discipline:** every place orgs are edited — the
enrichment surface's `create_org` verb, future records-list inline
edits, agent-driven edits via the chat, direct SurrealDB edits via the
Surrealist UI — exposes both fields together. They're a pair, not a
primary-plus-optional. A surface that only edits one of them is broken.

Persons stay simpler — `name` is what we know them as, no
conventional/complete split needed (humans don't typically have a
"colloquial-vs-formal" name distinction the way orgs do; nicknames are
handled differently if they ever come up).

## Open

- Org-slug derivation when no LinkedIn URL is present. Lean: slugify
  the name, accept that two genuinely-distinct orgs with similar names
  may collide, reconcile later. Decide when we hit a real collision.
- Whether to add UNIQUE indexes on `persons.slug` and `organizations.slug`
  for hard-fail dedup. Lean yes — costs nothing in SCHEMALESS mode and
  enforces the join contract.

## Client visibility — every write carries a client slug

The canonical layer is cross-client by design (one `persons` row per
real-world human, shareable across reach-edu + humain-vc + future
clients). But each write into canonical needs to record *which client
caused it*, and each entity needs to surface *which clients have
touched it*, so workspace-scoped reads return the right subset.

[[Client-Tagging-on-Canonical-Writes]] is the spec. Three small
mechanics:

1. Every observation has a `client` field carrying the workspace slug.
2. Every canonical entity (persons / organizations / events) has a
   materialized `client_access: [...]` array, plus indexed.
3. Every workspace-scoped read filters by
   `WHERE client_access CONTAINS $workspace_slug`.

The plan's writer scripts (`surreal-write-persons.mjs`,
`surreal-backfill-located-in.mjs`,
`surreal-materialize-persons-locations.mjs`,
`surreal-write-event.mjs`) need to be updated to stamp `client` on
every write before any new event ingest happens. The existing 882
persons + 881 observations get backfilled as `client = "humain-vc"`
(the LinkedIn capture workflow's owner).

## See also

- [[Joined-People-UI-and-the-Network-First-Pivot]] — addendum 5 is
  the parent of this plan.
- `scripts/surreal-smoke-test.mjs` — the connectivity probe.
