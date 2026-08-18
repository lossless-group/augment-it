---
title: "Plan stub: ingest the next reach-edu event CSV into the canonical layer"
lede: "The mechanism already exists and is proven twice over (turning-jobs, FreedomFest) — this is the sequence to run the moment the next event CSV lands, so it's 'follow the stub' instead of 're-derive the pipeline.'"
date_created: 2026-07-17
date_modified: 2026-07-17
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Plan
  - Stub
  - Augment-It
  - reach-edu
  - SurrealDB
  - Person-Org-Resolver
site_uuid: 9ab8a5d8-903e-4a27-bd81-21af9ebf88b9
hex_code: lef3yg
date_authored_initial_draft: 2026-07-17
date_authored_current_draft: 2026-07-17
---

# Plan stub: ingest the next reach-edu event CSV into the canonical layer

> Spun off from [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]] once that issue confirmed the pipeline itself is solid — this doc is deliberately a stub. The target event/CSV isn't in the repo yet, so the specifics below (Section "Fill in once the CSV is at hand") are placeholders. The sequence is not a placeholder — it's proven against two real events already.

## Why this exists

Two events have already gone through this pipeline end to end (turning-jobs-into-degrees: 177 attendees, 146 live `affiliations` edges as of this writing; FreedomFest 2026: speakers/sponsors/exhibitors, 61 rated affiliations). Nothing new needs to be built for a third event of the same shape — this stub exists so the next run is a checklist, not an investigation.

## The sequence

1. **Land the raw CSV** under `clients/reach-edu/inputs/events/<event-slug>/` (matches the `freedomfest/` precedent).

2. **Decide the CSV's shape** — this picks the Flow:
   - **People-centric** (one row per person — attendee, speaker, RSVP list) → shell Flows picker → **"Augment a CSV of People"** (`apps/person-db-resolver`). Match-or-creates each person, then independently match-or-creates their org and `RELATE`s the affiliation with a role.
   - **Org-centric** (one row per organization — sponsors, exhibitors) → Flows picker → **"Augment a CSV of Event Attendees"** (`apps/record-db-resolver`, the org-only sibling — the label is a slight misnomer, it's really "org-centric CSV," see the description text in `shell/src/flows.svelte.ts`).
   - A single event with both shapes (like FreedomFest) runs each CSV through its matching flow separately.

3. **Event row** — usually auto-created. If a row's observation column is shaped like `"<verb> at <Event Name>"` (e.g. `"Speaker at FreedomFest 2026"`), `person.apply` parses it and calls `ensureEvent()` automatically (`services/record-surrealdb-resolver/src/person-resolver.ts`) — no manual step needed. Only pre-create the event by hand (copy-modify `scripts/surreal-write-event.mjs`'s `EVENT` const and run it) if you want clean metadata up front — venue, `source_url`, `total_attendees` — that the auto-created row won't have.

4. **Upload + resolve** — via Record Collector (the shared upload step every Flow starts from), map columns once with `ColumnMapper` (mapping is cached per record-set in `localStorage`, key prefix `augment-it:person-db-resolver:mapping:` or `augment-it:affiliation-rating-resolver:mapping:`), then walk rows: match-or-create person, match-or-create org, confirm the affiliation + role.

5. **Optional: export for offline rating** — `node scripts/export-affiliation-ratings-csv.mjs --event-slug <slug> --client reach-edu` — one row per `affiliations` edge (a person with two orgs gets two rows). Operator rates `relevance` (`Very Relevant` / `Highly Relevant` / `Relevant` / `Skip` / `Irrelevant`) + `relevance_note` offline in a spreadsheet.

6. **Reimport ratings** — Flows picker → **"Rate Affiliations"** (`apps/affiliation-rating-resolver`) — writes `relevance`/`relevance_note`/`relevance_rated_by`/`relevance_rated_at` back onto each `affiliations` edge via `affiliation.rate`. Can also add `person.links.add` / `person.corpus.add` / `organization.links.add` / `organization.corpus.add` inline per row.

7. **Optional: operator-facing briefing** — `node scripts/export-event-briefing.mjs --event-slug <slug> --client reach-edu --out-dir clients/reach-edu/briefings/<slug>/` — coverage stats, triage buckets, org rollup. Matches the shape of `clients/reach-edu/briefings/2026-05-21-turning-jobs/briefing.md`.

## Fill in once the CSV is at hand

- [ ] Event slug + display name
- [ ] People-CSV, org-CSV, or both
- [ ] Column mapping (source columns → `name` / `email` / `linkedin_url` / `org_name` / `role` / `observation`)
- [ ] Any new observation verb needed beyond the existing `PREDICATE_BY_VERB` map (`speaker`, `sponsor`, `exhibitor`, `attendee`, `partner` → extend in `person-resolver.ts` if the CSV needs a new one — anything unmatched falls back to `associated_with`, which is a safe default, not a blocker)
- [ ] Whether this event also wants the offline rating pass (steps 5–6) or stops at raw ingestion

## Cross-references

- [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]] — the issue this stub was spun off from
- [[Augment-From-Affiliations]] — the rating round-trip spec (steps 5–6)
- [[Person-Aware-Canonical-Resolver-Extension]] — the plan behind the `person.*` capabilities
