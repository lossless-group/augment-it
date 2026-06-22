---
date_created: 2026-06-22
date_modified: 2026-06-22
title: "DB Resolver v0.0.0.2 — the match rides home, and the canonical name becomes yours to fix"
lede: "The resolver now stamps each match straight back onto the source record (so it survives a crash and exports back to the client's CSV), and lets the operator rename the canonical org's name/slug without ever breaking the bond — the immutable id holds, old slugs become aliases."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - apps/record-db-resolver/src/App.svelte
  - apps/record-db-resolver/src/lib/resolver-client.ts
  - apps/record-db-resolver/src/lib/types.ts
  - apps/record-db-resolver/src/app.css
  - context-v/issues/Grilling-on-DB-Resolver--Future-Versions.md
tags:
  - Progress-Update
  - Record-DB-Resolver
  - SurrealDB
  - Round-Trip-Traceability
  - Canonical-Entity-Registry
  - reach-edu
---

## Why Care?

The first resolver could match a record to a canonical org or create one — but the
match lived only in the database. That's a problem, because augment-it is a
**round-trip pipeline**: data comes in as a CSV (or CRM export), gets augmented
toward something canonical and complete, and goes back out as a CSV the client
actually reads. The client keeps thinking in their original table. So a match that
can't travel home isn't finished.

v0.0.0.2 closes that loop and adds the other thing real curation needs: the
**freedom to fix the canonical name**. The client's record says "Howard Schulz
Foundation"; the truth after research is "The Schultz Family Foundation" at slug
`schultz-family-foundation`. You can now make that correction on the canonical
entity **without losing the match** — because the bond was never the slug.

## What's New?

- **Round-trip write-back.** Every match/create now stamps the bond *straight onto
  the source row* — `resolved_org_id`, `resolved_org_slug`, `resolved_org_name`,
  `resolved_at` — the moment it's applied. Crash mid-session, come back, and the
  matches you made are still there (and ready to export into the next CSV version).
- **Already-resolved indicator.** Land on a record you resolved before and the
  surface tells you, with its canonical slug. Re-resolving is safe — writes are
  additive and deduped.
- **Editable canonical name / slug.** After a match or create, edit the org's name,
  short name, and slug inline. A slug rename **keeps the old slug as an alias** and
  re-stamps this row's display copy.
- **Divergence is visible.** When the canonical name differs from the client's term,
  a chip shows both — the client keeps their language, you see the canonical truth.

## How it Works — id is the bond, slug is the face

The load-bearing decision (grilled out in the [[Grilling-on-DB-Resolver--Future-Versions|issues log]]):
**the immutable SurrealDB RecordId is the durable bond; the slug is editable display.**
A slug *cannot* be both the join key and a thing you rename — it keys the corpus
directories on disk, the `content_items` ledger, and the CSV. So:

```
record  ──(resolved_org_id = immutable uuid)──▶  organizations
            resolved_org_slug ┐
            resolved_org_name ┘ display copies, refreshed on rename
                              org.aliases[] ◀── old slug parked here
                                               so pre-rename artifacts still resolve
```

Apply is now a **two-write** operation: the additive canonical write to SurrealDB,
then a `row.update` stamping the bond back onto the record. `update_org` handles the
rename — it refuses a slug already taken by another org, pushes the prior slug into
`aliases[]`, and the surface re-stamps the bonded row so its `resolved_org_slug`
stays current while the `resolved_org_id` never moves.

Verified against live SurrealDB with a self-test org (created, renamed, then
deleted): the rename moved the slug, parked the old one in `aliases`, and the
`org_id` was byte-identical before and after — the bond held.

## Scope

- **In (this release):** round-trip row stamp, already-resolved indicator, editable
  canonical name/slug, `aliases[]` on rename, divergence chip.
- **Deferred:** creating a **person** entity from a record (v0.0.0.2 item #3 — its
  design questions aren't settled yet, so it's deliberately not built); fan-out
  re-stamp across *multiple* rows bonded to one org (waits on the v0.0.0.3
  "opportunities" model); the re-import idempotency UX.

## Files Touched

- **Service:** `services/record-surrealdb-resolver/src/resolver.ts` (apply returns
  names; new `updateOrg` with alias-on-rename + collision guard),
  `src/handlers.ts` (`resolver.update_org` subject).
- **Wiring:** `services/workspace/src/capabilities.ts` (`resolver.update_org`).
- **UI:** `apps/record-db-resolver/src/App.svelte` (two-write apply, edit panel,
  banners), `src/lib/resolver-client.ts` (`stampRow`, `updateOrg`),
  `src/lib/types.ts`, `src/app.css`.
- **Decisions:** `context-v/issues/Grilling-on-DB-Resolver--Future-Versions.md`
  (#1 and #2 locked).

## What's Next

The grilling log still has live questions: person-vs-org creation (#3), and the
big pair — what an "opportunity" is and whether it reopens the CRM-stays-in-Decile
call (#4/#5). Plus two UX asks queued: fast record navigation (jump / ToC) and a
changes-log view.
