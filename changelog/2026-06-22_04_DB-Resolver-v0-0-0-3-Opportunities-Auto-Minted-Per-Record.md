---
date_created: 2026-06-22
date_modified: 2026-06-22
title: "DB Resolver v0.0.0.3 — opportunities, auto-minted per record, many per org"
lede: "Resolving a record now mints an opportunity: a first-class, client-scoped entity 1:1 with the source record and many:1 to the canonical org. Three pipeline rows for Accelerate the Future become three opportunities on one org — none merged, none lost. This is also where the client's CRM data finally lives."
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
  - apps/record-db-resolver/src/lib/normalize.ts
  - apps/record-db-resolver/src/lib/resolver-client.ts
  - apps/record-db-resolver/src/lib/types.ts
  - context-v/specs/Record-DB-Resolver.md
tags:
  - Progress-Update
  - Record-DB-Resolver
  - Opportunities
  - SurrealDB
  - CRM
  - reach-edu
---

## Why Care?

A funder pipeline isn't a list of organizations — it's a list of *engagements*. The
client's tracker had **three separate rows for "Accelerate the Future,"** and the
stakeholder meant exactly that: three distinct opportunities, one organization. Until
now the resolver could bond each row to the canonical org, but the *threeness* — the
thing the client would notice missing — had nowhere to live. ("You don't have the
three opportunities we have for Accelerate the Future" is the sentence we never want
to hear.)

v0.0.0.3 gives that engagement a home: an **opportunity** — a first-class,
client-scoped entity. It's also the answer to a question we'd deferred twice: **where
does the client's CRM data (Stage, $, Owner, Next Step) go?** Not on the shared org
(that would leak across clients) — on the opportunity.

## What's New?

- **Opportunities auto-mint on resolve.** Every record you resolve mints (or updates)
  an opportunity — no extra step, so the count is never lost.
- **Many opportunities, one org.** A second record pointing at an org you already
  matched creates a *second* opportunity; it does **not** duplicate the org. The
  result panel shows "this org now has N opportunities."
- **CRM data lives on the opportunity.** The pipeline columns ride along as a
  snapshot (`crm`), client-scoped — never on the shared canonical org.
- **Reverse bond, native.** `resolver.opportunities_for_org` lists an org's
  opportunities — the org→records direction we'd parked is now a one-line query.

## How it Works — never lose, duplicates are fine

The governing rule (grilled out in the [[Grilling-on-DB-Resolver--Future-Versions|decisions log]],
and pure [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle|redundancy-over-normalization]]):
**losing an opportunity is the only real failure; duplicates are harmless.**

```
record (record_uuid) ──1:1──▶ opportunity ──many:1──▶ organization (canonical, shared)
                                  └ crm snapshot (Stage/$/Owner…), status, source, record_set
```

- Identity is **1:1 with `record_uuid`** per client. Same record re-resolved →
  *update*. A different record (even the same org) → a *new* opportunity. No
  auto-merge; matchmaking-to-merge is a deliberate later, optional feature.
- Opportunities are **client-partitioned** in the one canonical SurrealDB (the
  Lossless intel layer); **Decile stays a humain-vc-only push target**, never the
  store (reach-edu's pipeline is the CSV).
- The `opportunities` table is **schemaless** so the CRM snapshot can vary per client
  and per import without a migration. Hardcoded as `opportunities` — no
  `record_subset` abstraction until a real second type shows up.

Verified against live SurrealDB with a self-test org (then deleted): record A →
opportunity #1; record B on the same org → opportunity #2 (org **not** duplicated);
re-applying A → *update*, still 2; `opportunities_for_org` → both.

## Show-the-messy-middle

Verification caught a real bug before it shipped: `opportunities_for_org` was
silently returning zero while the count said two. SurrealDB 2.x refuses
`ORDER BY last_touched_at` unless that field is in the SELECT projection ("Missing
order idiom in statement selection") — so the list query was erroring, the handler
swallowed it, and the UI would have shown an org with "0 opportunities" that actually
had two. One-line fix (project the sort field); exactly the kind of silent-zero that
the never-lose ethos is meant to catch.

## Files Touched

- **Service:** `services/record-surrealdb-resolver/src/resolver.ts` (opportunities
  schema, `upsertOpportunity`, auto-mint in `applyResolution`, `opportunitiesForOrg`),
  `src/handlers.ts` (`resolver.opportunities_for_org`).
- **Wiring:** `services/workspace/src/capabilities.ts`.
- **UI:** `apps/record-db-resolver/src/App.svelte` (passes `record_uuid` + `crm`,
  shows the opportunity outcome), `src/lib/normalize.ts` (`buildCrm` allowlist),
  `src/lib/resolver-client.ts`, `src/lib/types.ts`.
- **Spec:** `context-v/specs/Record-DB-Resolver.md` (v0.0.0.3 locked).

## What's Next

Still open: creating a **person** entity from a record (#3); a **"close opportunity"**
lifecycle + board UI (the status field is already there, defaulted to `open`); the
optional **matchmaking-to-merge** pass; and the two queued UX asks — fast record
navigation and a changes-log view.
