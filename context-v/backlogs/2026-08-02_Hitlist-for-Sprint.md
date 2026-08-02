---
title: "Sprint Hitlist — the open-issue backlog as of 2026-08-02"
lede: "A triaged snapshot of every open issue after the v3.1.0.0 tag and three closures — grouped by what to confirm-and-close, what's in flight, what's genuinely open backlog, and what's deferred by decision."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
status: Active
tags:
  - Backlog
  - Sprint
  - Augment-It
  - Triage
---

# Sprint Hitlist — 2026-08-02

## Why Care?

Taken right after the `v3.1.0.0` tag ("Multi-Tenant, Canonical, and
Tested") and the closure of three issues (test coverage, the
zombie-session fix, the DB-state-alignment audit). **26 issues remain
open.** This is the triaged list — grouped by *what to do with each*, not
just by folder — so a sprint can start from decisions rather than a flat
pile. Each item links its issue file; the "read" column is a first-pass
assessment to confirm or correct, not a verdict.

## A · Confirm-and-close — probably resolved by shipped features

These likely map to work that already shipped; confirm, then flip to
`Shipped`/`Resolved`.

| Issue | Read |
|---|---|
| [[Concurrent-Agent-Searches-Queue-Into-A-Search-Results-Column]] | **Almost certainly done** — the changelog `2026-07-24_07 Searches-Become-Async-Jobs-The-Queue-Rail-Lands` is exactly this. Safe to close. |
| [[Parent-Child-Nested-Organizations-Not-Modeled]] | Org-relations shipped parent/child/peer (2026-07-27). Fully, or partially? |
| [[Relation-Kinds-Are-Inverse-Pairs]] | Was logged "not fixed"; `84675e5` (directional kinds from the focused seat) partly addressed it. Still open? |
| [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] | The Group C reconnect fix targeted *refused* connections, not the mount-time hang this describes — **probably still open**; verify. |

## B · In-flight investigations — status already descriptive

These carry their own progress state; they may just need a bump, not a
decision.

- [[Some-Records-Show-Empty-Corpus-Despite-Directories-on-Disk]] — *Real root cause identified · Fix In Progress* (corpus_funder_slug join + workspace timeout).
- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] — *Audit complete · awaiting a curation affordance.*
- [[Funder-Corpus-First-Session-Failed-Most-Records-Unprocessable]] — *Rebuild exists in code, never validated against a real pack fire.*
- [[How-People-Orgs-And-Relationships-Actually-Enter-SurrealDB]] — *Model clarified · next-event plan stubbed.*
- [[Augment-Transformations-Not-Reliably-Persisting]] — *Backup made; field edits disappearing across record-set versions.*

## C · Genuinely open backlog — UX / tooling / bugs

The real sprint candidates. Ordered loosely by operator-visible pain.

- [[Workspace-And-Corpora-Connection-Slow-To-Hanging-And-Auth-Wont-Persist]] — **new, production-facing**; the deployed surface is hard to use (leading suspect: Zen/Firefox cookie partitioning). Highest external stakes.
- [[Header-Polish-Flow-Label-Chat-Toggle-Placement-Shell-Suffix]] — FLOW label + shell suffix outlived their jobs; chat toggle on the wrong side.
- [[Corpus-Adds-Dont-Fetch-Metadata-No-Cue-No-Inspector]] — a corpus add gives no cue and no inspector.
- [[Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]] — "this takes a minute…" needs watchable traces.
- [[Crawl-Substrate-Is-Fixed-To-Anthropic-Web-Search-Operator-Expected-A-Choice]] — operator wanted to choose the search substrate.
- [[Flow-Switch-Doesnt-Surface-The-New-Flows-Stage-Step-Bubble-Click-Required]] — switching flows doesn't surface the new stage.
- [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]] — no single view of whether everything's actually working.
- [[No-User-Visibility-Into-State-Needs-A-State-Inspector]] — the app needs a State-Inspector surface.
- [[No-Component-Library-UI-Improvised-Not-Component-Based]] — improvised per-remote UI; starting to show.
- [[Capability-Gaps-Surfaced-by-First-Triage-Run]] — one collective ledger, not five tickets.

## D · Deferred by decision — leave as-is

- [[Funder-Strategy-Connection-Tags-Now-Edges-Maybe]] — funder↔strategy stays tags; the real-edge question is deliberately deferred.

## E · Stubs & open questions — not yet sprint-ready

- [[Merge-Organizations-Or-People-Non-Destructive-Dedupe]] — *Stub.*
- [[Person-DB-Resolver-Needs-Multiple-Organizations-Per-Person]] — *Stub.*
- [[Grilling-on-DB-Resolver--Future-Versions]] — questions to settle before the next resolver version.
- [[Personal-Link-Observations-Need-Query-Lenses]] — an accumulating fact log needs named query lenses.
- [[Troubleshooting-UI-for-Official-Blogs]] — the bundle-fire path doesn't fit the prompt-template flow.
- [[Changelog-Duplicated-Across-Splash-And-Laerdal-Collection]] — duplicate changelog entries across two trees.

## Decisions this hitlist is waiting on

1. **Batch A:** which of the four are done? (Concurrent-searches is safe to close now.)
2. **Sprint pick from C:** the production connection issue is the highest external stakes; the rest are internal polish.
3. **B:** bump any statuses, or leave the descriptive states?

## See also

- [[Corpora-Builder-Harmony-Test-Registry]] — the now-complete test coverage
- `changelog/2026-08-01_01_The-Test-Suite-Lands-All-Ten-Groups-Green…` — the milestone this hitlist follows
