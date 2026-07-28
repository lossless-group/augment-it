---
title: "CRM Starter Export — the pipeline shape, enriched from the canonical layer: orgs first, then people attached"
lede: "Two CSVs that seed the new CRM from everything augment-it already knows: one row per organization carrying the Master Pipeline Tracker's columns plus identity links and pulse streams (never corpora), then one per person with the key that attaches them to the right org."
date_created: 2026-07-27
date_modified: 2026-07-27
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Plan
  - Augment-It
  - CRM
  - Export
  - Canonical-Layer
  - Batch-Import
status: Draft
---

# CRM Starter Export — orgs, then people

## Why care?

Months of capture work live in the canonical layer — 364 organizations
visible to reach-edu (255 with identity links, 67 with pulse streams),
417 persons, 378 person→org affiliations, plus the operator-maintained
Master Pipeline Tracker (96 rows, 36 columns). The new CRM starts empty.
This plan turns what we already know into its starter data: **batch-import
CSVs that replicate the pipeline export's shape and enrich it from the
canonical layer** — identity links and pulse streams included, corpora
deliberately excluded — in the only order batch insertion works:
**organizations first, people second, attached by a stable key.**

## Ground truth (verified 2026-07-27)

- **The pipeline shape to replicate:** record set
  `2026-06-10_Master-Pipeline-Tracker--Active-Pipeline_v10` (row-store,
  `rs_mq7k9jaw_wsjkfl`). 24 human columns (Prospect/Organization, Type,
  Owner, Stage, Total Commitment, FY26/FY27 revenue + weighted, Last
  Contact, Notes/Context, Next Step block, event/RSVP, staleness autos) +
  12 augmentation columns — including **`corpus_funder_slug`** and
  **`record_uuid`**, which make the pipeline↔canonical join mostly exact,
  not fuzzy.
- **Canonical org fields available:** slug, complete/conventional names,
  `aliases[]`, `domains[]`, `org_links[]` (19 kinds in live use —
  website, linkedin_company, x_profile, facebook/instagram/bluesky,
  youtube, wikipedia, substack, team_page, …), `media_streams[]`
  (name/url/kind), per-client `tags` (24 org tag observations so far),
  and the new org↔org relations (parent/child/peer + kind + description).
- **Canonical person fields:** person_uuid, name (+ first/surname where
  captured), email, linkedin_profile_url, headline, `personal_links[]`;
  affiliation edges carry role (`kind`) and operator-rated `relevance`.
- **House precedent:** `scripts/export-affiliation-ratings-csv.mjs` /
  `export-event-attendees-csv.mjs` — direct-SurrealDB export scripts,
  arg-parsed, writing under `clients/<client>/outputs/<dated-dir>/`. The
  affiliation export's header comment also settles a design question
  below (per-edge vs per-person rows) — and this plan deliberately
  inverts it for CRM contacts.

## The two invariants

1. **External IDs ride every row.** Orgs export `external_id = slug`;
   people export `external_id = person_uuid` and `org_external_id = slug`.
   Whatever the CRM is, these columns land in it (native external-id field
   or a custom field) — they are what makes the people-attach step exact,
   re-imports idempotent, and any future sync possible. Without them the
   CRM join degrades to name-matching forever.
2. **No corpora.** `org_corpus` / `personal_corpus` stay home. The CRM
   gets identity and pulse surface; the corpus stays augment-it's.

## Phase 1 — `scripts/export-crm-orgs-csv.mjs`

One row per organization with `client_access CONTAINS <client>`.

**Scope (recommendation: everything, filter in the sheet).** Export all
364 and include classification columns — `bucket` (derived from the
org's disk folder under `corpus/`: funders / gov-entities / think-tanks /
associations-networks / academic-institutions / data-services, else
blank) and `tags` (the per-client has_tag values). The operator filters
rows in the spreadsheet before import; the script doesn't guess which
orgs the CRM deserves. (Redundancy-over-normalization + operator-drives.)

**Column groups, in order:**

| Group | Columns |
|---|---|
| Identity | `external_id` (slug), `name` (complete ?? conventional ?? slug), `conventional_name`, `aliases` (pipe-joined), `domains` (pipe-joined), `bucket`, `tags` (pipe-joined) |
| Identity links (flattened by kind) | `website`, `linkedin`, `x`, `facebook`, `instagram`, `youtube`, `wikipedia`, `bluesky`, `substack`, `team_page` — first URL of each kind; everything else (about, org_profile, publication, …) into `other_links` (newline-joined `kind: url`) |
| Pulse streams | `streams` (newline-joined `name — url (kind)`), `stream_count` — streams are multi-valued by nature; they land in one long-text column the CRM stores as a note/custom field, not N columns that cap the list |
| Relations | `related_orgs` (newline-joined `rel: slug (kind)` from `organization.relations` semantics) — the family tree survives the export even if the CRM can't model it yet |
| Pipeline (the replicated columns) | The v10 human columns as-is: `Type, Owner, Stage, Total Commitment ($), FY26/FY27 Revenue, Probability, Weighted FY26/FY27, Last Contact/Update, Notes/Context, Next Step, Next Step Due/Owner/Status, Upcoming Event, RSVP Status` — filled only on rows the join matched; blank for captured-but-not-in-pipeline orgs |
| Provenance | `pipeline_matched` (exact / fuzzy / none), `exported_at` |

