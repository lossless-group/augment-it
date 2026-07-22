---
date_created: 2026-07-22
date_modified: 2026-07-22
title: "The people reveal lands — persons nest under the org card, and adding one generates its affiliation with no explicit step"
lede: "Spec steps 6 and 7 become chrome: every person RELATEd to an org listed with role and relevance, expandable to nested identity links with their own ➕ and 🔍, and an inline add-person where the operator only resolves the human — the affiliation edge and its observation materialize from person.affiliate with the org pre-bound."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - apps/org-workbench/src/PeopleReveal.svelte
  - apps/org-workbench/src/PersonCard.svelte
  - apps/org-workbench/src/AddPersonInline.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/lib/types.ts
  - apps/org-workbench/src/app.css
  - context-v/plans/Augment-From-DB-Phase-4-People-Reveal-And-Add-Person.md
tags:
  - Progress-Update
  - Augment-From-DB
  - People-Reveal
  - Affiliations
  - Org-Workbench
---

# People reveal — the org card grows its humans

Phase 4 of [[../context-v/specs/Augment-From-DB-Flow.md]], entirely UI in `apps/org-workbench` — zero service changes, because every verb this phase needs shipped in Phase 1 or in the person-db-resolver era. That was the point of sequencing the capabilities first.

## What shipped

**`PeopleReveal`** — a collapsible "People · N" section under the org card's three lists, lazy-loading `organization.affiliations` (relevance-sorted server-side; Aspen's 10 people are the live reference). Each row shows name · role · relevance pill · links/corpus counts, and expands to a **`PersonCard`**: identity links as a full `AdditiveList` (➕ → `person.links.add`, 🔍 dispatching the person-shaped search envelope that search-and-add has been routing since Phase 3), corpus as count + ➕ + 🔍 (entries ride `affiliation.detail` in a later pass — `organization.affiliations` carries counts by Phase 1 contract).

**`AddPersonInline`** — spec step 6's "magic," with the operator gate the product is built on: name (+ optional LinkedIn, role) → `person.candidates` → ALWAYS a gate (pick a scored match or explicitly "create new" — even zero candidates gets the explicit choice) → `person.apply` → `person.affiliate` with this card's org pre-bound. The affiliation edge and its paired observation appear without any affiliation UI existing — and the same person can gain other orgs later, N-affiliation by construction.

Cross-surface refresh is uniform: every person write dispatches `augment-it:entity-updated { person_uuid }`, and the reveal refetches whether the write came from its own ➕ or from the search-and-add rail.

## Proof

svelte-check 0 errors / 0 warnings (90 files); org-workbench and shell build green. The add-person write path is deliberately NOT exercised headlessly — it creates real canonical persons, and polluting the shared layer for a smoke test violates the additive-writes discipline; `person.apply`/`person.affiliate` were live-proven in the person-db-resolver flow, and `organization.affiliations` in Phase 1. Operator walk-through: reveal Aspen's 10 → expand one → ➕ a link → add a real person → watch the affiliation appear with no explicit step.

## What's next

Phase 5 (v1.1): stream-scan mode — fire a `media_streams[]` entry (Aspen's blog is already seeded) through the entity-pulse machinery, dedup against `content_items.url`, badge the already-known, one-click the new into the corpus.
