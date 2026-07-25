---
title: "Search-Results Queue — a right-rail microfrontend where concurrent agent searches land, signal, and get triaged"
lede: "Agent searches run minutes; the operator shouldn't. Every search fired anywhere becomes a collapsed card in a persistent right rail — status, elapsed vs. typical wait, arrival signal — expandable to act, dismissed when done. Fire many, walk away, triage on arrival."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
issue_of_record: "[[../issues/Concurrent-Agent-Searches-Queue-Into-A-Search-Results-Column]]"
tags:
  - Spec
  - Augment-It
  - Search-Results
  - Didi-Crawl
  - Microfrontends
  - Concurrency
  - Workspace
status: Implemented (Phases 1–3 shipped 2026-07-24; Phase 4 pending with #35)
---

# Search-Results Queue — the `search-results` remote

## Summary

Today an agent search is a **synchronous invoke**: the button disables, one
column is hijacked, and the operator babysits a 60–210s wait (observed live:
links 87s; team 147s and 211s). This spec makes searches **asynchronous
jobs**: a `search.submit` capability returns a `search_id` immediately, the
workspace service owns a durable search registry, completion broadcasts as a
WS event, and a new `search-results` remote renders the registry as a queue
of cards in a persistent right rail — collapsed while running, signalling on
arrival, expanding into the accept surfaces, dismissed by the operator when
dealt with.

## Goals

1. **Fire-and-forget from every door.** The 🤖 buttons (links, streams,
   team), and later chat, enqueue a search and return the operator's
   attention immediately.
2. **Concurrency as the norm.** N searches in flight across N orgs; the
   queue is the worklist.
3. **Honest waiting.** Every card shows status (`queued / running / done /
   failed`), elapsed time, and typical duration for its target — the
   antidote to the frozen "crawling…" line.
4. **Arrival is an event, not a discovery.** Done cards signal (badge +
   count in the rail header); the operator notices without polling.
5. **Results survive everything.** Tab refresh, remount, WS reconnect, even
   closing the browser: the registry lives server-side (persisted like
   sessions and the active workspace), TTL-bounded. This finishes what the
   claim protocol (#41) started.
6. **Act in place, then clear.** Expand → per-row ➕ (links/streams) or the
   staged-people accept gates (team) → mark complete → card leaves the
   queue.

## Non-goals (this spec)

- **Progress traces inside a run** — the per-card progress line renders
  whatever `search.progress` events exist, but emitting rich narration from
  prompt-runner is [[../issues/Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]]'s
  build (Phase 4 hooks it in).
- **Manual 🔍 term searches in the queue** — search-and-add keeps the
  interactive term/palette flow; unification is an open question below.
- **JetStream-grade durability** — the registry persists to the workspace
  volume, not a message log; a crash mid-crawl marks the search `failed`
  with a retry affordance, which is honest and sufficient.
- **Cross-operator queues** — the registry is per-workspace, not per-user,
  in v1 (single-operator reality today).

## Decisions

- **D1 — The registry lives in the workspace service.** A `searches.ts`
  module: in-memory map + write-through JSON at `SEARCH_STORE_PATH`
  (`/data/searches.json`, the sessions/active-workspace volume precedent).
  Server-side because: survives every client failure mode, one source of
  truth for N surfaces, chat can enqueue, and completion events broadcast on
  the existing WS event machinery.
- **D2 — Submit/execute split.** `search.submit` validates, writes the
  registry entry (`queued`), returns `{search_id}` and kicks execution
  without awaiting it: the workspace dispatches the existing
  `organization.crawl.requested` NATS request itself (600s timeout, as
  today) and on settle updates the entry (`done` + results | `failed` +
  error) and broadcasts. prompt-runner is UNCHANGED in Phase 1 — the async
  boundary moves into workspace, not the runner.
- **D3 — Events over polling.** `search.updated {search_id, status}` joins
  `BROADCAST_SUBJECTS`-style WS event frames. The remote refetches the
  registry on events (+ once on mount). No polling loops.
- **D4 — A persistent right rail, mirroring the chat rail.** The shell
  mounts `search-results` as a right-side companion with its own toggle
  (`🔎 queue` beside `💬 chat`) and localStorage visibility — NOT a numbered
  rotation step, because searches are fired from every flow and must be
  reachable from every flow. The rail header shows a done-count badge even
  while collapsed... the rail, not the cards, is the "furthest right column".
- **D5 — Cards carry their provenance.** `{search_id, entity {org_slug,
  display_name}, target, status, submitted_at, started_at?, finished_at?,
  error?, result_summary {count}, typical_ms}` — enough to render collapsed
  without fetching results. Results fetch on expand (`search.results`).
- **D6 — Typical durations are hardcoded v1** from live observations
  (links/streams ~90_000ms, team ~200_000ms), displayed as "elapsed 1:20 ·
  typically ~1:30". A rolling per-target average in the registry is the
  cheap v2.
- **D7 — Accept actions reuse today's verbs, per-remote copies of the UI.**
  Links/streams rows: ResultRow-shaped list with ➕ →
  `organization.links.add` / `streams.add` (kind/name carried through, as
  search-and-add does since v1.2). Team: a StagedPeople-shaped section with
  the same candidates-gate accept →  `person.apply` + `person.affiliate` +
  link adds. Copied-and-adapted per the knots-style no-shared-runtime rule;
  this is deliberately more fuel for the component library
  ([[../issues/No-Component-Library-UI-Improvised-Not-Component-Based]]).
- **D8 — Mark complete = dismiss.** `search.dismiss {search_id}` deletes
  the entry (results included). No archive in v1; the canonical layer
  already holds everything the operator accepted. Failed cards offer
  **Retry** (resubmits same entity+target) alongside dismiss.

## Capability contract

All served by the workspace service itself (no NATS round-trip for
registry ops; the crawl dispatch inside execution reuses the existing
subject and timeout):

| Capability | Args | Returns |
|---|---|---|
| `search.submit` | `{entity: {org_slug, display_name?}, target: 'links'\|'streams'\|'team', client}` | `{ok, search_id}` — immediate |
| `search.list` | `{client}` | `{ok, searches: SearchCard[]}` (D5 shape, no results) |
| `search.results` | `{search_id}` | `{ok, status, results?\|people?, filtered_note?, source_urls?, error?}` |
| `search.dismiss` | `{search_id}` | `{ok}` |
| WS event | — | `search.updated {search_id, status, org_slug, target}` broadcast to all sessions |

Execution note: workspace's executor calls `organization.crawl.requested`
over NATS exactly as `dispatch('organization.crawl', …)` does today (same
600s budget, same reply shapes per target); the crawl capability stays
chat-legal and untouched for direct use.

## Architecture — the new remote

`apps/search-results/` (scaffold template: `apps/search-and-add`; port
**3018** — the spec first said 3017, but strategy-curator had already
claimed it by build time; federation name `searchResults`):

```
src/
  App.svelte            — rail shell: header (count badge, clear-done), card list
  SearchCard.svelte     — collapsed row: target chip · org · status · elapsed/typical · signal dot
                          expanded: results region per target + Mark complete / Retry
  ResultsAccept.svelte  — links/streams: rows with ➕ (copy-adapt ResultRow/ResultsList)
  TeamAccept.svelte     — team: staged-people accept gates (copy-adapt StagedPeople)
  lib/search-client.ts  — submit/list/results/dismiss wrappers + typical-duration map
  lib/types.ts          — SearchCard, per-target result shapes (mirrors)
  mount.ts / app.css    — per the remote scaffold conventions
```

Shell (`shell/src/`): `SEARCH_RESULTS_REMOTE` beside `CHAT_REMOTE`
(remotes.ts); right-rail slot + `🔎 queue` toggle beside the chat toggle
(App.svelte); rail layout mirrors the chat rail's (chat left · stage center
· queue right).

Door rewiring (org-workbench): `makeCrawl(...)` and PeopleReveal's `crawl()`
stop invoking `organization.crawl` synchronously and instead
`search.submit` + (if rail hidden) flip it visible. The search-and-add crawl
mode and its envelope `crawl` flag are removed once the queue lands
(the manual term/scan modes remain).

## Implementation phases

### Phase 1 — Registry + async execution (service only)
`searches.ts` (registry, persistence, TTL sweep ~24h), the four
capabilities, the executor, the `search.updated` broadcast; capability map +
timeouts. Prove over NATS/WS with a scripted submit → event → results →
dismiss round-trip against the Aspen safe target.

### Phase 2 — The rail
Scaffold `apps/search-results`; shell registration + toggle; cards render
the registry live (submit via a temporary script or Phase 3 doors); status,
elapsed vs typical, arrival badge; expand fetches results read-only; dismiss
works. Browser-drive: submit two searches, watch both cards progress,
expand the finished one.

### Phase 3 — Accept surfaces + door switchover
ResultsAccept (links/streams ➕ with kind/name carry-through) and TeamAccept
(candidate gates, consume-on-accept per gh #37); org-workbench doors switch
to `search.submit`; retire search-and-add's crawl mode; entity-updated
events keep firing on accepts so cards and counts refresh.

### Phase 4 — Progress line (joint with #35)
prompt-runner emits `search.progress` beats; executor relays them onto the
card's progress line. Separately planned; the card reserves the slot.

## Constraints & assumptions

- Wire discipline unchanged: slugs/uuids only, client tagging on accepts,
  candidates-never-auto-write.
- The claim protocol (#41) stays — it protects every *other* long invoke;
  the queue simply stops using long invokes for searches.
- Federation rules per [[../blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas]]:
  no shared runtime, remote owns its Svelte, theme.css before app.css,
  new remote = shell rebuild + fresh browser load.
- `docker compose` frontends untouched (rsbuild dev servers); dev.sh gains
  the :3018 line.

## Open questions (deliberately few)

- [ ] Does dismissing a `done` card that still has unaccepted rows warn
  ("3 candidates not reviewed")? Lean yes, one inline confirm.
- [ ] Chat door: `organization.crawl` stays for didi v1, or didi learns
  `search.submit` so chat-fired crawls also land in the rail? Lean the
  latter, one slab edit, Phase 3.
- [ ] Rolling typical-duration averages (D6 v2) — worth it when? After the
  rail proves itself.

## Related

- [[../issues/Concurrent-Agent-Searches-Queue-Into-A-Search-Results-Column]] — issue of record (operator's design, absorbed here)
- [[Augment-From-DB-Flow]] §v1.2 — the crawl capability this queues
- [[../issues/Invokes-Survive-Reconnects-The-Claim-Protocol]] · [[../issues/Crawl-Replies-Can-Be-Lost-Eternal-Spinner-No-Client-Timeout]] — the reliability substrate and its lesson (results belong server-side)
- [[../issues/Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]] — Phase 4's partner
- [[../issues/No-Component-Library-UI-Improvised-Not-Component-Based]] — the copies D7 knowingly adds
