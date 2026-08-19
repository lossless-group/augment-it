---
title: "Augment from Affiliations — the first flow that starts from SurrealDB instead of a CSV, turning an event's speaker/org pairs into a rated, sourced prospect list"
lede: >-
  The first flow that starts in the canonical layer, not a CSV: export an event's affiliations, rate relevance offline, reimport.
date_created: 2026-07-07
date_modified: 2026-07-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.2.1.0
date_first_published: 2026-07-07
revisions:
  - "2026-07-08 — v0.2.1.0: MVP confirmed shipped and in active use (9 real FreedomFest 2026 affiliations rated, linked, and enriched end to end, plus the relevance-dropdown pre-select fix in `965173e`). Named the next desired features — see \"Next desired features\" below — deferred, not started."
  - "2026-07-07 — v0.2.0.0: reversed the v0.0.0.2 split, per direct operator feedback after using the shipped v0.1.0.0 screen. \"Two loops, two apps\" was the wrong shape — the operator wants ONE screen per affiliation that does what `record-db-resolver`/`person-db-resolver` already do for their entities: view the record and edit it in place, including adding canonical links and corpus content, not just reading a CSV-supplied rating. `affiliation-rating-resolver` now also carries interactive relevance editing plus person-side and org-side link/corpus add — the CSV round-trip stays (bulk-editing 61 rows in a spreadsheet is still genuinely faster than 61 clicks), but it's now a *pre-fill* for this screen, not the only way to set a rating. `person-enrichment` is no longer this flow's link/corpus surface."
  - "2026-07-07 — v0.1.0.0: shipped and live-tested against the real FreedomFest 2026 batch. Two real deviations from the v0.0.0.2 plan, both discovered during implementation, not guessed in advance — (1) the export is a NEW script (`export-affiliation-ratings-csv.mjs`), not an extension of `export-event-attendees-csv.mjs`, because that script is person-per-row while ratings need affiliation-per-row (a person with two orgs needs two independently-rateable rows) — extending it would have meant changing its shape for every other consumer of that roster; (2) `person-enrichment` needed more than the planned \"swap EVENT_SLUG for a picker\" — its worklist and attendee query were architecturally coupled to the Gatsby-invite person shape (a `!full_name` worklist gate, a fixed RSVP-predicate allowlist), which would have shown zero or silently-wrong results for FreedomFest's `person-db-resolver`-sourced, `.name`-only persons. Fixed properly: the worklist is now every attendee (not just unnamed ones), the attendee query drops the predicate allowlist entirely (any observation pointing at the event counts), and the UI falls back to `.name` for display when `.full_name` is absent. See \"What Shipped\" below for the full account."
  - "2026-07-07 — v0.0.0.2: split into a hybrid — relevance rating moves to a CSV export/reimport round-trip (bulk-editable, reuses Record Collector's existing upload path); links + corpus point at `person-enrichment`'s existing per-affiliation surface (de-hardcoded from one event) instead of a new worklist UI. Smaller build, more reuse, per operator direction."
  - "2026-07-07 — v0.0.0.1: initial draft — single new all-DB-native worklist app covering rating + links + corpus together."
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
site_uuid: 1117ba1f-c259-417d-b7fe-54d656c068eb
hex_code: 1et9b7
date_authored_initial_draft: 2026-07-08
date_authored_current_draft: 2026-07-08
publish: true
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

**One screen per affiliation** — `affiliation-rating-resolver` — that does
for an affiliation what `record-db-resolver` does for an org and
`person-db-resolver` does for a person: view the record, edit it in
place, one row at a time (or bulk-apply where that genuinely is faster).
Two ways in, one place to actually work:

### Getting a worklist: bulk-rate via CSV, or just start clicking

