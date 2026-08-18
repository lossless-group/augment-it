---
title: "Response–Row Identity Across Promote — Why Responses Outlive Their Rows, and the `record_uuid`-on-Response Fix"
lede: >-
  Promote deletes parent rows, leaving responses pointed at dead `row_id`s; carrying `record_uuid` on the response resolves them by identity.
date_created: 2026-05-26
date_modified: 2026-05-26
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Blueprint
  - Augment-It
  - Response-Identity
  - Row-Identity
  - Promote-Mechanics
  - Record-UUID
  - Audit-Trail
  - Cross-Derivation
status: Draft
site_uuid: b5086f64-2b2a-4841-ae4d-73173d3461df
hex_code: 54jgji
date_authored_initial_draft: 2026-05-26
date_authored_current_draft: 2026-05-26
---

# Response–Row Identity Across Promote

## The pattern in one paragraph

Responses (audit-trail records of one fired LLM call or pack search) live in
**response-store**. Rows (the data being enriched) live in **row-store**.
These services are independent — neither garbage-collects the other.
`record_set.promote` is a row-store operation: it folds parent rows into a
canonical record set with new row IDs and deletes the parent rows.
Responses are *not* migrated. They keep their original `row_id` and
`record_set_id`, both of which now point to nothing.

The blueprint is about reconciling that survival mismatch — surfacing
orphans cleanly, and (more importantly) carrying enough identity on the
response itself that "what was this response for?" remains answerable
*after* its parent row is gone.

## How orphans get created

Concrete walkthrough using the foundation-dataset history that produced
this blueprint (2026-05-26):

1. CSV upload → record set `rs_mpg0nodc_kfq2ep` with rows
   `row_rs_mpg0nodc_kfq2ep_0` through `_<N-1>`.
2. Each row gets a `record_uuid` minted on creation — the stable
   cross-derivation identity per [[Original-and-Enhanced-Record-Instances]].
3. Prompt "Find Organisation URL" fires against the parent set →
   N responses created in response-store, each tagged
   `response.row_id = row_rs_mpg0nodc_kfq2ep_<i>`,
   `response.record_set_id = rs_mpg0nodc_kfq2ep`.
4. User triages + accepts responses → `row.update` writes the accepted
   URL into each parent row's `fields.url` column.
5. User runs `record_set.promote` →
   - row-store mints new canonical rows `row_rs_promoted_..._<i>` carrying
     the parent's fields (including the accepted url) AND the same
     `record_uuid` as the parent's row.
   - row-store **deletes the parent rows**. (Or archives the parent set
     and cleans rows later — net effect for this discussion is the same:
     the old row_ids no longer resolve.)
6. The N responses still exist in response-store, untouched, with their
   row_id and record_set_id fields still pointing at the parent (now
   gone).

Step 6 is the orphan generator. The data wasn't lost — the URLs the
responses produced are baked into v4 rows. What's lost is the *link*
from response back to the entity it described.

## Why we can't just join via record_uuid today

In principle, the link is recoverable:

```
orphan response.row_id → look up parent row → read parent.record_uuid →
find canonical row with same record_uuid → group response with that entity
```

But step 1 of that chain ("look up parent row") fails — the parent row
was deleted in step 5. So the response holds a dead foreign key into a
table that doesn't have the record anymore.

`record_uuid` lives on rows. Responses carry no such identifier.
The link relies entirely on the parent row's existence as a join table.

## The fix — carry `record_uuid` on `ResponseRecord`

A small additive schema extension on response-store:

```typescript
// services/response-store/src/store.ts (proposed)
export type ResponseRecord = {
  // ... existing fields
  record_uuid: string | null;   // copied from row.fields.record_uuid at create time
  // ... pack-aware fields
};
```

At response create time (in `createResponse`), look up the target row,
read `row.fields.record_uuid`, and store it on the response. Cost: one
extra row.get per response create. Worth it.

With `record_uuid` on responses:

```
orphan response.record_uuid → find canonical row by record_uuid (a join
across record sets, not via row_id) → group response with that entity
```

The link no longer depends on the parent row's continued existence. The
identity rides on the response itself.

## What this enables, beyond fixing orphans

The same join works for live cross-derivation lookups, not just
post-promote audit:

