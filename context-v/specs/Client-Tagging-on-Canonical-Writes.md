---
title: "Client tagging on canonical writes — every observation carries the client that produced it, and every canonical entity carries the materialized set of clients that can see it"
lede: >-
  The canonical layer is cross-client by design — a materialized `client_access` array is how each workspace still sees only its own.
date_created: 2026-06-15
date_modified: 2026-06-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
status: Draft
tags:
  - Spec
  - Augment-It
  - Canonical-Layer
  - Client-Visibility
  - Multi-Client
  - Workspaces
  - Provenance
  - FAIR
site_uuid: 6f7ddc9e-6036-4565-9ad5-24a20afe36a4
hex_code: 58x9ig
date_authored_initial_draft: 2026-06-15
date_authored_current_draft: 2026-06-15
---

# Client tagging on canonical writes

## Why this exists

The canonical layer is **cross-client by design** —
[[Canonical-Entity-Registry-on-SurrealDB-Cloud]] put it that way to
avoid duplicating the same human across N client databases when the
fundraising consultancy serves N clients. One real-world human gets one
`persons` row; multiple clients can each independently encounter,
update, and reference them.

But sharing the row doesn't mean every client sees it. A person
reach-edu surfaced at the Turning-Jobs-Into-Degrees event shouldn't
clutter humain-vc's workspace until and unless humain-vc surfaces them
too (LinkedIn, separate event, separate consulting context). We need to
log:

1. **Who entered this entity into canonical** (first client to surface them).
2. **Who has updated this entity since** (any client that's edited a field
   or added an observation).
3. **Who currently has visibility** (which workspaces should show this
   entity in their worklist UIs).

All three are facets of one underlying signal: *a client touched this
entity at some point.* They're not three separate fields — they're
three queries against the same observation log.

## Pattern

### Every observation carries a `client` field

When any script or surface writes an observation, the SurrealQL
mutation includes the current workspace slug:

```sql
CREATE observations SET
  id          = rand::uuid::v7(),
  subject     = persons:⟨X⟩,
  predicate   = "has_email",
  object      = "foo@bar.com",
  observed_at = time::now(),
  source      = "gatsby-events:reachuniversity:rNyU5vd8fYZsr4UVtsXXt1",
  client      = "reach-edu";       -- ← the load-bearing addition
```

Schema-less; the `client` field is a plain string slug matching the
folder under `clients/`.

### Materialized `client_access` array on every canonical entity

Per the redundancy ethos
([[feedback_redundancy_over_normalization]]), every canonical entity
caches the set of clients that have touched it. Computed from the
observation log and refreshed on every write:

```js
// persons table
{
  id: persons:<uuid>,
  // …other fields…
  client_access: ["reach-edu", "humain-vc"],  // sorted by first-touch time
  first_touched_by: "reach-edu",              // convenience
  last_touched_by:  "humain-vc",              // convenience
  last_touched_at:  "2026-06-15T03:02:40Z",
}
```

`organizations` and `events` carry the same trio of fields. `locations`
might too if useful (deferred — locations are arguably never
client-specific).

### One index per entity for fast filter

```sql
DEFINE INDEX IF NOT EXISTS client_access
  ON persons FIELDS client_access;       -- not UNIQUE — multi-valued array
DEFINE INDEX IF NOT EXISTS client_access
  ON organizations FIELDS client_access;
DEFINE INDEX IF NOT EXISTS client_access
  ON events FIELDS client_access;
```

SurrealDB indexes array fields with one entry per element; reads
filtering by `WHERE client_access CONTAINS 'reach-edu'` hit the index
directly.

### The three forms of "touched" are three queries

All against the same observation log:

```sql
-- Who first entered this person?
SELECT VALUE client FROM observations
  WHERE subject = persons:⟨X⟩
  ORDER BY observed_at ASC LIMIT 1;

-- Who's updated this person?
SELECT DISTINCT client FROM observations
  WHERE subject = persons:⟨X⟩;

-- Who currently has them in their worklist (= same as "updated since
-- some retention threshold," for now we just use "ever touched"):
SELECT VALUE client_access FROM persons:⟨X⟩;  -- O(1), from the cache
```

Same data, three lenses. No separate access table.

## What this means for the writes already shipped