**The pipeline join, exact-first:**

1. Exact: pipeline row's `corpus_funder_slug` == org slug (the promotion
   path already stamped it).
2. Alias: pipeline `Prospect / Organization` name (stripped of
   parentheticals) matched against slug + aliases, lowercased — same
   matching family as `searchOrgs`.
3. Anything still unmatched on either side is REPORTED, not dropped: the
   script prints unmatched pipeline rows (they may name orgs never
   captured — themselves a to-capture list) and marks fuzzy matches in
   `pipeline_matched` for operator review. Human-in-drivers-seat: fuzzy
   rows get eyeballed in the sheet, not auto-trusted.

**Output:** `clients/<client>/outputs/<date>_crm-starter/orgs.csv` (+ an
`unmatched-pipeline-rows.csv` sidecar when any exist).

## Phase 2 — `scripts/export-crm-people-csv.mjs`

**One row per PERSON, not per affiliation edge** — the deliberate
inversion of the ratings export's per-edge shape. CRM contact importers
want one contact row; a person with two affiliations must not become two
CRM contacts. The strongest edge (relevance-ranked, the same ordering
`listOrgAffiliations` uses) supplies the org attach; the rest ride along
in a spillover column.

| Group | Columns |
|---|---|
| Identity | `external_id` (person_uuid), `name`, `first_name`, `surname`, `email`, `linkedin` (linkedin_profile_url ?? first linkedin link), `headline` |
| Org attach | `org_external_id` (slug of the strongest affiliation), `org_name`, `role` (edge kind), `relevance`, `additional_orgs` (newline-joined `slug — role` for edges 2..n) |
| Links | `other_links` (newline-joined non-LinkedIn personal_links) |
| Provenance | `exported_at` |

Persons with **zero** affiliations still export (org columns blank) — the
CRM decides whether orphan contacts import; we don't silently drop 39
people (417 persons vs 378 edges).

## Phase 3 — import order + verification

1. Import `orgs.csv`. Map `external_id` to the CRM's external-id or a
   custom field — this is the one non-negotiable mapping.
2. Import `people.csv`, attaching company by `org_external_id` (CRMs that
   only match companies by name fall back to `org_name` — which is why
   both columns exist).
3. **Verify per the canonical-layer discipline, adapted:** counts match
   (rows exported == records created + skips explained), spot-check five
   orgs for link fidelity, spot-check three multi-affiliation people
   attached to the right org, and confirm a re-import of the same file
   updates rather than duplicates (the external-id round-trip proof).

## Open decisions (settle before Phase 3; Phases 1–2 are CRM-agnostic)

1. **Which CRM, and CSV-importer vs API batch?** The CSVs serve either
   path. If the target is a Twenty instance, the house already has the
   `twenty-interface` skill + MCP (`create_many_companies`,
   `upsert_many_people` with company attach) and an API batch beats the
   CSV importer; if it's something else, its importer's field-mapping
   screen consumes these files as-is. Naming the CRM also settles where
   `external_id` lands (native field vs custom).
2. **Org scope confirmation** — recommendation above is all-364 +
   filter-in-sheet; alternative is pre-filtering to `funders/` bucket
   (+ pipeline matches) if the CRM should only ever see funders.
3. **Person floor** — export all 417, or only persons with a rated
   edge (`relevance` set)? Recommendation: all, with `relevance` as a
   sheet-filterable column.

## Out of scope

- Any corpus content (invariant 2).
- Ongoing sync (this is the STARTER export; a standing augment-it ↔ CRM
  sync is its own future spec — the external-id columns are what keep
  that door open).
- Capturing pipeline orgs that were never minted as canonical orgs — the
  unmatched sidecar surfaces them; minting is triage/workbench work.

## Close-out checklist

- [ ] Phase 1 script + run: `orgs.csv` eyeballed by operator, fuzzy
      matches reviewed, unmatched sidecar triaged
- [ ] Phase 2 script + run: `people.csv` eyeballed
- [ ] Open decision 1 settled; Phase 3 import run + verification
- [ ] Changelog entry; gh issues per the loop if run as a feature loop

## Related

- [[Org-Relations-Parent-Child-Peer-Plus-Org-Tags]] — tags + relations
  columns this export carries
- `scripts/export-affiliation-ratings-csv.mjs` — the export-script
  conventions (and the per-edge shape Phase 2 deliberately inverts)
- [[../specs/Workspaces-as-Tenant-Primitive]] — why every read here is
  client-scoped