1. **(Optional, bulk-friendly) Export → edit offline → reimport.** Run
   `scripts/export-affiliation-ratings-csv.mjs` for the picked event — one
   row per `affiliations` edge (a person with two orgs gets two rows).
   Open it in a spreadsheet, fill in `relevance` (`Very Relevant` /
   `Highly Relevant` / `Relevant` / `Skip` / `Irrelevant` — see
   [Data Model Decisions](#data-model-decisions)) and `relevance_note` for
   as many rows as make sense in bulk — sort, filter, fill-down, whatever
   a spreadsheet is good at. Upload through Record Collector like any
   other CSV. This is a **pre-fill**, not the only way to set a rating —
   see below.
2. **Or skip the CSV entirely.** The worklist can also be an event picked
   directly (same event-tie-observation query the export script uses),
   with a Record Collector round-trip acting only as the current storage
   for "which affiliations am I working through," not as a gate on rating.

### The per-affiliation card

Each row shows the person and org together — name, role, and:

- **Relevance**, editable right on the card (a dropdown, not just a
  read-only echo of whatever the CSV said). If a CSV pre-filled it,
  that's the starting value; the operator can change it without touching
  a spreadsheet.
- **Person links** — existing ones listed, plus an add-a-link input
  (canonical link types, auto-detected from whatever URL is pasted —
  website, LinkedIn profile, X, blog, Substack, YouTube, etc.).
- **Person corpus** — existing entries listed, plus an add-a-URL input for
  content *about* the person (a press mention, an interview) rather than
  a canonical profile link.
- **Org links** and **Org corpus** — same two additive lists, for the
  organization side.

Save writes whichever fields changed on this row — a relevance change
alone, a link add alone, or several of these together in one pass.
Nothing here is a save-everything-at-once form; each add/edit commits
independently, same discipline as `person-db-resolver`'s "match a person,
independently match an org" split.

### person-enrichment is no longer this flow's link/corpus surface

The v0.0.0.2 draft routed link/corpus editing to `apps/person-enrichment`'s
existing `AffiliationCard` instead of building it here. Reversed per
direct operator feedback: bouncing to a second app to add a link when
you're already looking at the record is exactly the "two loops" friction
that made the split feel wrong in practice. `person-enrichment` keeps its
own reason to exist (sparse-person name/email triage for Gatsby-shaped
attendee data) — it just isn't the tool for augmenting an affiliation
that's already fully resolved.

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

### Links and corpus: new capabilities, existing fields

No new *fields* — this writes to the same `persons.personal_links` /
`persons.personal_corpus` and `organizations.org_links` /
`organizations.org_corpus` `person-enrichment` already uses, so any data
already captured there stays visible and isn't migrated or duplicated.

What v0.2.0.0 adds back (cut in v0.0.0.2, revived per the operator's
"I'm supposed to be able to add links" feedback): four narrow, properly
gated capabilities, each doing ONE additive write — not the full
`resolver.apply`/`person.apply` batch-from-a-CSV-row path, which assumes
a whole record being resolved, not one link being added to an
already-resolved entity:

| Capability | What it does |
|---|---|
| `person.links.add` | Append one link to `persons.personal_links`, reusing `resolver.ts`'s `shapeLink`/`inferLinkKind`. |
| `person.corpus.add` | Append one corpus entry to `persons.personal_corpus` via `content_items` (reuses `findOrCreateContent`). |
| `organization.links.add` | Append one link to `organizations.org_links`. |
| `organization.corpus.add` | Append one corpus entry to `organizations.org_corpus` via `content_items`. |

All four go through `CAPABILITY_TO_SUBJECT` in
`services/workspace/src/capabilities.ts`, same gating discipline as every
other write in this app — unlike `person-enrichment`'s direct-SurrealDB
path, which stays a known, pre-existing wart, now avoided rather than
extended.

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

**Export (still available, now optional):** `scripts/export-affiliation-ratings-csv.mjs`
(shipped in v0.1.0.0) — one row per affiliation edge, per event.

**The main surface:** `apps/affiliation-rating-resolver`
(`affiliationRatingResolver` in `shell/src/remotes.ts`), port `3012`, its
own "Rate Affiliations" entry in the shell's Flow picker
(`recordCollector` → `affiliationRatingResolver`). Shape-wise now closer
to `record-db-resolver`/`person-db-resolver` than the v0.1.0.0 cut —
per-row view **and** edit, not a pure write-pass over a spreadsheet.

Five capabilities in `services/record-surrealdb-resolver`, all registered
in `CAPABILITY_TO_SUBJECT` per the existing gating discipline:

| Capability | What it does |
|---|---|
| `affiliation.rate` | Given `(person_uuid, org_slug, relevance, relevance_note)`, look up the live `affiliations` edge fresh and set `relevance`/`relevance_note`/`relevance_rated_by`/`relevance_rated_at`. Throws if no matching edge exists. Shipped v0.1.0.0. |
| `person.links.add` | Append one link to `persons.personal_links`. New in v0.2.0.0. |
| `person.corpus.add` | Append one corpus entry to `persons.personal_corpus` via `content_items`. New in v0.2.0.0. |
| `organization.links.add` | Append one link to `organizations.org_links`. New in v0.2.0.0. |
| `organization.corpus.add` | Append one corpus entry to `organizations.org_corpus` via `content_items`. New in v0.2.0.0. |

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

## MVP achieved (2026-07-08)

The flow works end to end against real data: 9 FreedomFest 2026
affiliations rated, noted, and enriched with real canonical links and
corpus content, verified directly against SurrealDB. The v0.2.0.0
reversal (one screen, edit in place) is the shape that stuck; the
relevance-dropdown pre-select bug found immediately after (stored
snake_case value vs. Title Case `<option value>`) is fixed in `965173e`.
No open defects block using this for a second event.

## Next desired features (not yet scoped)

Named by the operator after using the MVP, deferred until there's a real
case pulling them forward — same manual-first-then-automate discipline as
the rest of this spec:

- **User visibility and control over creating and editing observations,
  in the same UI.** Today `affiliation-rating-resolver` edits the
  `affiliations` edge and the person/org link+corpus fields, but the
  underlying `observations` (the event-tie records the affiliation and
  the export query are built on) aren't visible or editable from this
  screen — same "bounce to a second surface" friction the v0.2.0.0
  reversal fixed for links and corpus.
- **Concurrent updates across persons, organizations, and observations.**
  Right now each add/edit commits independently per entity (person link,
  org link, rating), but there's no story yet for two operators editing
  overlapping affiliations at the same time, or for one save touching
  person + org + observation together as one coherent update.

## Out of scope for v0.2.0.0

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
- **Fixing `person-enrichment`'s direct-SurrealDB write path.** Still a
  known wart in that app, still pre-existing, still not this spec's
  problem now that this flow doesn't route through it at all.

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
