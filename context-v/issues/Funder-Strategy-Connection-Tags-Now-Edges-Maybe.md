---
title: "Funder↔strategy is tags for now — whether it deserves a real edge is deferred"
lede: "140 strategy tags landed on 69 funders, but a tag can't carry evidence counts, gift sizes, or recency. The edge question comes due later."
date_created: 2026-07-28
date_modified: 2026-07-28
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Data-Modeling
  - Strategies
  - Funders
status: Active
site_uuid: a5aa838c-8991-424d-bdb5-91838d0baaf1
hex_code: nhhx09
date_authored_initial_draft: 2026-07-28
date_authored_current_draft: 2026-07-28
---

# Funder↔strategy: tags now, edges maybe

## What shipped (2026-07-28)

`scripts/tag-funder-strategies-from-mega-gifts.mjs` — each funder org
carries the Train-Case form of every strategy its mega-gift rows
referenced, as ordinary `has_tag` observations (140 tags across 69
funders on first run). Resolution derives from what the ingest actually
wrote: an org is a row's funder iff the row's `source_url` sits on that
org's corpus — no name re-matching. Tags show on the workbench card,
filter in the CRM export's `tags` column, and seeded `tag_vocab` so the
strategy names autocomplete everywhere tags are typed.

Also true and worth remembering: the connection exists a second way,
**implicitly through shared content** — the same article registers on
both the funder's `org_corpus` and the strategy's `source_usages`, so
funder↔strategy is always derivable by URL join, with the article itself
as the evidence.

## The deferred question

A tag is a bit. The real relationship has weight:

- **Evidence count** — Ballmer touches workforce-development via four
  gift rows; AT&T via one. The tag renders both identically.
- **Magnitude** — a $250M pledge and a $50K grant tag the same.
- **Recency/decay** — a 2019 gift and a 2026 gift tag the same; funder
  interest drifts.
- **Provenance** — which articles/gifts justify the tag (today: answerable
  only by the URL join).

If reach-edu's core product question becomes "which funders are most
aligned with strategy X, ranked" — the answer wants a first-class
**funder→strategy edge** (an `org_domain_relations`-style RELATE, or the
existing `affiliations` table with a third edge_type) carrying
`evidence_count`, `total_amount`, `last_evidence_at`, and refs to the
content_items that justify it — probably MAINTAINED by the ingest paths
rather than authored by hand.

Not now, per operator ruling ("let's not worry about the deeper design
question"). The observation-log design means tags today don't preclude
edges later; the mega-gifts CSV (amounts included) remains the backfill
source whenever this comes due.

## See also

- `scripts/tag-funder-strategies-from-mega-gifts.mjs` — the shipped pass.
- `scripts/ingest-mega-gifts-by-topic.mjs` — the ingest whose writes the
  resolution derives from.
- [[Relation-Kinds-Are-Inverse-Pairs]] — the sibling deferred design
  question in the same relations space.
