---
title: "Person-aware canonical resolver — closing the gap between the proven scripts and the shell-reachable capability"
lede: >-
  The resolver only knows organizations; every person and affiliation ever written came from CLI scripts no UI can reach.
date_created: 2026-07-07
date_modified: 2026-07-07
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.0.0.2
revisions:
  - "2026-07-07 — Resolved §3/§4: separate person-db-resolver remote (not a mode-toggle), per-record-set column mapping. Prompted by a live test writing a bad organizations row + opportunity from a person record; both deleted from SurrealDB Cloud after the fact."
  - 2026-07-07 — Initial draft.
status: Implementing
tags:
  - Plan
  - Augment-It
  - Record-DB-Resolver
  - Canonical-Layer
  - Persons
  - Organizations
  - Affiliations
  - Observations
  - Person-Enrichment
  - Reach-Edu
  - FreedomFest
site_uuid: 95576280-9904-4a96-89ca-c12123d8485d
hex_code: ptkmv1
date_authored_initial_draft: 2026-07-07
date_authored_current_draft: 2026-07-07
---

# Person-aware canonical resolver

## Why this exists

Working through a real task — turning FreedomFest 2026's speaker/sponsor/
exhibitor lists into reach-edu's canonical layer — surfaced a gap that
would have blocked every future event the same way: **two disconnected
systems already do "write to the canonical layer," and neither is both
person-aware and shell-reachable.**

- `services/record-surrealdb-resolver/src/resolver.ts` — the capability
  the shell (`recordDbResolver`, part of both the `csvAugmentation` and
  `eventAttendees` flows) actually calls. Every exported function
  (`findCandidates`, `searchOrgs`, `applyResolution`, `updateOrg`,
  `opportunitiesForOrg`) assumes the record is an **organization**.
  `NormRecord`, its generic input shape, has no entity-type field at all.
  It writes directly to `organizations`' own denormalized array fields
  (`org_links`, `org_corpus`, `media_streams`) and never touches
  `observations`.
- `scripts/surreal-write-persons.mjs` / `surreal-write-event.mjs` /
  `surreal-write-event-attendees.mjs` — the scripts that actually
  produced every `persons` row, every `events` row, and every
  `observations` row that exists today (177 reach-edu persons from
  Turning-Jobs-into-Degrees, 882 humain-vc persons from the LinkedIn-
  network walk). Proven, idempotent, correctly writes `has_email`, a
  funnel/event-tie observation, and `affiliated_with`. **CLI-only** —
  nothing in the shell, Pack Runner, or (eventually) Didi Chat can invoke
  this path.

Result: the "Augment a CSV of Event Attendees" flow shipped 2026-07-07
works correctly for an orgs CSV (sponsors, exhibitors) and would be
**wrong** for a people CSV (speakers) — it would try to create an
organization named "Ethan Akimoto." This plan closes that gap.

## What's already proven and stays as-is

Per [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] (confirmed live,
2026-07-07):

- `persons`, `organizations` — SCHEMALESS, slug-as-join-key discipline.
  Organizations carry `complete_name` + `conventional_name` + `slug`
  (formal name vs. the shorthand people actually say).
- `affiliations` — a real SurrealDB `RELATE` edge, `persons ↔
  organizations`, carrying whatever shape the source has (title, dates,
  `kind`). **This edge IS the "role" relationship** — no new table needed.
- `observations` — a subject/predicate/object log (`{subject, predicate,
  object, source, observed_at, client}`), append-only, the audit trail
  behind every materialized/denormalized field. Predicates already in use:
  `has_email`, `located_in`, `visited_event_page`, `affiliated_with`.
  New event-relationship predicates are just new predicate strings — the
  table is schemaless, nothing to migrate.
- `events` — one row per event (`slug`, `name`, `client`, `client_access`,
  `source`, `source_url`, `starts_at`/`ends_at`, `total_attendees`).

None of this needs to change. The gap is entirely that `resolver.ts`
doesn't write any of it for persons.

## The design decision this plan is built around

Surfaced mid-conversation, worth recording explicitly: **person-creation
and org-creation are independent decisions, not a coupled 1:1.** Per row:

