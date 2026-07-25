---
date_created: 2026-07-25
date_modified: 2026-07-25
title: "The Queue's First Live Evening — Five Operator Findings, Five Same-Night Fixes"
lede: "The search-results rail shipped at dinner and got used in anger by ten. Every rough edge the operator hit — dismissal, concurrency, overflow, a broken drag, an open API-credit tab — was fixed and merged before midnight."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - apps/search-results/src/SearchCard.svelte
  - apps/search-results/src/app.css
  - services/prompt-runner/src/crawl.ts
  - services/prompt-runner/src/request.ts
  - shell/src/App.svelte
  - apps/org-workbench/src/app.css
tags:
  - Search-Results
  - Didi-Crawl
  - Concurrency
  - Cost-Control
  - Shell
---

# The Queue's First Live Evening

## Why Care?

Shipping a feature and *operating* it are different sports. The
search-results queue landed earlier tonight ([[2026-07-24_07_Searches-Become-Async-Jobs-The-Queue-Rail-Lands-Fire-Many-Walk-Away-Triage-On-Arrival|ship note]]),
and within the hour the operator was firing real concurrent searches at
real orgs — which surfaced five things no browser drive had: a missing
per-card dismiss, crawls secretly running single-file, result rows
overflowing the rail, a resize drag that fought its own hover states,
and an API credit balance that kept emptying itself. All five were
diagnosed, fixed, verified live, and merged to `rebuild/turbo-rsbuild`
the same night. This entry is the record of that sweep.

## What's New?

- **Per-card × dismiss.** The header's "clear done" cleared the whole
  queue; dismissing ONE search meant expanding it first. Every card now
  carries a tiny × above its expand caret — one tap. A done card with
  unreviewed candidates flips the × to a `✓?` for four seconds instead
  (the same conscience as the expanded confirm, compressed).
- **Crawls run three wide.** The crawl consumer awaited each NATS
  message inside its loop, so concurrent submissions — the queue's whole
  premise — ran single-file: a batch of five put the last two past the
  caller's 600s ceiling ("timeout", masquerading as a billing error).
  The loop now spawns per message under a slot cap
  (`MAX_CONCURRENT_CRAWLS`, default 3). Measured: an NYT links crawl
  that took 4:35–6:39 serialized landed in 1:14 parallel.
- **Rows fit the rail.** Grid children default to `min-width: auto` and
  refuse to shrink below their content, so one long nowrap title pushed
  cards wider than the rail — cutting off the ➕ entirely. Zeroed down
  the chains; the same disease was then found and cured in the org
  card's people list.
- **The flow resize-drag actually resizes.** The focused-panel edge drag
  computed width as distance-from-stage-centre × 2 — correct only when
  the panel is centred, so first/last flow steps jumped on grab and
  tracked 2× per pixel; mid-drag, the peek overlay's hover-expand fought
  the geometry. Now the edge position maps per-arrangement, the edge
  takes pointer capture, hover is suppressed while resizing, and edges
  only render on sides that border a peek. Verified: pointer at 50/65/80%
  of the stage → panel at exactly 50/65/80%.
- **The burn-rate hole is capped.** The crawl's server-side `web_search`
  tool carried no `max_uses` — a crawl of a huge publisher (NYT) searched
  open-endedly, which is how a same-evening credit top-up drained back to
  "balance too low" within the hour. Crawls now carry
  `CRAWL_MAX_WEB_SEARCHES` (default 8); chat/enrichment calls keep their
  existing behavior.

## Under the Hood

The evening also proved the queue's failure honesty end-to-end: billing
400s landed on cards verbatim with Retry; a workspace restart marked its
stranded search failed-with-retry instead of spinning; a dismissed
running card kept the crawl billing in the background — which is now
[[https://github.com/lossless-group/augment-it/issues/46|gh #46]]
(crawls should get the `prompt.run.cancel` abort treatment so × means
what the operator thinks it means).

Merge trail: PR #43 (queue + hardening) merged clean; stacked PR #45
was auto-closed by GitHub when its base branch merged and was deleted —
reopened as its named successor #47 and merged. Issues #42 and #44
closed by the merges; #46 and #35 (progress traces) are the queue's
open roadmap.

One operating lesson worth keeping: the relevance brief steers crawls
well for entities that fit its frame (funders and operators), but gives
weak purchase on giant general publishers — for those, hand-adding the
two or three known streams beats a model turn. A media-publisher clause
in the brief is the cheap improvement.
