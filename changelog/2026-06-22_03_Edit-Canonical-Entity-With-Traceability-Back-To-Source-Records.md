---
date_created: 2026-06-22
date_modified: 2026-06-22
title: "Edit the canonical entity on the DB — with traceability back to the source records"
lede: "Confirmed working in-app: you can now correct a canonical organization's name and slug after research, and the match to the original record holds. The bond is the immutable id; the slug is just its editable face, and every match rides back onto the source row."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - apps/record-db-resolver/src/App.svelte
  - services/record-surrealdb-resolver/src/resolver.ts
tags:
  - Progress-Update
  - Record-DB-Resolver
  - Round-Trip-Traceability
  - Canonical-Entity-Registry
  - reach-edu
---

## Why Care?

A canonical dataset is only useful if you can *correct* it, and a correction is
only safe if it doesn't sever the link to where the data came from. The client's
record says "Howard Schulz Foundation"; the truth after research is "The Schultz
Family Foundation." You can now make that fix on the canonical org **and keep the
match** — because the link to the source record was never the name or the slug.
This is the moment the DB Resolver stops being a one-way matcher and becomes a real
two-way, traceable bridge.

## What's New? (verified in the running app)

- **Edit canonical name / slug** right after a match or create. Rename the slug and
  the match survives — the old slug is parked as an alias, the immutable id holds.
- **Traceability back to source records.** Each match stamps the bond
  (`resolved_org_id` + `resolved_org_slug` + `resolved_org_name`) straight onto the
  record, so the canonical match can export back into the client's CSV — and a
  revisited record shows an "already resolved" marker.

## Notes

This is the **in-app confirmation** beat for the v0.0.0.2 work. The implementation
detail — the two-write apply, the `aliases[]`-on-rename, the id-as-bond decision and
why a slug can't be the join key — lives in the prior entry
[[2026-06-22_02_DB-Resolver-v0-0-0-2-Round-Trip-Bond-And-Editable-Canonical]] and
the decisions log [[Grilling-on-DB-Resolver--Future-Versions]]. Shipped on
`feature/resolve-db`.

## What's Next

Still open in the grilling log: creating a **person** entity from a record (#3), and
the **opportunities** pair (#4/#5). Two UX asks queued: fast record navigation and a
changes-log view.