- **"Show me every response ever produced for this entity, across all
  enrichment rounds."** Query response-store by `record_uuid`; group by
  record_set_id; show the full enrichment history per entity.
- **"What did this row look like in the previous round?"** Find the
  predecessor row by record_uuid; show its old field values alongside
  the current.
- **Triage state cementation that survives promote.** If
  `triage_states` becomes a per-record_uuid view rather than per-row_id,
  the cementation discipline (currently deferred) gets a stable anchor.

The `record_uuid`-on-response fix is small but unlocks several
follow-on capabilities.

## Cost — backfill is partial

For new responses created after this change ships, `record_uuid` lands at
create time. Easy.

For existing responses created before this change ships, backfilling
requires the parent rows to still exist. The 96 orphans from the
foundation-dataset history *can't* be backfilled because their parent
rows are already deleted. They stay orphan forever, even after the
schema change.

This means there are **two classes** of historical responses:
- **Pre-fix in-set responses** — parent row still exists; backfill by
  looking up `row.fields.record_uuid`. One-shot script at deploy time.
- **Pre-fix orphan responses** — parent row gone; no backfill possible.
  Either keep as orphans-in-amber (audit-trail of "something existed
  here once"), or delete them (cleanest UI; loses the historical thread).

The 2026-05-26 foundation work chose to **delete the 96 orphans** since
their accepted URLs are already in v4 rows (promote folded them); the
audit value is low compared to the UI noise of orphan-row-id cards.
See the companion cleanup script
`services/response-store/scripts/scrap-orphan-responses.ts`.

## The UI side — what changes when `record_uuid` lands

Response Reviewer's by-record view today groups responses by `row_id`.
With record_uuid on responses, it should switch to grouping by
**identity (record_uuid)**, not by row_id. Then:

- Pre-promote and post-promote responses for the same entity collapse
  into one card.
- The card header reads the *current* (post-promote) row's name.
- Historical responses appear as additional mini-rows inside the card,
  marked with their original record_set_id (e.g. "from previous round").

The record-set scope filter (added 2026-05-26) stays useful for
"narrow to this run" — but the orphan-bucket concept goes away, because
responses can resolve to entities even when their parent row is gone.

## Implementation order

When this lands as its own session:

1. **Schema extension.** Add `record_uuid: string | null` to
   `ResponseRecord`. Backfill in `load()` defaults to null for older
   records (matching the existing additive-only pattern from
   [[Packs-and-Bundles-Pattern]]).
2. **`createResponse` looks up record_uuid.** Per-create row.get
   (cached or batch as needed if a hot path turns out to matter).
3. **Backfill script** for existing responses whose parent rows still
   exist. Reads row-store's data, finds responses whose row_id resolves,
   reads that row's record_uuid, patches the response. Idempotent.
4. **by-record view groups by record_uuid** instead of row_id when
   record_uuid is non-null, falls back to row_id otherwise. Resolves
   entities via cross-set record_uuid lookup. Removes the orphan-bucket
   chip (responses with record_uuid + no current row STILL group, just
   with a "previous round" badge).
5. **Promote folds responses' triage_states into rows** by record_uuid.
   The cementation discipline finally gets its stable anchor.

## Anti-patterns to avoid

- **Mutating the response's row_id at promote time.** Tempting but
  wrong — audit records should be immutable. The original row_id is
  historical fact and must stay; identity goes on a *new* field.
- **Storing record_uuid on responses but ignoring the row_id.** Both
  are useful: row_id pins the response to a specific row at create
  time (run-level audit); record_uuid pins it to an entity across
  rounds (identity-level audit). Keep both; query by whichever fits.
- **Garbage-collecting responses when their rows disappear.** Loses
  the audit trail. Either keep them as orphans (current behavior) or
  add identity so they're never orphan in the first place.

## Related

- [[Original-and-Enhanced-Record-Instances]] — the record_uuid +
  promote-lineage model this blueprint extends to responses
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — promote mechanics
  spec; triage_states cementation is the canonical example of "things
  that need a stable anchor across promote"
- [[Packs-and-Bundles-Pattern]] — the response-shape extensions
  (outcome, structured, pack_id, …) that already follow the
  additive-only schema pattern this fix follows
- [[Run-as-First-Class-Operation]] — the Run entity carries scope info;
  `record_uuid`-on-response complements Run by providing per-entity
  identity to pair with the Run's per-operation identity
