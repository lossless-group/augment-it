---
title: "Merging organizations or people — when two objects turn out to be the same entity, dedupe non-destructively"
lede: "Two rows are sometimes the same entity and nothing merges them — no edge re-pointing, no list union, no slug absorbed into `aliases[]`."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Organizations
  - Persons
  - Dedupe
  - Merge
  - Canonical-Layer
status: Open · Stub
site_uuid: 51bcba8c-17bd-4578-952a-03b2b3d62ed2
hex_code: zpdsmu
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# Merge organizations or people — a stub

## The need

Duplicates are inevitable at capture time — the candidate gates reduce them
but can't eliminate them (operator picks "create" when the match was real,
two imports spell one org two ways, a person exists once with an email and
once with a LinkedIn URL). Today discovering a duplicate is a dead end:
nothing merges. The two rows drift apart, each accumulating links, corpus,
streams, affiliations, and observations the other doesn't have.

## Shape of the thing (jotted, not designed)

- **Non-destructive.** The loser is absorbed, not deleted: slug → the
  survivor's `aliases[]` (the `updateOrg` rename precedent), arrays union'd
  (URL-dedup'd, the additive discipline's existing keys), observations
  preserved with their provenance, `client_access` union'd. A tombstone or
  redirect pointer so anything stamped with the old slug/uuid still resolves.
- **Effective.** Affiliation edges re-pointed to the survivor (dedup'd
  against existing edges), opportunities re-stamped (the `updateOrg` fan-out
  precedent) — after the merge there is ONE row to find.
- **Human-driven.** Per [[human-in-drivers-seat]]: the operator picks the
  survivor and resolves field conflicts (which `complete_name` wins?);
  side-by-side compare, not an auto-merge score.
- **Perhaps its own microfrontend.** A compare-and-merge surface (two cards,
  field-by-field pick, one confirm) doesn't fit inside the org card; a
  dedicated remote fits the one-surface-per-job pattern the workbench
  already follows.

## Deliberate contrast to keep

Opportunities are **never auto-merged** by design (duplicates across record
sets are intentional — see the Grilling-on-DB-Resolver decisions). This merge
is for the CANONICAL layer only: organizations and persons, where one
real-world entity should be one row. The opportunity rule stands.

## Open questions

- [ ] One merge verb (`entity.merge`?) or per-table
  (`organization.merge` / `person.merge`)?
- [ ] Duplicate DISCOVERY — does the merge surface also hunt candidates
  (same domain, near-name), or only act on pairs the operator brings?
- [ ] What does the tombstone look like — a row with `merged_into`, or an
  alias entry alone?
- [ ] Observations: re-point subject/object to the survivor, or leave them
  citing the absorbed row and resolve through the tombstone?
