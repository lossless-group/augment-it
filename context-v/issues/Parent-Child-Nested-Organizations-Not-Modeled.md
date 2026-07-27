---
title: "Parent-Child Nested Organizations Are Not Modeled — Initiatives, Funds, and Sub-Orgs Have Nowhere Canonical to Hang"
lede: "Surfaced in the first triage-inbox co-pilot run (2026-07-25): an Urban Institute event page had no honest destination because upmobility-foundation-urban-institute conflates a parent org (Urban Institute) with an initiative of it (Upward Mobility Foundation). The operator ruled: don't file content into either until the parent/child relationship is actually modeled."
date_created: 2026-07-25
date_modified: 2026-07-27
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
revisions:
  - 2026-07-27 — **Model shipped + pilot untangled (0.0.1.0).** Section C fully checked (edges in `affiliations`, six capabilities, workbench surface, triage step 5b); pilot case A-1 done with a superseding ruling — UpMobility Foundation and Urban Institute's Upward Mobility initiative are DISTINCT entities, related peer/`partners_with`, not initiative-of. All three parked captures filed. Remaining: worklist A-2..4 and B, untangled lazily at filing pressure per the standing ruling.
  - 2026-07-25 — Initial draft, written mid-triage-run when the Urban Institute event page (batch 1 item 18) was parked rather than filed into the conflated funder folder.
  - 2026-07-27 — **Reconciliation worklist added (0.0.0.2).** After the DB-slug-is-source-of-truth pass renamed every cleanly-renamable folder, the welded slugs are the last disk↔DB divergence — operator directed: build this in and track it. Full per-case inventory with current state and untangle steps; gh issue opened for the work trail.
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

## The reconciliation worklist (added 2026-07-27 — this is the tracked work)

Everything cleanly renamable was renamed on 2026-07-27 (DB slug = source of
truth). What remains is exactly the set this issue exists for. Untangling one
case = (1) ensure BOTH entities have org rows, (2) create the typed relation
edge, (3) split/rename the disk folder by aboutness with `reference_of:`
pointers across the seam, (4) re-home any parked inbox captures.

### A. Welded disk folders (4)

- [x] **`funders/upmobility-foundation-urban-institute/`** — UNTANGLED
      2026-07-27 (the pilot case, run through the live Org Workbench +
      operator-confirmed sweep). **Ruling supersedes the original framing:**
      the weld conflated two DISTINCT entities — UpMobility Foundation
      (upmobility.org, a nonprofit donor) and Urban Institute's Upward
      Mobility *initiative* (upward-mobility.urban.org). The operator ruled
      the relation **peer / `partners_with`**, not initiative_of — the
      initiative is Urban's, not the foundation's. `urban-institute` minted
      via the workbench (+`Think-Tank` tag); edge live in `affiliations`;
      folder split by aboutness (7 files → `funders/upmobility-foundation/`,
      6 → `think-tanks/urban-institute/` incl. the three parked captures,
      2 gated, 2 re-inboxed) with NO `reference_of:` pointers — the DB edge
      carries the connection. reach-edu commit `30e0453`.
- [ ] **`funders/truist-foundation-liftfund-us/`** — Truist Foundation welded
      to LiftFund (a CDFI grantee/partner, not a sub-org — the edge here is
      `funds`/`partners_with`, not `initiative_of`). Clean `truist-foundation`
      row EXISTS. Untangle: decide LiftFund's own row + bucket, split folder.
- [ ] **`funders/the-denver-foundation-beacon/`** — the Beacon fund OF the
      Denver Foundation. Clean `denver-foundation` row EXISTS. The fund is the
      thing reach-edu cares about; the community foundation is its host.
      Untangle: `beacon-fund —fund_of→ denver-foundation`; folder probably
      renames to the fund's own slug.
- [ ] **`funders/alabama-state-legislature-appropriations-funds/`** — a
      funding *mechanism* (state appropriations) welded to a gov body. NO row
      exists for either. Untangle: mint `alabama-state-legislature`
      (gov-entities); decide whether the appropriations channel is an edge
      property, a stream, or its own entity.

### B. Same-shape residue (not welded folders, same missing model)

- [ ] **`funders/mandelblatt-foundation/`** — a donor fund hosted at a
      community foundation (yourcommunityfoundation.org); no row. Same
      fund-of shape as Beacon.
- [ ] **Koch / Stand Together constellation** — rows exist
      (`charles-koch-foundation`, `stand-together-trust`,
      `stand-together-foundation`); the edges don't. See the constellation
      note above.
- [ ] **`us-department-of-agriculture` ↔ `usda-rural-development`** — both
      rows exist as flat siblings; needs `agency_of` (and DOL/ETA has the
      same shape waiting: TEGL/ETA content sits on `us-department-of-labor`).
- [ ] **Academic chain** — `project-on-workforce-at-harvard` is a leaf with
      no chain to HKS/Harvard (see the academic-institutions note above).
- [ ] **DB dupe, non-destructive merge pending**: `donor-s-trust` vs
      `donorstrust` (same recipe as bhef/jff merges).

### C. The build (what "model lands" means)

- [x] ~~Ratify the edge shape~~ — SHIPPED 2026-07-27, with one deliberate
      deviation from the candidate shape: org→org edges live in the
      existing **`affiliations`** table (`edge_type: 'org_org'`,
      `rel: 'child_of' | 'peer'`, open-vocabulary `kind`, free-text
      `description`, `client_access`), not a new `org_relations` table.
      Per [[../plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags]].
- [x] ~~Capabilities~~ — `organization.relate / relations / unrelate /
      relation.update` + `organization.tag.add / tag.remove` live; proof
      script `scripts/prove-org-relations.mjs` 22/22 green.
- [x] ~~Surface~~ — Org Workbench card shows Part of / Contains / Peers
      with click-through navigation + a Tags row. (Corpus roll-up lenses
      deliberately deferred — named out-of-scope in the plan.)
- [x] ~~Triage integration~~ — aboutness routing landed as step 5b in the
      triage skill + didi's slabs; pilot untangle done (worklist A-1 above).

## Parked pending this issue

~~All three parked captures filed 2026-07-27~~ (event page, homepage, AND
the 2025 impact report) → `think-tanks/urban-institute/`, registered via
`organization.corpus.add`, reach-edu commit `30e0453`. Nothing remains
parked on this issue.

## See also

- [[../agent-skills/triage-inbox-w-suggestions/SKILL|triage-inbox-w-suggestions]] — open-decisions list links here; the triage lane that keeps hitting this.
- `clients/reach-edu/corpus/inbox/_triage-runs/2026-07-24_1.md` — the run manifest where the ruling was recorded.
