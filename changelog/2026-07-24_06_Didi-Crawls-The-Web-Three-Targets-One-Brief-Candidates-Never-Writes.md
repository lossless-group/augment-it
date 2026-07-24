---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "Didi crawls the web — three targets, one relevance brief, candidates never writes"
lede: "The workbench's 🤖 era begins: one organization.crawl capability (Sonnet + Anthropic server-side web search) crawls for relevant identity links, pulse streams, or team members, steered by a per-workspace operator-editable relevance brief — proven live against Aspen in 65 seconds with the brief visibly shaping what came back."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/prompt-runner/src/crawl.ts
  - services/prompt-runner/src/server.ts
  - services/workspace/src/chat.ts
  - services/workspace/src/capabilities.ts
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - apps/search-and-add/src/App.svelte
  - apps/search-and-add/src/lib/search-client.ts
  - apps/search-and-add/src/lib/types.ts
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/App.svelte
  - apps/org-workbench/src/PeopleReveal.svelte
  - apps/org-workbench/src/StagedPeople.svelte
  - apps/org-workbench/src/BriefPanel.svelte
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/lib/types.ts
  - apps/org-workbench/src/app.css
tags:
  - Didi-Crawl
  - Org-Workbench
  - Search-And-Add
  - Relevance-Brief
  - Prompt-Runner
  - Affiliations
---

# Didi crawls the web

## What shipped ([#33](https://github.com/lossless-group/augment-it/issues/33))

The operator's insight driving the whole build: *web-search-equipped agents
get this retrieval shape mostly right, quickly* — so the manual
query-composing 🔍 gains an agentic sibling. One capability,
`organization.crawl`, served by prompt-runner (the LLM gateway): a single
Sonnet turn with Anthropic server-side web search composes the queries,
searches, filters by the relevance brief, and returns **candidates — never
writes**. Three targets:

- **"crawl for relevant identity links"** → 🤖 on the links list → the
  search-and-add rail's new **crawl mode** (scan-mode's twin: no term bar,
  same results list, per-row ➕ — now carrying the model's `kind` into the
  write instead of re-inferring it).
- **"crawl for relevant pulse streams"** → same door; a stream's real title
  ("Today's Credentials") rides the ➕ as its `name`.
- **"crawl for relevant team members"** → 🤖 on People → candidates stage in
  the new `StagedPeople` section: accept runs the candidate check —
  no-match rows flow straight through `person.apply` + `person.affiliate`
  (team-page URL as the observation's source), ambiguous rows open the
  pick-or-create gate. The people-policy filter is never silent
  (`filtered_note` renders under the staged rows).

## The relevance brief

`relevance_briefs` in SurrealDB behind `client.brief.get`/`set` — one prose
document per workspace client carrying the topical scope and the people
policy, edited in place via the workbench header's 📋 panel, loaded
server-side into every crawl so the button door and the (chat-legal, per
`CHAT_CAPABILITY_NAMES`) chat door read the same intent. reach-edu's brief
is seeded with the operator's stated policy: education & workforce
development, all major leadership plus covering team members.

## Proven live

Smoke over NATS against the Aspen safe target: brief upsert + read-back
clean; the links crawl returned in **65 seconds** with 8 correctly-kinded
candidates, all deduped against what the org already had — and one that
only a brief-steered agent would rank: the Education & Society Program's
LinkedIn, tagged "directly relevant to education and workforce development
focus." Candidates only; the canonical layer untouched.

Typechecks and svelte-checks clean across three services and both remotes;
all three service containers rebuilt. Remaining human rung: the operator
walk-through (crawl a thin org's three lists end to end; edit the brief and
watch selection change) — and the chat-rail conversational door rides the
didi-chat team-page plan.
