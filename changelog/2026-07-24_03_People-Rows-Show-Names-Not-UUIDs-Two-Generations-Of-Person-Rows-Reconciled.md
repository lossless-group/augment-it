---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "People rows show names, not UUIDs — two generations of person rows reconciled at the read layer"
lede: "The Gates Foundation's Deputy Director rendered as a bare UUID: her row was born from the crawlbase/event-CSV import scripts, which wrote full_name and never name — the field every person read selects. All person reads now coalesce name ?? full_name, fixing 136 of 1232 persons at once; the operator-run backfill makes it durable on data."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/record-surrealdb-resolver/src/person-resolver.ts
tags:
  - Org-Workbench
  - Persons
  - Canonical-Layer
  - Usability
---

# People rows show names, not UUIDs

## The diagnosis ([#28](https://github.com/lossless-group/augment-it/issues/28))

The people reveal fell back to `person_uuid` because the row genuinely had no
`name` — a live SurrealDB inspection showed the affected person carries
`full_name: "Melanie Brown"` (+ `first_name`/`surname`) and no `name` at all.
The persons table has **two generations of rows**: `person.apply`-born rows
write `name`; the crawlbase LinkedIn and event-CSV import scripts wrote
`full_name`. Scope, measured live: 1232 persons — 1057 with `name`, **136
missing it but holding `full_name`**, 39 with no name data of any kind.

## The fix

Every person read in the resolver now projects `name ?? full_name AS name`:
`PERSON_FIELDS` (candidates scoring + person lookups), `person.search`'s
autocomplete (projection, filter, and ordering), `affiliation.detail`, and
`organization.affiliations`. One coalesce per read point; both generations
display. Proven live read-only: the affiliations projection returns
`"Melanie Brown"` for the Gates Foundation edge.

## The durable half — operator-run backfill

Filling `name` from `full_name` where missing is a bulk canonical write, so it
stays operator-run rather than agent-run. The scoped, additive script (fills
the missing field only, never overwrites) is staged for a scripts/ home; until
it runs, the coalesce carries the display alone. The 39 rows with no name data
at all keep showing their UUID — there is nothing to derive a name from; they
are import stubs awaiting enrichment.