The existing 882 `persons` rows (from
`scripts/surreal-write-persons.mjs` — the LinkedIn-network walker) and
881 `located_in` observations (from
`scripts/surreal-backfill-located-in.mjs`) were written **before this
spec landed**. They have no `client` field on their observations and no
`client_access` array on their persons rows.

Two options for them:

1. **Backfill.** A small script that walks the 882 persons and 881
   observations, stamps both with `client = "humain-vc"` (the LinkedIn
   walker was a humain-vc workflow), and refreshes the materialized
   `client_access` arrays. Idempotent. Run once.
2. **Treat as legacy.** Leave them un-tagged, document the cohort
   ("anything created before 2026-06-15 was a humain-vc-only ingest"),
   and only enforce the client field on new writes.

Lean (1) — backfill is small and gives uniform shape, and the
LinkedIn capture work was unambiguously humain-vc work.

## What this means for surfaces that *read* canonical

Every workspace-scoped surface gets a `WHERE client_access CONTAINS
$workspace_slug` predicate baked in. [[Workspaces-as-Tenant-Primitive]]
already plumbs the active workspace slug through every chat turn and
every script; reusing the same plumbing for read-time filtering is the
cheap part.

The [[Sparse-Person-Enrichment-Surface]] worklist becomes:

```sql
SELECT * FROM persons
  WHERE id IN (
    SELECT VALUE subject FROM observations
      WHERE object = events:⟨...⟩ AND predicate IN ["invited_to", "attended"]
  )
  AND client_access CONTAINS $workspace_slug
  AND name IS NONE;
```

The enrichment surface running in reach-edu workspace never even sees
humain-vc's LinkedIn-network rows, even though they live in the same
canonical layer.

## "Available to" as an explicit predicate, later

Today's model treats "client X can see this entity" as equivalent to
"client X has ever touched this entity." That's right for v0.

When sharing-without-touching becomes a real workflow (e.g., reach-edu's
operator says "humain-vc should see this person too because we know
they're a relevant LP"), we add a predicate `made_available_to` with
`object = clients:<slug>`. The materializer reads both the
ever-touched set AND the made-available-to set when refreshing
`client_access`. The read predicate stays unchanged.

Deferred — when a real sharing-without-touching case shows up. No
speculative infrastructure.

## Composes with

- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the data layer
  this pattern modifies. The `observations` table gets a `client`
  field (schema-less, no DEFINE needed), the `persons` /
  `organizations` / `events` tables get a `client_access` array, and
  the index gets added.
- [[Workspaces-as-Tenant-Primitive]] — the source of the workspace
  slug on every write. The shell already passes
  `ctx.workspace_slug` (a.k.a. `ctx.client_id`) on every chat turn;
  scripts already source `.env` per workspace. Reusing.
- [[Sparse-Person-Enrichment-Surface]] — the first surface that needs
  this; the worklist query depends on it.
- [[Joined-People-UI-and-the-Network-First-Pivot]] addendum 5 —
  storage substrate; the client_access pattern is the easy-mode
  answer to "how does the canonical layer stay cross-client without
  leaking proprietary commentary across clients" (commentary is
  separate, on the filesystem; the canonical layer's only multi-client
  concern is *visibility*, which this spec covers).
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — privacy framing
  of the same architectural seam. This spec is the schema-side
  answer; that exploration is the privacy-side framing.

## What lands first (v0.0.0.1)

1. **Update the three writer scripts** that exist
   (`surreal-write-persons.mjs`,
   `surreal-backfill-located-in.mjs`,
   `surreal-materialize-persons-locations.mjs`,
   `surreal-write-event.mjs`) to stamp `client` on every observation
   they create. Read the slug from `process.env.SURREAL_CLIENT`
   (default falls through to `process.env.CLIENT` then aborts loudly
   if neither set).
2. **A small materializer script**
   (`surreal-materialize-client-access.mjs`) walks observations and
   refreshes the `client_access` array on every canonical entity.
   Run after any write batch.
3. **Backfill the humain-vc cohort** — one script, run once, stamps
   all pre-2026-06-15 observations with `client = "humain-vc"` and
   refreshes the arrays.

`fill_out_query`, the [[Sparse-Person-Enrichment-Surface]] verb that
hits the network, lands in the same slice that the surface lands — it
inherits the same client-stamping plumbing.

No client UI changes in this slice — operator never sees the
client_access fields directly. They surface as filter predicates that
make worklists correct, not as fields the operator edits.
