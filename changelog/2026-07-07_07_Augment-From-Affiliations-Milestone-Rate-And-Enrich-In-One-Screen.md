---
date_created: 2026-07-07
date_modified: 2026-07-07
title: "Augment from Affiliations hits its milestone — rate, link, and enrich in one screen, 9 real rows worked end to end"
lede: "The v0.1.0.0 rating loop shipped tonight, then got real feedback the moment it was actually used: two screens for one task was the wrong shape. Reversed course — apps/affiliation-rating-resolver now does what record-db-resolver and person-db-resolver already do for their entities: view the record, edit it in place. Five new capabilities later, the operator worked through 9 real FreedomFest 2026 affiliations end to end — real relevance ratings, real notes, real canonical links, real corpus content — and every byte of it verified correct directly against SurrealDB."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - apps/affiliation-rating-resolver/src/App.svelte
  - apps/affiliation-rating-resolver/src/app.css
  - apps/affiliation-rating-resolver/src/lib/resolver-client.ts
  - apps/affiliation-rating-resolver/src/lib/types.ts
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/person-resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/record-surrealdb-resolver/src/person-handlers.ts
  - services/workspace/src/capabilities.ts
  - context-v/specs/Augment-From-Affiliations.md
tags:
  - Progress-Update
  - Milestone
  - Affiliations
  - Canonical-Layer
  - Relevance-Rating
  - Reach-Edu
  - FreedomFest
---

## Why Care?

Ship, use, learn, fix — same day. `apps/affiliation-rating-resolver` went from spec to a live screen to real operator feedback to a real architecture reversal to a verified working milestone, all in one session. The version that actually stuck looks different from either draft: not the original all-in-one worklist, not the CSV-only split — a per-affiliation screen where relevance, links, and corpus content all get edited in the same place, because that's what using the first version revealed the job actually is.

## What's New?

- **The screen now edits, not just rates.** Relevance is an editable dropdown + note field, pre-filled from a CSV import but changeable right there. Below it, four sections — person links, person corpus, org links, org corpus — each showing what already exists and a one-line add form for what's missing.
- **Five new capabilities**, all through the same NATS-gated discipline every other write in this app uses:
  - `affiliation.detail` — fetches the *current* canonical state (not a stale CSV snapshot) whenever the operator lands on a row.
  - `person.links.add` / `person.corpus.add` — single-entry additive writes to `persons.personal_links` / `personal_corpus`.
  - `organization.links.add` / `organization.corpus.add` — the org-side siblings, narrower than `resolver.apply`'s whole-record batch path.
- **9 real rows, worked end to end and verified.** John Goodman, Marc Lichtenfeld, Tim Van Milligan, David T. Phillips, Peter Lipsett, Alexander McCobin, and Ahmed Mousa all got real relevance ratings with real reasoning notes and real canonical links/corpus pulled from actual research — not test data. Rand Paul and Jessie Markell got links/corpus added with a rating still pending. Every one of these checked out correct on direct query against SurrealDB: right values, right client tagging, right actor attribution.

## The Story

The reversal came from watching someone actually try to use v0.1.0.0: "you're supposed to give me the kind of UI that's in record-db-resolver — I'm supposed to be able to edit the record and add links." That's a different shape than the CSV-round-trip-plus-a-separate-app split the earlier draft settled on. The fix wasn't a patch — it meant reviving capabilities cut from the very first draft (`person.links.add` etc., dropped in v0.0.0.2 in favor of routing through `person-enrichment`) and building them properly this time, gated the same way as everything else instead of `person-enrichment`'s direct-SurrealDB pattern.

```mermaid
flowchart LR
    A[v0.1.0.0: rate via CSV,\nlinks via a second app] -->|used it once| B[operator: wrong shape]
    B --> C[v0.2.0.0: one screen,\nedit in place]
    C --> D[9 real rows, verified]
```

Along the way: a query that accidentally swept the entire pre-existing 882-person `humain-vc` dataset while trying to verify just tonight's work (a scoping mistake caught and corrected, not a data problem), and a stale-browser-tab scare where a screenshot showed an old error message and placeholder text even though a direct database query confirmed every single edit had landed correctly — the fix was a hard refresh, not a data recovery.

## What's Next

Rand Paul and Jessie Markell still need their ratings applied (links/corpus already saved). The known duplicate-person rows (Ethan Akimoto, Rudolfo Beltran) from earlier tonight are still on the list, untouched by this work. The CEO-brief export that turns rated affiliations into something shareable is still the next real spec, now with real rating data to design against instead of guesses.

## Related

- `context-v/specs/Augment-From-Affiliations.md` — now at v0.2.0.0
- [[2026-07-07_06_Augment-From-Affiliations-Initial-Build-Live-Rating-Loop-Working]] — the v0.1.0.0 entry this one reverses part of
