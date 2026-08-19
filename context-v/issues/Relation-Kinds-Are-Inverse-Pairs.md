---
title: "Relation kinds are inverse pairs — one stored string can't speak from both seats"
lede: "NextLadder is funded_by Ballmer Group; Ballmer Group is funder_of NextLadder — the same edge needs a different kind string per perspective, and today only one pair is special-cased in a read-time map."
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
  - Org-Relations
  - Data-Modeling
status: Active
site_uuid: 2697e117-3a10-4832-a576-6693c51b3adc
hex_code: wj23wc
date_authored_initial_draft: 2026-07-28
date_authored_current_draft: 2026-07-28
publish: true
---

# Relation kinds are inverse pairs

## The observation (operator, 2026-07-28)

> relationships have the kind/type string. They are often inverse, so need
> to be written both ways inverted. So NextLadder is funded_by Ballmer
> Group, Ballmer Group is funder_of NextLadder.

One org↔org edge, one truth — but the **kind string reads differently
depending on which card you're standing on.** `rel` (parent/child/peer)
already gets this right via read-time projection; `kind` mostly doesn't.

## Current state (shipped same day, deliberately partial)

- Kinds are authored ONCE, from the edge's `in` side
  (`ballmer-group —funder_of→ nextladder`). Storage is a single string.
- `listOrgRelations` inverts at read time via a **hardcoded map** in
  `org-relations.ts` (`KIND_INVERSE`): `funder_of ↔ funded_by`,
  `funds → funded_by`. That fixed the NextLadder card — and nothing else.
- Every other directional kind still reads wrong from one seat:
  - Hierarchical kinds on the CHILDREN listing: the parent's card shows
    `cfat (initiative_of)` — reading as if CFAT were initiative_of the
    viewer's child, when the honest label from the parent's seat is
    something like `has_initiative`.
  - Any future directional kind (`member_of`, `spun_out_of`,
    `fiscal_sponsor_of`…) silently inherits the defect until someone adds
    a map entry.
- Symmetric kinds (`partners_with`) are fine — they're their own inverse.

## Design space (log, don't decide)

1. **Extend the read-time map** — cheapest; the vocabulary lives in code:
   `initiative_of → has_initiative`, `fund_of → has_fund`,
   `program_of → has_program`, `agency_of → has_agency`,
   `chapter_of → has_chapter`, symmetric kinds mapping to themselves.
   Con: open-vocabulary kinds (the operator can type anything) get no
   inverse until code changes.
2. **Store both directions on the edge** (`kind` as authored +
   `kind_inverse`, both writable at relate/update time) — redundancy-over-
   normalization house ethos; the operator can author asymmetric wording;
   reads pick by seat. Con: two fields to keep coherent on update.
3. **A kind-vocabulary table** (pairs as data, per client like `tag_vocab`)
   — inverse pairs become operator-curated data, the datalist can offer
   both forms, exports/didi read the same source. Most machinery.

Whatever the choice, the UI datalist and didi's slab should present kinds
in the operator's seat-relative form ("is funded_by…" when relating from
the recipient's side), and the export's `related_orgs` column has the
same seat problem.

## See also

- `services/record-surrealdb-resolver/src/org-relations.ts` — the
  `KIND_INVERSE` map (the partial fix) + the shapeRelated projection.
- [[../plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags]] — the shipped
  model this refines.
- Live examples to test any fix against: NextLadder's four funders, the
  National Academy for AI Instruction's three, CFAT ⊂ carnegie-foundation,
  FIPSE ⊂ us-department-of-education.
