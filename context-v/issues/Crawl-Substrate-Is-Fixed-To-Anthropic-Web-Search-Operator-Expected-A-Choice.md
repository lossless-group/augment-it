---
title: "The crawl's search substrate is fixed to Anthropic web search — the operator expected to choose"
lede: "The manual 🔍 has a provider palette (SearXNG free-first, Tavily, Exa, SerpAPI…); the didi crawl has no dial at all — one Claude turn with Anthropic's server-side web_search, per the crawl plan's Decision 1. The operator assumed the choice would carry over. It should at least be visible, and probably choosable."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Didi-Crawl
  - Search-Providers
  - Prompt-Runner
status: Open · Jotted
---

# The crawl has no provider dial

## Current state (by decision, not accident)

`organization.crawl` = one model turn (CRAWL_MODEL, default
claude-sonnet-4-6) with Anthropic's server-side `web_search` tool — the
model composes and runs its own searches against Anthropic's backend. The
connector registry (SearXNG/Tavily/Exa/SerpAPI/GDELT) never enters this
path; it remains the manual 🔍's substrate with its palette. Per
[[../plans/Didi-Crawl-Three-Targets-Relevance-Brief-And-Staged-Team-Ingest]]
Decision 1, with the packs+Haiku pipeline named as the documented fallback
substrate.

## The gap

1. **Invisibility:** nothing in the crawl UI says what's searching. The
   status bar should at least name the substrate ("didi crawl · Anthropic
   web search · sonnet-4-6") — the provider chip the manual flow already
   has, honestly filled in.
2. **No choice:** the operator expected the palette to carry over. Lost
   with the fixed substrate: the free-first discipline (SearXNG costs
   nothing; Anthropic web search bills per search), per-provider strengths
   (Exa semantic, SerpAPI knowledge-graph), and comparability with manual
   results.

## Directions (jotted, in ascending ambition)

- **Name it** (trivial): surface substrate + model in the crawl bar and in
  the reply's `provider` field (already returns 'didi-crawl' — make it
  'didi-crawl · anthropic-web-search · <model>').
- **Model dial** (cheap): expose CRAWL_MODEL choice per-crawl (sonnet vs
  haiku for cost, opus for hard orgs).
- **Substrate dial** (the real ask): implement the plan's documented
  fallback — a connector-driven crawl mode (packs + Firecrawl + Haiku
  filter vs the brief) — and let the crawl bar choose between
  "Anthropic web search (agentic)" and "connector packs (registry)".
  This is where the palette returns.

## Open questions

- [ ] Does the substrate choice live per-crawl (a chip on the crawl bar) or
  per-workspace (a line in the relevance brief / a workspace setting)?
- [ ] Cost visibility: Anthropic web search bills per search — should the
  crawl reply report how many searches it ran? (Pairs with
  [[Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]].)
