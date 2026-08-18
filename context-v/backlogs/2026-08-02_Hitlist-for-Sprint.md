---
title: "Sprint Hitlist — the open-issue backlog as of 2026-08-02"
lede: "A triaged snapshot of every open issue after the v3.1.0.0 tag and three closures — grouped by what to confirm-and-close, what's in flight, what's genuinely open backlog, and what's deferred by decision."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.2
status: Active
revisions:
  - 2026-08-02 — **Batch A verified against shipped code (0.0.0.2).** Four fan-out agents read each issue's acceptance, the candidate changelog, and the live source. Concurrent-Searches → Resolved (fully); Parent-Child-Nested-Orgs → Partially-Resolved (core shipped, nesting/roll-up/reconciliation open); Search-And-Add-Invokes → Resolved-Pending-Confirmation (symptom fixed, root cause mitigated not pinned); Relation-Kinds-Inverse-Pairs → stays open (only the funder pair got an inverse). Issue frontmatter flipped to match.
  - 2026-08-02 — Initial triaged snapshot (0.0.0.1).
tags:
  - Backlog
  - Sprint
  - Augment-It
  - Triage
site_uuid: df463dec-bacc-4c41-9a64-585feb10b2af
hex_code: bbj8uo
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
---

# Sprint Hitlist — 2026-08-02

## Why Care?

Taken right after the `v3.1.0.0` tag ("Multi-Tenant, Canonical, and
Tested") and the closure of three issues (test coverage, the
zombie-session fix, the DB-state-alignment audit). **26 issues remained
open** at that tag. This is the triaged list — grouped by *what to do with
each*, not just by folder — so a sprint can start from decisions rather
than a flat pile. Each item links its issue file.

**Batch A has now been verified against shipped code** (2026-08-02, four
fan-out agents reading each issue's acceptance + the candidate changelog +
the live source). One closes fully, two are partially resolved with their
open remainder named, one stays open. Net open after this pass: **25** —
one fully resolved, two demoted to their still-open tails, one unchanged.

## A · Verified against shipped code — resolved / demoted

Each row below is now backed by a source read, not a guess. Issue
frontmatter has been flipped to match.

| Issue | Verdict (code-confirmed) | New status |
|---|---|---|
| [[Concurrent-Agent-Searches-Queue-Into-A-Search-Results-Column]] | **Shipped fully.** `services/workspace/src/searches.ts` async job registry + `apps/search-results/` remote (:3018) on the right rail; `apps/search-and-add` old crawl-column retired; `scripts/prove-search-queue.mjs` is the acceptance proof. Also dissolves its sibling [[Search-Column-Holds-Stale-Results-New-Agent-Searches-Dont-Reload-It]] (already `Superseded`). | ✅ **Resolved** — live progress frames + chat/manual-search doors deferred to #35 |
| [[Parent-Child-Nested-Organizations-Not-Modeled]] | **Shipped partial.** Model (edges in `affiliations`, `edge_type=org_org`), six capabilities, `RelatedOrgs.svelte` surface, triage step 5b, pilot A-1 untangled — all code-confirmed. | 🟡 **Partially-Resolved** — open: multi-hop nesting renders one hop only, corpus roll-up lenses deferred, reconciliation worklist A-2..4 + B outstanding |
| [[Relation-Kinds-Are-Inverse-Pairs]] | **Still open.** `84675e5` added `KIND_INVERSE` covering only the funder pair (`funder_of ↔ funded_by`); every other directional kind (`initiative_of`, the hierarchy family) still falls through to the raw stored string from the `out` seat. `99ffa96` logged it "not fixed"; none of the three design options landed. | 🔴 **Active** (unchanged) |
| [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] | **Shipped partial.** Eternal-spinner symptom structurally fixed (120s invoke deadline, `ce51eb7`); reconnect root cause mitigated (`899b144`). But the exact silent-frame-loss cause was mitigated + made grep-able, never pinned — and no test exercises the two-mount-invoke race. | 🟠 **Resolved-Pending-Confirmation** — needs one operator confirm on prod that the mount-time hang is gone |

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

1. ~~**Batch A:** which of the four are done?~~ ✅ **Resolved 2026-08-02** — verified against code (see Batch A table). Concurrent-Searches closed; Parent-Child + Search-And-Add demoted to their open tails; Relation-Kinds stays open. Two follow-ups fall out of this:
   - **Split the two partials?** Parent-Child's open remainder (multi-hop nesting, corpus roll-up, reconciliation A-2..4 + B) and Search-And-Add's (operator prod-confirm) could each become their own tightly-scoped follow-up issue rather than living under a "Partially-Resolved" umbrella. Your call.
   - **Confirm Search-And-Add on prod:** it's one operator walk-through away from fully closed — worth pairing with the production-connection sprint pick below since both live on the deployed surface.
2. **Sprint pick from C:** the production connection issue is the highest external stakes; the rest are internal polish.
3. **B:** bump any statuses, or leave the descriptive states? (Left as-is this pass — all five carry accurate descriptive states; none contradicted by shipped code.)

## See also

- [[Corpora-Builder-Harmony-Test-Registry]] — the now-complete test coverage
- `changelog/2026-08-01_01_The-Test-Suite-Lands-All-Ten-Groups-Green…` — the milestone this hitlist follows
