---
title: "Issue: Person · DB Resolver UI needs to accommodate multiple organizations per person"
lede: "Stub — the per-row org section in apps/person-db-resolver only resolves ONE org affiliation per row (one org-name column, one role column, one match/create action). Real bios routinely name several current and past affiliations for the same person; the UI has no way to add a second, third, or Nth org against an already-resolved person without re-running the whole row."
date_created: 2026-07-17
date_modified: 2026-07-17
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.0.0.1
status: Open · Stub
tags:
  - Issue
  - Augment-It
  - Person-DB-Resolver
  - Canonical-Entity-Registry
  - Affiliations
  - SurrealDB
---

# Issue: Person · DB Resolver UI needs to accommodate multiple organizations per person

## Why this exists

Surfaced while running the Aspen Institute Summer Socrates Seminars attendee
CSV through `apps/person-db-resolver`. Lincoln Ellis's row alone named two
orgs in a single `Organization` cell ("Ahakista Capital, Eurasia Group") with
two different roles ("Founder & Partner" at one, "Senior Advisor" at the
other) — and his bio names a third, earlier affiliation (Northern Trust) and
a fourth (Morgan Stanley). This is not an edge case for this event's
attendee list — bios in general routinely describe several current and past
organizational relationships for one person.

The current `apps/person-db-resolver` org section
(`App.svelte`'s `pdr-org-section`) assumes exactly one org per row: one
mapped `org` column, one mapped `role` column, one `person.affiliate` call.
There's no affordance to:

- resolve a second (or third, or Nth) org against the same already-resolved
  person, in the same pass through the row
- distinguish a current affiliation from a past one when both come from the
  same bio text
- split a comma-joined `Organization` cell like Lincoln Ellis's into
  separate org-resolution actions

## What's already true (context, not yet a design)

- `affiliations` is a real `RELATE` edge, `person->affiliations->organization`
  — nothing in the data model prevents multiple edges from the same person to
  different orgs (or even the same org across different eras, per
  [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]]'s finding
  that the *original* plan called for one edge per experience/role entry).
  The gap is entirely in the UI/capability-call layer, not the schema.
- `person.affiliate` (`services/record-surrealdb-resolver/src/person-resolver.ts`)
  already takes a single `{person_uuid, org_action, org_slug/org_name, role,
  client}` call and is independent of `person.apply` — nothing stops calling
  it more than once per row for the same person_uuid against different orgs.
  The missing piece is purely: a UI loop that lets the operator repeat the
  org-resolution step against the same person without re-navigating the row.
- Related, not the same problem: [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]]
  already opened the question of role/title *history* at a single org
  (the "three roles at one company" case) via a proposed `related_org`-scoped
  observation stream. Multiple *simultaneous or sequential different orgs*
  is a related but distinct gap — that issue is about one edge changing over
  time, this one is about needing several edges at all.

## Not yet decided

- Does the CSV column mapping need to support a delimiter-split `Organization`
  cell (e.g. split on `,` / `;`), or does the operator manually add
  additional orgs one at a time via a repeatable UI action regardless of
  how the source cell was shaped?
- Should bio text ever be parsed for additional org mentions
  (NER-style extraction), or is that out of scope — operator reads the bio,
  manually adds each org they judge worth capturing?
- How does the UI represent "these are current" vs "these are past" when
  both come out of the same free-text bio, given `affiliations` doesn't yet
  have a first-class current/past flag?

## Path forward

Not scoped yet — this is a stub to hold the problem, not a plan. Next step
is a proper design pass (probably its own plan doc) once there's room to
think about the UI shape (repeatable "add another org" action in the
existing org section?) and how it composes with the role-history question
already open in the sibling issue.

## Cross-references

- [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]] — the
  session this surfaced in; role/title-history-at-one-org is the sibling
  open question
- `apps/person-db-resolver/src/App.svelte` — the `pdr-org-section`, current
  one-org-per-row UI
- `services/record-surrealdb-resolver/src/person-resolver.ts` —
  `applyPersonAffiliation` (`person.affiliate`), already callable more than
  once per person, just never exposed that way in the UI
