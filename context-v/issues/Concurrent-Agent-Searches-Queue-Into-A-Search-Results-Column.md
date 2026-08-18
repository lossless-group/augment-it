---
title: "Concurrent agent searches queue into a search-results column — fire many, deal with them as they come"
lede: "Agent searches run 60–210s and each one hijacks a single column. Wanted: a rightmost queue where every fired search appends its own card."
date_created: 2026-07-24
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Usability
  - Augment-It
  - Didi-Crawl
  - Search-And-Add
  - Microfrontends
  - Concurrency
status: Resolved · Shipped 2026-07-24 via the queue rail (search-results remote :3018) · Live per-card progress frames + chat/manual-search doors deferred to #35
site_uuid: 2c343ac3-ee06-42ec-b49f-3099b92f8b96
hex_code: 1w5ub7
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
---

# The search-results queue

## The two-part observation (operator, 2026-07-24 evening)

1. **Waiting is blind.** Crawls run 60–210s with one frozen status line —
   no liveness, no progress, no expected wait. Already flagged
   ([[Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]]),
   but the deeper problem is the interaction model, not just the missing
   spinner detail:
2. **One search monopolizes the surface.** The operator should click agent
   search in several places — links here, streams there, a team crawl on a
   third org — and have each land in the **furthest-right column** as its
   own entry, running simultaneously. Serial babysitting of a minutes-long
   operation is the real usability failure.

## The design (operator-specified)

- **Its own microfrontend — `search-results`** — the rightmost column: a
  queue of search cards, newest appended as fired, from ANY door (the 🤖
  buttons, 🔍 manual searches eventually, chat-fired crawls).
- **Collapsed by default.** Each card/row shows: what's searching (target ·
  org), **status** (queued / running / done / failed), **progress**, and
  **how long the wait might be** (live timings exist: links ~90s, team
  147–211s observed — show elapsed vs. typical).
- **Arrival signal.** When results land, the card signals (badge / pulse /
  count) — the operator notices without polling it.
- **Expand to act.** Toggling a card open reveals the results and their
  actions — the per-row ➕ accepts for links/streams, the staged-people
  accept gates for team crawls.
- **Mark complete.** An explicit done action clears the card. The queue is
  the operator's worklist; cards persist until dismissed, so nothing
  silently vanishes and nothing stale masquerades as current.

## What this absorbs and builds on

- **Supersedes [[Search-Column-Holds-Stale-Results-New-Agent-Searches-Dont-Reload-It]]**
  (#36): the reload-vs-stale question dissolves — every search is its own
  card with its own provenance; there is no single column to go stale.
- **Gives #35's progress traces their home**: the per-card progress line is
  where `organization.crawl.progress` frames render.
- **Enabled by the claim protocol** (#41): concurrent minutes-long invokes
  surviving reconnects is the substrate that makes a queue of them viable.
- **Feeds #22** (component library): search cards, result rows, and accept
  gates shared across targets is exactly the component-extraction case.

## Open questions

- [ ] Where does queue state live — the new remote's own runes state
  (lost on remount), localStorage, or workspace frames (survives)? Lean
  workspace-backed: the queue IS operator state worth surviving a refresh.
- [ ] Does the team crawl's staged-people flow move INTO the expanded card,
  or stay on the workbench People section with the card deep-linking to it?
- [ ] Do manual 🔍 searches join the queue too (unifying all search into
  one surface), or only agent searches in v1?
- [ ] Wait estimates: hardcode from observed timings per target, or track a
  rolling per-target average server-side?
