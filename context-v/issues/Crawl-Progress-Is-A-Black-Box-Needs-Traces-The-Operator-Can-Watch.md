---
title: "Crawl progress is a black box — 'crawling the web, this takes a minute…' needs traces the operator can watch"
lede: "A didi crawl is a minute-plus of silence with one static status line. The model is actually narrating as it works — 'searching for Quell Foundation LinkedIn…' — and those traces exist in the response stream today; they just never leave prompt-runner. The operator should watch the agent work, not stare at an ellipsis."
date_created: 2026-07-24
date_modified: 2026-07-24
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
  - Observability
  - Prompt-Runner
status: Open · Jotted
---

# Crawl progress needs visible traces

## The symptom (screenshot-confirmed, 2026-07-24)

Fire a crawl → "didi crawl · identity links · crawling the web — this takes
a minute…" and a disabled "crawling…" button. Then nothing changes for
60–90 seconds. No indication of what didi is searching, how many searches
have run, whether it's stuck, or how close it is. The operator can't tell a
healthy crawl from a hung one — the same live/not-live blindness
[[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]] names,
now on the agentic path where waits are longest.

## The traces already exist

The Anthropic response with server-side web search interleaves the model's
running narration ("I'll search for X…") with `server_tool_use` /
`tool_result` blocks — `prompt-runner`'s `extractText` deliberately SKIPS
past all of it to the final answer (`anthropic.ts` — "the actual answer is
the text AFTER the last non-text block"). The material for a progress feed
is being received and thrown away. What's missing is a channel:

1. **prompt-runner**: run the crawl via the streaming API (or at minimum
   emit per-`pause_turn`-continuation beats), publishing progress frames to
   a NATS subject (`organization.crawl.progress` with a crawl id) — the
   `pack.fan_out.completed` publish + the run/apply `*.completed` events
   are the in-house precedent for fire-and-forget progress publishes.
2. **workspace**: forward those frames to the browser as WS event frames —
   the event-frame machinery (`ServerFrame`/`EventFrame`, job events)
   already exists; crawl progress is a new event kind riding it.
3. **search-and-add (and the chat rail later)**: render a rolling trace
   line under the crawl bar — search queries as they fire, "N candidates so
   far", the narration snippets. Even a heartbeat ("still working ·
   third search") beats the frozen ellipsis.

## Open questions

- [ ] Streaming SDK call vs. coarse beats (per web-search tool_use block vs.
  per pause_turn continuation) — coarse is a fraction of the work and may
  be enough; streaming gives the real "didi is typing" feel.
- [ ] Does the trace persist (part of the crawl's reply, reviewable after)
  or is it ephemeral display only? Lean: last N lines ephemeral, final
  summary line kept.
- [ ] Same channel should serve the team crawl on the workbench and the
  chat door — one progress subject, every surface subscribes.
