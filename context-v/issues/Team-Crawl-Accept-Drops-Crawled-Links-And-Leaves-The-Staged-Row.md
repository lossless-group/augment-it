---
title: "Team-crawl accept drops the crawled links and leaves the staged row — double-save risk"
lede: "Accepting a staged person creates them and affiliates them — but the LinkedIn/bio links the crawl found never land on the person, and the staged row stays in the results, so the operator can save the same person twice. Accept should carry everything the crawl learned and consume the row."
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
  - Didi-Crawl
  - Persons
  - Org-Workbench
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped 2026-07-24 — accept adds the crawled linkedin_url/bio_url via person.links.add on created persons (soft-fail), and the accepted row is consumed from the staged list. gh #37 closed."
---

# Team-crawl accept: links dropped, row lingers

## The two symptoms (operator-confirmed, 2026-07-24 evening)

1. **Crawled links don't save.** The team crawl usually finds a LinkedIn
   URL (and often a bio page) per person. Accept runs `person.apply` +
   `person.affiliate` — and `person.apply`'s create branch writes
   `linkedin_profile_url` only as a scalar matching field
   (`person-resolver.ts` CREATE), never as a `personal_links[]` entry. The
   new person's card shows zero links; the crawl's best evidence is
   silently discarded.
2. **The accepted row stays staged.** After accept the row flips to
   "added ✓" but remains in the staged list. The person now exists in the
   People list AND in the staged results — redundant state that invites a
   second save (via re-accept paths or operator confusion). An accepted
   row should be CONSUMED: it leaves the staged list; the person appearing
   in the People list above is the confirmation.

## The fix (this doc precedes the implementation by minutes)

- On accept, after apply + affiliate: add the crawled `linkedin_url` and
  `bio_url` to the person via the existing `person.links.add` —
  **on created persons only** (matched persons may already carry them;
  additive-not-duplicative, per [[Additive enrichment never overrides
  accepted|additive discipline]]). Link failures degrade soft — the person
  + affiliation are the core writes.
- On success, remove the row from the staged list entirely (skip
  semantics). The "N staged" count and Done-clear affordance follow.
