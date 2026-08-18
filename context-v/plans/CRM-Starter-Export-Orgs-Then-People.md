---
title: "CRM Starter Export — the pipeline shape, enriched from the canonical layer: orgs first, then people attached"
lede: >-
  Two CSVs seed the empty CRM from the canonical layer: organizations first, people second, attached by a stable key. Corpora excluded.
date_created: 2026-07-27
date_modified: 2026-07-27
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
revisions:
  - "2026-07-27 — v0.0.0.2 — Open decision 1 SETTLED: the target is reach-edu's own self-hosted Twenty (deployed 2026-07-24, v2.24.1). Phase 3 rewritten for the API-batch path; target-instance block added."
tags:
  - Plan
  - Augment-It
  - CRM
  - Export
  - Canonical-Layer
  - Batch-Import
status: Draft
site_uuid: 123d8eb2-f02a-418b-977d-c7138cbd38e8
hex_code: vok1o2
date_authored_initial_draft: 2026-07-27
date_authored_current_draft: 2026-07-27
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

## Target instance (settled 2026-07-27)

**reach-edu's own self-hosted Twenty** — deployed 2026-07-24
(`twentycrm/twenty:v2.24.1`), healthy at
`https://twenty-server-production-7c98.up.railway.app`. Stack of record:
`self-host-stack/client-stacks/reach-edu/` (stack.md + twenty/). The
operator API key is already minted (2026-07-24) and lives as
`TWENTY_MCP_API_KEY` in `client-stacks/reach-edu/twenty/.env` — the
bearer-token channel that folder's `mcp-connector.md` designates as the
OPERATOR/SCRIPTING channel, i.e. exactly this import's lane. Operating
guide: the `twenty-interface` skill (written against palmer-ai's
instance; same self-describing REST + OpenAPI discipline, this
instance's URL).

> **Precondition found live (2026-07-27):** the stored key is EXPIRED —
> `GET /rest/companies` returns 401 "Token has expired". It was almost
> certainly a playground token (`type: PLAYGROUND`, 2h expiry — the trap
> the connector docs name). Before Phase 3's live run the operator mints
> a durable key in the reach-edu Twenty web app (**Settings → APIs**, not
> the playground) and replaces `TWENTY_MCP_API_KEY` in
> `client-stacks/reach-edu/twenty/.env`. The MCP connector wiring
> (Phase 4 of the stack plan) is NOT required for this import — the
> importer script talks REST with the bearer key directly. Phases 1–2
> need no key at all.

## Phase 3 — import via Twenty's REST batch API

CSV files remain the reviewable artifact (the operator eyeballs them
before anything writes); the import itself rides the API, driven by a
third script — `scripts/import-crm-starter-to-twenty.mjs` — with
`--dry-run` first, per the house import discipline
(idempotent + additive + dry-run-first).

1. **Custom fields first (one-time, via the metadata API):**
   `augmentItSlug` (TEXT) on companies, `augmentItPersonUuid` (TEXT) on
   people — the external-id landing spots. Twenty has no native
   external-id field; a custom field is the correct home, and its
   uniqueness is enforced by the importer's upsert logic.
2. **Companies:** batch create/upsert from `orgs.csv`. Field mapping —
   `name` → name, first domain → `domainName` (Twenty's natural company
   key), `linkedin` → linkedinLink, `x` → xLink, `external_id` →
   augmentItSlug; streams / other_links / tags / related_orgs /
   pipeline Notes → a formatted **note attached to the company**
   (Twenty notes attach to any record), keeping multi-valued data out of
   scalar fields. Pipeline Stage/Owner/commitments map to fields or
   opportunity records per the operator's Twenty workspace layout — a
   mapping table the dry-run prints for sign-off before the live run.
3. **People:** batch upsert from `people.csv` — name split, `emails`,
   linkedinLink, jobTitle ← role, `companyId` resolved by
   augmentItSlug lookup (fallback: company name), person_uuid →
   augmentItPersonUuid. `additional_orgs` + relevance → an attached
   note.
4. **Verify per the canonical-layer discipline, adapted:** counts match
   (rows exported == records created + skips explained), spot-check five
   companies for link fidelity, spot-check three multi-affiliation people
   attached to the right company, and re-run the importer on the same
   files — the external-id round-trip proof is that it updates, never
   duplicates.

Fallback path (no code): Twenty's in-app CSV importer consumes the same
two files; the custom fields from step 1 still come first so
external_id has somewhere to land.

## Open decisions (remaining)

1. ~~Which CRM~~ — SETTLED: reach-edu's self-hosted Twenty (above).
   One sub-question survives for the dry-run sign-off: do pipeline
   Stage/commitment columns land as company fields, or as Twenty
   **opportunity** records per company (Twenty's native pipeline
   object)? Recommendation: opportunities — that's what they are — but
   the operator rules at dry-run review.
2. ~~Org scope~~ — SETTLED (operator ruling 2026-07-27, overriding the
   plan's all-364 recommendation): **pipeline rows only**. The export is
   one row per PIPELINE row (96 — multi-deal orgs stay multi-row, exactly
   like the tracker), enrichment joined where a canonical org matched.
   Event-based org creations are kept in the DB but are noise for the
   CRM; the all-roster shape survives behind `--scope all`.
3. ~~Person floor~~ — SETTLED by the same ruling: people scope to the
   imported orgs (`--orgs-csv` filter; primary attach always an included
   org). The all-persons export remains available by omitting the flag.

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
