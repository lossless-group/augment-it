---
title: "Augment from Affiliations — the first flow that starts from SurrealDB instead of a CSV, turning an event's speaker/org pairs into a rated, sourced prospect list"
lede: "Every flow in augment-it so far starts with a CSV — upload, map columns, resolve. This one starts with data already in the canonical layer: pick an event, export every person↔org [[Client-Tagging-on-Canonical-Writes|affiliations]] edge tied to it as a CSV, rate relevance offline in a spreadsheet, reimport — while links and corpus content get added through the existing per-affiliation surface, not a new one. Building the sourced short-list a Reach.Edu team member needs to walk into FreedomFest 2026 and know who's worth a conversation."
date_created: 2026-07-07
date_modified: 2026-07-07
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.1.0.0
revisions:
  - 2026-07-07 — v0.1.0.0: shipped and live-tested against the real FreedomFest 2026 batch. Two real deviations from the v0.0.0.2 plan, both discovered during implementation, not guessed in advance — (1) the export is a NEW script (`export-affiliation-ratings-csv.mjs`), not an extension of `export-event-attendees-csv.mjs`, because that script is person-per-row while ratings need affiliation-per-row (a person with two orgs needs two independently-rateable rows) — extending it would have meant changing its shape for every other consumer of that roster; (2) `person-enrichment` needed more than the planned "swap EVENT_SLUG for a picker" — its worklist and attendee query were architecturally coupled to the Gatsby-invite person shape (a `!full_name` worklist gate, a fixed RSVP-predicate allowlist), which would have shown zero or silently-wrong results for FreedomFest's `person-db-resolver`-sourced, `.name`-only persons. Fixed properly: the worklist is now every attendee (not just unnamed ones), the attendee query drops the predicate allowlist entirely (any observation pointing at the event counts), and the UI falls back to `.name` for display when `.full_name` is absent. See "What Shipped" below for the full account.
  - 2026-07-07 — v0.0.0.2: split into a hybrid — relevance rating moves to a CSV export/reimport round-trip (bulk-editable, reuses Record Collector's existing upload path); links + corpus point at `person-enrichment`'s existing per-affiliation surface (de-hardcoded from one event) instead of a new worklist UI. Smaller build, more reuse, per operator direction.
  - 2026-07-07 — v0.0.0.1: initial draft — single new all-DB-native worklist app covering rating + links + corpus together.
status: Shipped
tags:
  - Spec
  - Augment-It
  - Affiliations
  - Canonical-Layer
  - Relevance-Rating
  - Person-Enrichment
  - Org-Resolution
  - CSV-Round-Trip
  - Reach-Edu
  - FreedomFest
---

# Augment from Affiliations

## Why this exists

The CEO of Reach.Edu is speaking at FreedomFest 2026. Between now and then,
someone on the team needs a working list: who else is speaking or attending
who's worth a conversation about philanthropic fundraising, what
organization connects them, and enough context on each to make the
approach make sense. The raw material already exists — 65 speakers
resolved into `persons`, their organizations resolved into `organizations`,
61 of them now `RELATE`d by an `affiliations` edge with a role — but
nothing rates who actually matters, and nothing packages that judgment
into something shareable.

Every prior augment-it flow (`record-db-resolver`, `person-db-resolver`,
[[Sparse-Person-Enrichment-Surface]]) starts from an uploaded CSV and
resolves it into the canonical layer. This is the first flow that runs the
other direction: the canonical layer already has the data, and the flow's
job is to **augment what's already there**, not resolve new records in.

**v0.0.0.2 revision:** the first draft designed one new worklist UI to
cover rating + links + corpus together. Reconsidered — those are two
different shapes of work, and forcing them into one surface meant building
more than either needed. Rating 61 rows is a bulk, spreadsheet-shaped task;
adding links and corpus content is a one-at-a-time, already-solved task.
Splitting them let most of this spec become "point at what already exists"
instead of "build a new app."

## User Flow

Two separate loops now, not one. Both operate on the same underlying data
(the affiliation edge and the person/org it connects), just through
different surfaces suited to the shape of each task.

### A. Rate relevance — export, edit offline, reimport

1. **Export.** Run the (extended) `scripts/export-event-attendees-csv.mjs`
   for the picked event — it already produces one row per attendee with
   their affiliation (org + role), links, and corpus URLs pulled straight
   from canonical. Add two columns: `relevance` (blank, or pre-filled if
   already rated) and `relevance_note` (blank). Add two more columns that
   exist for reimport, not for editing: `person_uuid` and `org_slug` — the
   pair that identifies exactly which `affiliations` edge a row belongs to.

2. **Edit offline.** The operator opens the CSV in whatever spreadsheet
   tool they already use. Sort, filter, fill down, work in whatever order
   makes sense, share the file with a colleague if a second opinion helps
   — none of that needs to be built, a spreadsheet already does it. Fill
   in `relevance` (one of `Very Relevant` / `Highly Relevant` / `Relevant`
   / `Skip` / `Irrelevant` — see [Data Model Decisions](#data-model-decisions)
   for what each means) and, ideally, `relevance_note` — the eventual
   export needs to say more than a label; "Whole Foods founder, active in
   liberty-movement philanthropy circles, worth a warm intro via X" is
   what actually helps the CEO walk into a conversation prepared. Leave a
   row blank to skip it entirely — that's different from rating it
   `Skip`, see below.

3. **Reimport.** Upload the edited CSV through the existing Record
   Collector path — same generic upload this app already has, no changes
   needed there (columns are always derived from headers, never
   predefined, per this app's standing convention). This creates a
   record-set like any other upload.

4. **Resolve.** A new small resolver step (`affiliation-rating-resolver`,
   details below) works through that record-set's rows: for each, look up
   the `affiliations` edge by `(person_uuid, org_slug)`, and if `relevance`
   is non-blank, write it via a new `affiliation.rate` capability. Same
   per-record-set **column mapping** step [[Sparse-Person-Enrichment-Surface]]'s
   sibling flows already use — the operator confirms once which columns
   are which, not re-typed per row. Rows with blank `relevance` are
   no-ops. Rows whose `relevance` value doesn't match one of the five
   allowed values are **flagged, not silently coerced or dropped** — same
   discipline as everything else touching this canonical layer.

### B. Add links and corpus content — the existing per-affiliation surface

`apps/person-enrichment`'s `AffiliationCard` already does this — an
operator working one affiliation at a time can add a link (website,
LinkedIn profile, LinkedIn company page, X, blog, Substack, YouTube, etc.
— auto-detected from whatever URL they paste) or a corpus entry (a press
mention, an interview, a bio page — content *about* the person or org,
not a canonical profile link) to the person side, the org side, or both.

The one real gap: `person-enrichment` currently hardcodes
`EVENT_SLUG = '2026-05-21-turning-jobs-into-degrees'`. Turning that into
the same event-picker described in step A.1 (a dropdown of `events` rows,
client-scoped) is the actual new work here — everything downstream of the
picker already exists and needs no changes.

### How the two loops relate

Independent and can happen in either order, on different days, by
different people. Rating doesn't need links/corpus to exist first, and
vice versa — the export in step A.1 shows whatever links/corpus already
exist at export time as read context, but doesn't require them.

## Data Model Decisions

### Relevance lives on the `affiliations` edge, not on the person or the org

Considered and rejected: a new table (the user's own first instinct was
"maybe like `opportunities`?"). Checked — `opportunities` is confirmed
org-only (no person field anywhere in its schema) and keyed 1:1 to a
`record_uuid` from a CSV-driven resolution, which this flow's *data*
doesn't have (only the *rating pass* now round-trips through a CSV — the
affiliation itself was resolved earlier, by `person-db-resolver`).
Bending `opportunities` to fit would mean stripping out the one thing
that makes it `opportunities` — not worth it for a rating.

Considered and rejected: a field directly on `persons` or `organizations`.
Both tables are multi-tenant (`client_access: string[]` — the same org row
can be visible to reach-edu *and* humain-vc). A single `relevance` field
on the row would leak one client's private prioritization to every other
client who can see that org, or get silently overwritten when two clients
rate the same row differently. Real correctness bug, not a hypothetical.

**Decision:** add `relevance: string | null` and `relevance_note: string |
null` directly to the `affiliations` `RELATE` edge, alongside the
`kind`/`client_access`/`added_at` fields it already carries
(`person-resolver.ts`'s `applyPersonAffiliation`, current shape). The edge
is already client-scoped, already uniquely identifies "this person, this
org, in this relationship," and is exactly what the CSV round-trip's
`(person_uuid, org_slug)` key resolves to. No new table, no leak risk.

Also add `relevance_rated_by` / `relevance_rated_at` — this app's standing
actor-attribution pattern (every mutation carries who did it) extends here
the same way it does everywhere else.

**The five values, precisely:** `Very Relevant` / `Highly Relevant` /
`Relevant` / `Skip` / `Irrelevant`. `Skip` is a genuine stored rating —
"reviewed, not worth pursuing *right now*, may revisit" — not the same
thing as a row the operator never got to (which stays blank/`null` and
remains open for a future pass). This distinction matters enough to say
twice: **leaving a CSV cell blank ≠ typing "Skip" into it.**

### Links and corpus need no new data model — and no new capabilities for v0

`person-enrichment` already writes `personal_links` / `personal_corpus`
onto `persons`, and `org_links` / `org_corpus` onto `organizations` (via
`appendOrgLink`/`appendOrgCorpus`/`appendPersonalLink`/`appendPersonalCorpus`
in its `App.svelte`). Reusing that surface as-is means this spec adds
zero new fields and zero new capabilities for the link/corpus half of the
flow.

**Known wart, explicitly not fixed here:** `person-enrichment` writes
directly to SurrealDB from the client, bypassing the NATS-capability
gating (`services/workspace/src/capabilities.ts`) every other write path
in this app goes through. That's pre-existing debt, not introduced by
this spec, and fixing it is a separate concern — noted so it's not
mistaken for an oversight.

### The CSV reimport key is `(person_uuid, org_slug)`, never a raw RecordId

Same lesson this codebase already learned twice (`source_uuid` in
`domains.ts`, `person_uuid` in `person-resolver.ts`): a SurrealDB
`RecordId` doesn't survive a round-trip through anything outside the
server — NATS, JSON, and now (more fragile than either) a CSV file a
human edits by hand in a spreadsheet, which can reformat or mangle text
in ways JSON never would. `person_uuid` and `org_slug` are both already
wire-safe, human-stable identifiers used elsewhere in this app. The
reimport resolver looks each affiliation up fresh by that pair; it never
trusts a RecordId string surviving the trip.

## Where it lives

**Export:** extend `scripts/export-event-attendees-csv.mjs` with the
`relevance`/`relevance_note`/`person_uuid`/`org_slug` columns described
above. Not a new script — this one already pulls affiliation + org + link
+ corpus data per event, per attendee.

**Reimport + resolve:** a new small remote,
`apps/affiliation-rating-resolver` (`affiliationRatingResolver` in
`shell/src/remotes.ts`), port `3012` — the first open gap in the port
sequence. Much smaller than the v0.0.0.1 draft's worklist app: no
match-or-create, no candidate search, just column-mapping (reusing the
established per-record-set mapping pattern) → row iteration → one
capability call per non-blank `relevance` row.

**Links/corpus:** no new app. `person-enrichment`'s `EVENT_SLUG` constant
becomes a picker — the smallest change in this spec.

One new capability, in `services/record-surrealdb-resolver/src/person-resolver.ts`,
registered in `CAPABILITY_TO_SUBJECT` per the existing gating discipline:

| Capability | What it does |
|---|---|
| `affiliation.rate` | Given `(person_uuid, org_slug, relevance, relevance_note)`, look up the live `affiliations` edge fresh and set `relevance`/`relevance_note`/`relevance_rated_by`/`relevance_rated_at`. Throws (surfaced to the operator, not silently dropped) if no matching edge exists. |

## Composes with

- [[Client-Tagging-on-Canonical-Writes]] — the export query and the new
  `relevance` fields respect `client_access` the same way every other
  canonical write does. See `surrealdb-canonical-layer` (lossless-skills)
  for the per-table shape reference.
- [[Sparse-Person-Enrichment-Surface]] — the per-record-set column-mapping
  pattern the reimport resolver reuses, and the event-scoped-worklist
  discipline the export step follows.
- `context-v/plans/Person-Aware-Canonical-Resolver-Extension.md` — the
  person/org/affiliation split this flow's data model builds directly on
  top of.
- `context-v/plans/SurrealDB-MCP-Plus-Skill-for-Canonical-Layer-Verification.md`
  — the verification pattern that surfaced, on 2026-07-07, that 61 of 65
  FreedomFest speakers now have exactly the affiliation edges this flow's
  export depends on.
- `scripts/export-event-attendees-csv.mjs`, `scripts/export-event-briefing.mjs`,
  and their sibling `export-branded-briefing.mjs` (markdown + brand config
  → branded HTML/PDF) — the export side of this spec extends the first;
  the eventual CEO-brief export (out of scope here) has a natural home in
  the third once rating data exists to feed it.

## Out of scope for v0.0.0.2

- **The CEO-brief export itself.** Real, wanted, explicitly deferred —
  once `relevance`/`relevance_note` exist on every affiliation, that
  export is a read-only view over data this spec already produces,
  plausibly built on `export-branded-briefing.mjs`'s existing
  markdown-plus-brand-config → HTML/PDF path. A much smaller spec to
  write later, with real data to design against instead of guesses.
- **Rating a person or org independent of a specific affiliation.**
  Someone might eventually want "this org is relevant regardless of which
  person," but nothing in the current use case asks for it, and it
  reopens the multi-tenant-leak problem the affiliation-scoped design
  avoids. Wait for a real case.
- **Bulk / automated relevance scoring.** An LLM could plausibly draft a
  first-pass rating from a person's headline + org + corpus content. Not
  this spec — manual-first, automate once the manual pattern is proven.
- **Multi-event exports.** One event at a time, same discipline
  [[Sparse-Person-Enrichment-Surface]] already settled on.
- **Fixing `person-enrichment`'s direct-SurrealDB write path.** Flagged
  above as a known wart. Pre-existing, not created by this spec, not
  blocking it.

## Open questions

- Should `relevance`'s five values also gate what shows up in a future
  export by default (e.g. blank and `Skip` excluded, `Relevant` and up
  included)? Reasonable default, not decided — the export spec's problem.
- `personal_links`/`personal_corpus` naming vs. `org_links`/`org_corpus` —
  still a live inconsistency, still not fixed here.
- Is a script + CSV-upload round-trip the permanent shape for the rating
  pass, or does it earn a proper in-app export/download button once the
  pattern proves out? Leaning toward "stays a script" per this app's
  manual-first-then-automate discipline, but not decided.

## See also

- [[Sparse-Person-Enrichment-Surface]] — column-mapping and event-scoping
  patterns reused here
- [[Client-Tagging-on-Canonical-Writes]] — multi-tenant discipline this
  spec's data-model decisions are built around
- `context-v/plans/Person-Aware-Canonical-Resolver-Extension.md` — the
  person/org/affiliation schema this flow is additive on top of
- `scripts/export-event-attendees-csv.mjs` — the export this spec extends
