---
title: "Didi crawl — three targets (links, streams, team members), the relevance brief, and staged team ingest"
lede: >-
  One `organization.crawl` capability over Anthropic's server-side web_search, driven by a per-workspace, operator-editable relevance brief.
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Plan
  - Augment-It
  - Org-Workbench
  - Search-And-Add
  - Didi-Chat
  - Crawl
  - Relevance-Brief
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped same-day in 72cf25d (gh #33). Live-proven: brief round-trip + a 65s Aspen links crawl, 8 correctly-kinded deduped candidates incl. a brief-steered find. Deviations: none of substance — the search-and-add ➕ passes the model's kind/name through addResult (small extension the plan implied), and StagedPeople remounts per-crawl via a keyed block. Chat door is capability-legal only; conversational plumbing stays with the didi-chat plan."
site_uuid: c63cff97-7bd6-4368-a2d9-261931c6b5e1
hex_code: diljfs
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# Didi crawl — the v1.2 build

## Spec reference

Implements [[../specs/Augment-From-DB-Flow]] §v1.2 (v0.1.2.0). Composes with
[[Didi-Chat-In-Org-Workbench-Verify-Team-Page-Into-People-Objects]] (which
keeps the chat-rail context plumbing). Branch: `rebuild/turbo-rsbuild`.

## Decisions (closing the spec's v1.2 open questions, grounded in a three-way code read)

1. **Crawl substrate: Anthropic server-side web_search in prompt-runner** —
   NOT the social-search packs. `prompt-runner` is the LLM gateway
   (workspace never touches the SDK, by invariant `chat.ts:8-10`), and it
   already wires `web_search_20260209` with the `pause_turn` resume loop
   (`request.ts:27-30`, `anthropic.ts:66-70`). One model call composes
   queries, searches, filters by the brief, and returns structured
   candidates — the packs/connectors stay the manual 🔍's substrate. The
   social-search option (7 social packs + firecrawlScrape + Haiku fallback)
   is the documented fallback if model-driven quality disappoints.
2. **Brief storage: server-side, resolver-owned** (shipped ahead of this
   plan): `relevance_briefs` table, `client.brief.get`/`set` capabilities.
   The crawl handler reads the brief itself over NATS (single source of
   truth for button and chat doors); the UI editor is a workbench panel.
3. **Candidate UI: search-and-add crawl mode** for links/streams — the
   Phase-5 scan-mode precedent exactly (`crawl?: boolean` on the envelope, a
   third fire path, same ResultsList/ResultRow, per-row ➕ already routed by
   `verbFor(target)`). Team members do NOT go through search-and-add — they
   stage on the workbench's people reveal with per-row accept
   (no-candidate rows flow: `person.apply` create + `person.affiliate`;
   ambiguous rows open the candidate gate — the didi-chat plan's step 4
   discipline).
4. **Doors:** crawl is a header-level action (the whole list is the
   subject, unlike per-entry scan): AdditiveList gains an optional
   `oncrawl` header button (links + streams lists); PeopleReveal gains a
   "crawl team" header button; chat door = `organization.crawl` added to
   `CHAT_CAPABILITY_NAMES` + a verb-slab entry (focused-org context
   plumbing stays with the didi-chat plan).
5. **Org context is fetched server-side**, not stuffed into envelopes: the
   crawl handler NATS-requests `organization.detail` (name, domains,
   existing list URLs for dedupe) and `client.brief.get`, then prompts.

## Capability contract

`organization.crawl` → `organization.crawl.requested` (prompt-runner),
timeout 300s. Input `{ org_slug, target: 'links'|'streams'|'team', client,
max_results? }`. Replies:

- links/streams: `{ ok, provider: 'didi-crawl', results: ConnectorResult[] }`
  (url/title/content — content carries the model's one-line relevance
  reason; deduped against the org's existing URLs server-side).
- team: `{ ok, people: [{name, role, headline?, linkedin_url?, bio_url?}],
  filtered_note, source_urls[] }` — selection per the brief's people policy
  (default: all major leadership + all team members covering Education &
  Workforce Development and related strategies/topics), with the
  filtered-out count named, never silent.

## Steps

1. **prompt-runner: `crawl.ts`** — `registerCrawlHandler(nc)`: fetch
   `organization.detail` + `client.brief.get` over NATS; per-target system
   prompt (org identity + existing URLs + brief + strict JSON output
   contract); `buildRequest` with `tools:['web_search']`; `runPrompt`;
   tolerant JSON extraction (fence-stripping); dedupe vs existing; reply.
   Register in prompt-runner `server.ts`.
2. **workspace:** capability map + 300s timeout; `organization.crawl` into
   `CHAT_CAPABILITY_NAMES` + a WORKBENCH slab line describing the three
   targets and args.
3. **search-and-add crawl mode:** `crawl?: true` on `SearchRequestDetail`
   (both type mirrors); `crawlSearch` wrapper; `crawlMode` derived + third
   fire path + status bar arm in App.svelte (scan-mode pattern verbatim).
4. **org-workbench doors:** AdditiveList `oncrawl` header prop (🤖);
   OrgCard passes it for links + streams (envelope `{entity, target,
   seed_term:'', crawl:true}`); BriefPanel (header toggle → textarea →
   `client.brief.get/set` wrappers).
5. **Team staging:** PeopleReveal "crawl team" button → `crawlOrg(team)` →
   staged rows (name · role · links) with per-row Accept/skip;
   accept → `person.candidates` → empty: `person.apply`(create) +
   `person.affiliate` (role, source = team-page URL); non-empty: inline
   candidate gate (pick match or create). `filtered_note` rendered under
   the staged section.
6. **Verify:** typechecks + svelte-checks + builds; rebuild prompt-runner,
   workspace, resolver containers; live smoke of `organization.crawl`
   against the Aspen safe target if NATS reachable, else operator
   walk-through: Gates Foundation → crawl links (candidates appear, ➕
   one) → crawl streams → crawl team (staged people per policy) → edit the
   brief and re-crawl to see selection change.
7. Changelog + gh issue close + spec revision note.

## Non-goals (this pass)

- Chat-rail focused-org context and conversational triggering UX — the
  didi-chat plan owns it; this pass only makes the capability chat-legal.
- Headshots/enrichment of staged people (person-enrichment owns).
- Corpus-target crawl (search-and-add's manual flow already covers corpus;
  revisit after the metadata work in the corpus-items issue).
