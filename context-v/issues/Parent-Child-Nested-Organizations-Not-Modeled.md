---
title: "Parent-Child Nested Organizations Are Not Modeled — Initiatives, Funds, and Sub-Orgs Have Nowhere Canonical to Hang"
lede: "Surfaced in the first triage-inbox co-pilot run (2026-07-25): an Urban Institute event page had no honest destination because upmobility-foundation-urban-institute conflates a parent org (Urban Institute) with an initiative of it (Upward Mobility Foundation). The operator ruled: don't file content into either until the parent/child relationship is actually modeled."
date_created: 2026-07-25
date_modified: 2026-07-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
revisions:
  - 2026-07-25 — Initial draft, written mid-triage-run when the Urban Institute event page (batch 1 item 18) was parked rather than filed into the conflated funder folder.
tags:
  - Issue
  - Augment-It
  - Organizations
  - Canonical-Layer
  - Corpus-Triage
  - Data-Modeling
status: Active
---

# Parent-Child Nested Organizations Are Not Modeled

## The trigger

Triage run `clients/reach-edu/corpus/inbox/_triage-runs/2026-07-24_1.md`, item 18:
`inbox/2026-06-10_apprenticeship-industry-driven-made-to-scale.md` — an Urban
Institute event page (urban.org). The suggestion engine matched it to the funder
folder `upmobility-foundation-urban-institute` by host family
(upward-mobility.urban.org). The operator declined: **the Urban Institute is the
parent org; the Upward Mobility Foundation is an initiative of it** (probably in
cooperation with others). Filing parent-org content into a folder named for the
initiative (or vice versa) bakes the conflation in deeper. A second capture hit
the same wall in batch 2: the Urban Institute *homepage*
(`inbox/2026-06-10_driving-impact-by-equipping-changemakers-with-evidence-and-s.md`).

The same shape recurs across the roster wherever a slug welds two entities
together: `upmobility-foundation-urban-institute`,
`truist-foundation-liftfund-us`, `zoma-foundation-of-zoma-lab`,
`alabama-state-legislature-appropriations-funds`, `the-denver-foundation-beacon`
(Beacon fund of the Denver Foundation), `schusterman-family-philanthropies` vs
`charles-and-lynn-schusterman-family-foundation`, and BlackRock Future Builders
(a program of BlackRock, administered by JFF's CAWBL).

**The Koch / Stand Together constellation (operator note, 2026-07-25)** is the
sharpest case — a deliberately layered structure ("Charles Koch trying to hide
his money and influence"): Stand Together the umbrella community, **Stand
Together Trust** (formerly the Charles Koch Institute), **Stand Together
Foundation**, Stand Together Ventures/other arms, and the **Charles Koch
Foundation** itself. reach-edu currently holds `charles-koch-foundation` and
`stand-together-trust` as separate funder folders, and both
`stand-together-trust` and `stand-together-foundation` org rows exist in the
DB — all legitimately distinct entities, NOT dedupe candidates. What's missing
is the edges between them. Deliberately-opaque giving structures are exactly
why the relation model matters for a philanthropic-funding client: knowing that
a grant from any arm is Koch-network money is analysis the flat model can't
produce.

**Academic institutions (added 2026-07-25, batch 5):** the new
`academic-institutions/` bucket is nested by construction — Project on
Workforce ⊂ Harvard Kennedy School ⊂ Harvard University. The org row minted
(`project-on-workforce-at-harvard`) is the leaf; nothing expresses the chain.
Operator flagged this explicitly when ruling the bucket.

## What's missing

1. **DB shape.** `organizations` rows are flat. There is no edge or field
   expressing *initiative-of / fund-of / program-of / chapter-of*. SurrealDB is
   a graph database — a `RELATE`-style edge (e.g. `initiative_of`, or a typed
   `org_relations` edge with a `kind` field) is the natural fit, but nothing
   mints or reads one today.
2. **Disk shape.** `funders/<slug>/` folders are flat siblings. No convention
   says whether a sub-org gets its own folder, nests, or points.
3. **Aboutness routing.** Triage has no rule for which org a piece of content
   files under when parent and child both plausibly claim it.

## Candidate shape (proposed during the run, NOT ratified)

- Both parent and child get their own `organizations` rows (SurrealDB stays the
  source of truth; no more welded slugs for new entries).
- A typed relation edge connects them (`initiative_of`, `fund_of`,
  `program_of`, …) — queryable in both directions.
- Corpus content files canonically under whichever org the item is **about**,
  with a `reference_of:` pointer file in the other folder when discoverability
  wants it — the pattern first used for BlackRock↔jff (canonical in
  `funders/jff/`, pointer in `funders/blackrock/`, content_uuid
  `019eec87-f75e-7702-8adf-41a444fb1fc2`).
- Existing welded slugs get untangled lazily, on first real filing pressure,
  not in a big-bang rename.

## Parked pending this issue

- `inbox/2026-06-10_apprenticeship-industry-driven-made-to-scale.md` (Urban
  Institute event; batch 1 #18)
- `inbox/2026-06-10_driving-impact-by-equipping-changemakers-with-evidence-and-s.md`
  (Urban Institute homepage; batch 2)

## See also

- [[../agent-skills/triage-inbox-w-suggestions/SKILL|triage-inbox-w-suggestions]] — open-decisions list links here; the triage lane that keeps hitting this.
- `clients/reach-edu/corpus/inbox/_triage-runs/2026-07-24_1.md` — the run manifest where the ruling was recorded.
