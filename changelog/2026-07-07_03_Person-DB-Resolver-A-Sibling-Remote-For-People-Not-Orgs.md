---
date_created: 2026-07-07
date_modified: 2026-07-07
title: "Person DB Resolver — a sibling remote for people, not a mode inside the org resolver"
lede: "record-db-resolver only ever knew organizations — feeding it a CSV of FreedomFest speakers wrote a person into the organizations table and minted a nonsense opportunity. The fix is a new remote, person-db-resolver: match-or-create a person, then independently match-or-create their org and RELATE the affiliation with a role. Person and org are separate decisions the operator can make in either order, together or alone — not a coupled 1:1."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/person-resolver.ts
  - services/record-surrealdb-resolver/src/person-handlers.ts
  - services/record-surrealdb-resolver/src/server.ts
  - services/workspace/src/capabilities.ts
  - apps/person-db-resolver/
  - apps/record-db-resolver/src/App.svelte
  - apps/record-db-resolver/src/app.css
  - apps/record-db-resolver/src/components/RecordCard.svelte
  - apps/record-collector/src/App.svelte
  - shell/rsbuild.config.ts
  - shell/src/remotes.ts
  - shell/src/flows.svelte.ts
  - context-v/plans/Person-Aware-Canonical-Resolver-Extension.md
tags:
  - Progress-Update
  - Record-DB-Resolver
  - Person-DB-Resolver
  - Canonical-Layer
  - Persons
  - Organizations
  - Affiliations
  - Observations
  - Reach-Edu
  - FreedomFest
  - Architecture
---

## Why Care?

Running the FreedomFest 2026 speaker CSV through `record-db-resolver` —
built to be the generic "reconcile a record to a canonical org" bridge —
surfaced that "generic" was never true. It matched "Lyn Ulbricht" as a
fuzzy organization name, and clicking "create new org from this record"
on Ethan Akimoto actually created an `organizations` row named
`ethan-akimoto` plus an opportunity, both of which had to be deleted from
SurrealDB Cloud by hand. Two disconnected systems already wrote to the
canonical layer — the shell-reachable `resolver.*` capabilities (org-only)
and standalone CLI scripts (`surreal-write-persons.mjs`,
`surreal-write-event-attendees.mjs` — person-aware, but unreachable from
any UI) — and neither was both person-aware and shell-reachable.

## What's New?

- **`person-resolver.ts`** (new, sibling to `resolver.ts`) — `person.candidates`
  (match by `linkedin_profile_url` first, else fuzzy name + org-in-headline
  boost), `person.apply` (create/match, idempotent, backfills a
  `person_uuid` on pre-existing rows from before this capability existed),
  `person.affiliate` (resolve the org — reusing `resolver.ts`'s
  match/create logic via a newly-extracted `resolveOrgRow` helper, not
  reimplemented — then `RELATE` the affiliation with a role and write the
  observations), and `person.add_observation` (a free-form manual
  observation on top of whatever got auto-derived).
- **RecordId round-trips fixed the way `domains.ts` already learned this
  lesson once** (`source_uuid` cast to string) — every id that crosses the
  NATS/WS wire and comes back in a later call is a plain `person_uuid`
  string, re-looked-up fresh inside the query that needs a real RecordId.
  The very first version of this shipped without that and failed
  `person.affiliate` with a `RELATE` type error on the first live test.
- **Person and org are independent, not sequential** — the actual design
  point, and the first shipped version got it wrong: the org section was
  gated behind `personResult`, contradicting the "mutually independent OR
  interdependent, operator's choice" decision from earlier in the
  conversation. Fixed: `person.affiliate`'s `person_uuid` is now optional
  — org-only resolution (no person, no affiliation edge) is a first-class
  outcome, and if a person happens to already be resolved on the same row,
  the affiliation gets RELATEd in the same call.
- **`apps/person-db-resolver`** (new remote, port 3010) — same record-set
  picker / back-skip-next chrome as `record-db-resolver`, but: a
  **column-mapping step** asked once per record set (which column is the
  name? org? role? LinkedIn URL? observation?), persisted and silently
  reused — the direct fix for `record-db-resolver`'s bug of hardcoding
  five Master Pipeline Tracker column names and dropping everything else
  a differently-shaped CSV carried. Then: person candidates
  (match/create/skip — skip is expected, not a failure), independently an
  org name input + candidates (match/create), and a manual
  predicate/value observation form.
- **`record-db-resolver` also got two fixes** discovered along the way:
  `RecordCard` now shows every raw CSV column, not just the
  org-normalized subset; and it was missing the `active-record-set-changed`
  listener `pack-runner` already had, so a click from Record Collector on
  an already-mounted resolver landed on an empty "pick a record set"
  picker instead of the uploaded set.
- **`record-collector`** gained a second button — "Resolve Orgs to
  Canonical DB" (renamed from the single "Resolve to Canonical DB") next
  to a new "Resolve People to Canonical DB", and a new **"Augment a CSV of
  People"** flow (`PEOPLE_ROTATION`: recordCollector → personDbResolver),
  sibling to the org-shaped "Augment a CSV of Event Attendees."

## Also included

- `context-v/plans/Person-Aware-Canonical-Resolver-Extension.md` — the
  design doc this was built from, including the two decisions made
  mid-build (separate remote, not a mode; per-record-set column mapping)
  and the open question this leaves: an org resolved before its person is
  resolved doesn't retroactively RELATE if the person gets resolved
  afterward on the same row — resolve person first for the automatic
  link, or re-run the org step after, until that's worth closing.
- Both new backend capabilities were smoke-tested end to end against real
  FreedomFest data (Ethan Akimoto → person created, Carl Menger Institute
  matched/created, affiliation + observations written, idempotent on
  re-apply) before any UI was built around them.
