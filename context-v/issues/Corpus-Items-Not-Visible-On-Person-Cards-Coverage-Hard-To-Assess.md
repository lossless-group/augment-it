---
title: "Corpus items aren't visible on person cards — and corpus coverage across entities is hard to assess anywhere"
lede: "The person card says 'Corpus items 3' and shows nothing — a count with no list, no titles, no URLs. Since a core purpose of this work is assuring corpus items exist for every relevant organization and person, the operator can neither inspect what the 3 are nor assess coverage across the entity graph."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Usability
  - Augment-It
  - Corpus
  - Org-Workbench
  - Persons
  - Coverage
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Layer 1 (per-card visibility) shipped 2026-07-24 AM — eager entries on organization.affiliations, AdditiveList render, no titles (content_items has none; the write-side is [[Corpus-Adds-Dont-Fetch-Metadata-No-Cue-No-Inspector]]). Layer 2 (coverage roster) shipped same day PM in 760e9fe as the OrgRoster column, gh #32 — un-deferring the earlier fold-into-#22 plan. gh #20 closed."
---

# Corpus items invisible on person cards; coverage unassessable

## The symptom (screenshot-confirmed, 2026-07-24)

On the Lumina card → People → Jamie Merisotis: **"Corpus items 3"** — a
count, a 🔍, a ➕, and no list. The operator can add a fourth item without
ever seeing the three that exist. Links render in full; corpus doesn't.

## Why this happened (a Phase 4 contract decision, now disproven)

`organization.affiliations` deliberately returns `personal_corpus_count`
only — the Augment-from-DB spec's Phase 4 scoped entry-listing out
("entries ride `affiliation.detail` in a later pass if the operator wants
it"). The operator wants it. First real session with the surface proved
count-only wrong: **assuring corpus coverage is a core purpose of the
workbench**, and you can't assure what you can't see.

## Two layers to the fix (jotted)

1. **Per-card visibility (the direct fix).** Either extend
   `organization.affiliations` to return `personal_corpus[]` entries
   (payload is small; 8MB NATS ceiling is nowhere near), or lazy-fetch
   per-person on expand via the existing `affiliation.detail` (already
   returns `person.personal_corpus` — zero new verbs). Render with the
   same list shape as links: kind badge · host/title · date. Same
   question applies to `content_items` hydration — org corpus rows
   render bare URLs today; titles live in the ledger unused.
2. **Coverage assessment (the real job).** A view that answers "which
   relevant orgs/people have NO corpus items (or none newer than X)?" —
   a sortable roster of entities with link/stream/corpus counts, thin
   rows, red-zero highlighting. Could be a lens over the canonical layer,
   a workbench mode, or a didi verb (`/coverage`). This is what "hard to
   assess" actually asks for; the per-card fix alone doesn't answer it.

## Open questions

- [ ] Eager (extend affiliations reply) vs lazy (affiliation.detail on
  expand) — lazy ships with zero service changes; eager is one query.
- [ ] Do corpus rows want titles from `content_items` (a join) or is
  URL+kind enough for v1?
- [ ] Where does the coverage roster live — and does it fold into the
  usability-iteration sweep alongside
  [[No-Component-Library-UI-Improvised-Not-Component-Based]]?
