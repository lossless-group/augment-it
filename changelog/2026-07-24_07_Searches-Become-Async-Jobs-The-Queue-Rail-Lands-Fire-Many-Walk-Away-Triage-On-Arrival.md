---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "Searches Become Async Jobs — the Queue Rail Lands: Fire Many, Walk Away, Triage on Arrival"
lede: "Agent searches run minutes; the operator no longer does. Every 🤖 now returns instantly, the search lands as a card in a persistent right rail, and the card signals when candidates arrive — expand, accept, dismiss."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/workspace/src/searches.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/ws.ts
  - services/workspace/src/server.ts
  - apps/search-results/
  - apps/org-workbench/src/lib/search-queue.ts
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/PeopleReveal.svelte
  - apps/search-and-add/src/App.svelte
  - shell/src/App.svelte
  - shell/src/remotes.ts
  - scripts/prove-search-queue.mjs
tags:
  - Search-Results
  - Didi-Crawl
  - Microfrontends
  - Concurrency
---

# Searches Become Async Jobs — the Queue Rail Lands

## Why Care?

Until today, asking didi to crawl the web for an org's links, streams, or
team meant watching a disabled button for one to three and a half minutes —
per search, per org. The operator was the slowest part of a pipeline whose
whole point is that the agent does the waiting.

Now a search is a job. Click the 🤖, get your attention back immediately,
click four more on four other orgs if you like. Each search becomes a card
in a new right-hand queue rail: status, elapsed time against the *typical*
duration for that kind of search ("running · 1:06 / typically ~3:20" — the
antidote to the frozen "crawling…" line), and a signal when candidates
arrive. Expand the card, ➕ the links that belong or accept the staged
people through the same match-or-create gates as before, mark it complete,
and it leaves the queue. Refresh the tab, close the browser, come back —
the queue is still there, because it never lived in the browser.

## What's New?

- **`search.submit` / `search.list` / `search.results` / `search.dismiss`** —
  four new capabilities served by the workspace service itself. Submit
  validates, registers the search, returns a `search_id` in milliseconds
  (4ms observed live), and dispatches the existing crawl over NATS without
  awaiting it. prompt-runner is untouched — the async boundary moved into
  the workspace service, not the runner.
- **A durable server-side registry** (`searches.ts`) — in-memory map with
  write-through JSON on the same volume as sessions and the active
  workspace. A workspace restart mid-crawl marks the stranded search
  `failed` with a Retry affordance instead of spinning forever — the same
  honesty the claim protocol (#41) brought to long invokes.
- **`search.updated` broadcasts** — the rail refetches on events, never
  polls. Submit, start, settle, and dismiss all announce themselves to
  every connected session.
- **The `search-results` remote** (`apps/search-results`, :3018) — the
  chat rail's right-side mirror, with its own `🔎 queue` toggle in the
  shell header and a done-count badge that stays visible while the rail is
  collapsed. Cards carry provenance (target chip, org, timestamps); the
  accept surfaces are per-target: links/streams rows with ➕ carrying the
  crawl's inferred `kind` (and a stream's real name) through the write, and
  a team surface with the full staged-people candidate gates,
  consume-on-accept (#37).
- **Door switchover** — the org card's links/streams 🤖 and the People 🤖
  now enqueue instead of hijacking the search-and-add column;
  search-and-add's crawl mode (and the envelope `crawl` flag) is retired.
  Its term-search and stream-scan modes are unchanged.
- **Dismiss with a conscience** — marking a done card complete while it
  still holds unreviewed candidates asks once, inline: "7 candidates not
  reviewed — dismiss anyway?"
- **`scripts/prove-search-queue.mjs`** — the acceptance proof over the real
  WS: submit → running event → settle event → results → dismiss.

## How It Went

The spec (`context-v/specs/Search-Results-Queue-Remote.md`) called this in
three phases and they landed in order. Phase 1 proved out over the live
stack against the Aspen safe target: submit returned in 4ms, the running
and settle events both arrived, `search.results` returned 7 candidates,
dismiss emptied the registry — all green, first run.

The browser drive then walked the spec's named click-path: fire the links
🤖 and the team 🤖 on The Aspen Institute back to back, watch both cards
tick in the rail ("2 in flight"), navigate away and back mid-crawl (cards
still there — server-side registry doing its job), expand the finished
links card into eight kind-tagged candidates, accept the LinkedIn row, and
dismiss through the unreviewed-candidates confirm.

One correction to the spec along the way: it assigned the remote port 3017,
which strategy-curator had already claimed. The remote lives on **:3018**;
the spec has been annotated.

## Under the Hood

- The registry stores the crawl reply verbatim on the entry; `search.list`
  returns cards only (D5 — collapsed cards render without fetching
  results), `search.results` spreads the stored reply on expand.
- Typical durations are hardcoded v1 from live observations (links/streams
  ~90s, team ~200s); a rolling per-target average is the cheap v2.
- Actor attribution now rides through local capabilities too — the
  submit-time didi identity is forwarded into the crawl's NATS request, so
  the async boundary doesn't lose who asked.
- The shell tracks the badge count itself (the rail unmounts when hidden),
  refetching `search.list` on every `search.updated` event.
- TTL sweep: entries older than 24h are dropped hourly; dismissed is the
  normal exit, the sweep catches the abandoned tail.

## What's Next

- Phase 4 hooks `search.progress` beats into the card's reserved progress
  line, jointly with the crawl-traces build (#35).
- The chat door: didi learning `search.submit` so chat-fired crawls land in
  the rail too — one slab edit, deliberately deferred.
- New-remote rule reminder: the rail loads in the shell after the next
  frontend restart (`dev.sh` now lists :3018) and a fresh browser load.

Spec of record: [[Search-Results-Queue-Remote]] · issue #42.