- **Organization**: create/match with a low bar. Orgs are durable, reused
  across future events, and the `affiliations` edge carries the useful
  signal (reach-edu now knows "Foundation for Harmony and Prosperity
  exists and is active in this space") even when the specific person who
  surfaced it isn't independently worth tracking.
- **Person**: needs a real bar. Being named as a speaker/sponsor-contact
  once, with no bio, no LinkedIn, no org, isn't enough — `skip` is a
  first-class, expected outcome, not a failure (this is exactly what
  [[Sparse-Person-Enrichment-Surface]] already designed: "Match / Create /
  Skip," never forced).

At FreedomFest's scale (200 speakers), full manual per-row triage isn't
realistic. The resolver extension should support a **bulk pre-filter**:
auto-skip persons below a minimal signal threshold (no org AND no
LinkedIn AND no bio-worthy title), auto-queue everyone else for a fast
per-row confirm rather than a full research pass per person.

## What to build

### 1. Person-matching + person-apply in `resolver.ts`

Mirror the existing org path, not invent a new shape:

- `findPersonCandidates(db, args)` — match by `linkedin_profile_url` if
  present (unique join key, per the persons index already defined in
  `surreal-write-persons.mjs`), else by name + org (fuzzy, low-confidence
  — the existing org search's fuzzy-name pass is the template).
- `applyPersonResolution(db, input)` — CREATE-or-MERGE the `persons` row
  (same idempotent shape as `surreal-write-persons.mjs`: `client_access`
  union, `first_touched_by`/`last_touched_by`/`last_seen_at`), then:
  - `RELATE persons:X->affiliations->organizations:Y SET kind = $role`
    (the role/title from the source data — "Executive Director," etc.)
    if an org was resolved for this row.
  - `CREATE observations` for whatever facts the row actually carries
    (`has_name` always; `has_linkedin_url` if present; the event-tie
    predicate — see below).
- Both functions take an explicit `entity_type: 'person' | 'organization'`
  discriminator somewhere in the call (capability name, or an arg) —
  the shell/CSV-ingest side must declare which one it's feeding, not
  auto-detect. A CSV of speakers is people; a CSV of sponsors is orgs.
  No column-sniffing.

### 2. Event-tie observations, generalized

`surreal-write-event-attendees.mjs`'s funnel-predicate pattern
(`rsvp_event` text → `invited_to` / `visited_event_page` / `email_bounced`)
generalizes cleanly to the `observation` column already added to the
FreedomFest CSVs (`"Speaker at FreedomFest 2026"`, `"Sponsor at
FreedomFest 2026"`, `"Exhibitor at FreedomFest 2026"`): parse the leading
word into a predicate (`speaker_at`, `sponsor_of`, `exhibitor_at`), the
trailing event name into a lookup against `events.name`/`events.slug`
(creating the `events:freedomfest-2026` row once, up front, the same way
`surreal-write-event.mjs` already does it for Turning-Jobs).

### 3. Reachability — a separate remote, not a mode inside record-db-resolver

Decided 2026-07-07, after live-testing `record-db-resolver` against the
FreedomFest speakers CSV surfaced the problem concretely (matching "Lyn
Ulbricht" as a fuzzy org name; "create new org from this record" on
"Ethan Akimoto" actually wrote an `organizations` row named after a
person, plus a nonsense opportunity — both had to be deleted from
SurrealDB Cloud after the fact). Two options were on the table:

- A mode-toggle inside `record-db-resolver` (one component, branches on
  entity type).
- A **new sibling remote**, `person-db-resolver` — its own app, own
  candidate-matching UI, own write path.

Going with the second. This app is already built as a set of small,
single-focus remotes (`recordCollector`, `packRunner`,
`responseReviewer` each do one job) rather than components that branch
on mode — a person resolver has a genuinely different candidate display,
a different write target (`persons` + `affiliations` + `observations`,
no `organizations`), and no "opportunity" concept at all. Branching one
component on entity type would fight the grain of how this codebase is
already organized, not simplify it.

`apps/person-db-resolver` — new remote, modeled on
`apps/record-db-resolver`'s structure (same record-set picker, same
back/skip/next chrome) but: match-or-create a **person** (by
`linkedin_profile_url` if present, else fuzzy name+org), match-or-create
their **org** (reuses the existing org search/create path — no need to
reinvent it), `RELATE` the `affiliations` edge with the role/title, and
write the observations (event-tie + `affiliated_with`). No opportunity
step.

Finishing `apps/person-enrichment` (the original spec's own UI) and a
Pack Runner pack for the ambiguous-middle-tier search (LinkedIn +
employer-team-page via SearXNG, per the operator's own framing) remain
open, later options — not part of this first build.

### 4. Column mapping — per-record-set, asked once, remembered

The other concrete failure mode this surfaced: `record-db-resolver`'s
`normalizeRecord()` only recognizes five hardcoded column names
(`Prospect / Organization`, `Company`, `url`, `socials`,
`official_updates_index_url`) — a CSV shaped any other way (the
FreedomFest speakers CSV: `name, org, title, sched_profile_url,
event_source_url, observation, org_confidence`) silently loses every
column that doesn't match. This is the same "dynamic schema" violation
[[feedback_augment_it_dynamic_schema]] already flags elsewhere — columns
must be derived per-upload, never assumed.

`person-db-resolver`'s fix: a lightweight mapping step, asked once per
record set (not per row, not per session) — "which column is the
person's name? their org? their LinkedIn URL? their title?" — persisted
against `record_set_id` (localStorage is enough; no backend schema
change needed) so it's asked exactly once and then silently reused for
every row in that set. Full manual mapping on every upload would be more
friction than warranted given most CSVs feeding this app come from
`crawl-fetch-ingest`-style generation with fairly consistent column
names — the mapping step is a fallback for when the guess is wrong, not
a mandatory gate every time.

## First real test case

The three CSVs already sitting in
`clients/reach-edu/inputs/events/freedomfest/`:

- `2026-07-08_freedomfest-2026-speakers.csv` (200 rows — people)
- `2026-07-08_freedomfest-2026-sponsors.csv` (138 rows — orgs)
- `2026-07-08_freedomfest-2026-exhibitors.csv` (9 rows — orgs)

Sponsors + exhibitors can run through the EXISTING org-only
`recordDbResolver` today (`eventAttendees` flow, `recordCollector →
recordDbResolver`) with no changes — they're already org-shaped. Speakers
need step 1 above before they can run through anything without corrupting
the `organizations` table with person names.

## Open questions

- Should the bulk pre-filter's skip-threshold be a fixed rule (no org AND
  no LinkedIn AND thin title) or itself operator-tunable per event?
  Lean: fixed rule for v1, revisit if FreedomFest's results feel wrong.
- Does `entity_type` belong on the capability name (`person.resolve.candidates`
  vs `resolver.candidates`) or as an arg on the existing capability?
  Lean: separate capability names — mirrors `domain.create` vs
  `source.add` being distinct verbs rather than one verb with a type flag,
  consistent with the rest of this codebase's capability-naming style.
- ~~Pack Runner vs. person-enrichment vs. capability-only for
  reachability~~ — resolved 2026-07-07: separate `person-db-resolver`
  remote (§3).

## See also

- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the schema this plan
  writes into; nothing here changes it.
- [[../specs/Record-DB-Resolver]] — the existing org-only spec this plan
  extends rather than replaces.
- [[../specs/Sparse-Person-Enrichment-Surface]] — the match/create/skip
  discipline this plan's person-side logic follows; the UI this plan's
  §3 third option would finally wire up.
- `scripts/surreal-write-persons.mjs`, `surreal-write-event.mjs`,
  `surreal-write-event-attendees.mjs` — the proven reference
  implementation `resolver.ts`'s new person path should behave
  identically to.
- [[Build-Order-Humain-VC-Unlock-Flow]] — a sibling client's build order;
  not directly related, but the "no fabrication, confidence field, CP-gate
  before paid/write actions" discipline threaded through both is the same
  house style.
- 2026-07-07 session — the FreedomFest 2026 speaker/sponsor/exhibitor
  crawl (via three parallel agents applying the `crawl-fetch-ingest`
  skill's philosophy to an event-anchored case) is what surfaced this gap;
  see `clients/reach-edu/inputs/events/freedomfest/` for the output.
