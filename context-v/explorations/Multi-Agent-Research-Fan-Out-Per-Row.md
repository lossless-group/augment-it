---
title: "Multi-Agent Research Fan-Out Per Row — The Real Shape of Augment-It's Capability Runtime"
lede: "Augment-It's capabilities are not single LLM calls. Each row in a CRM export gets enriched by multiple specialized research agents running in parallel — one fetches social profiles and vanity KPIs (X handle, X followers, LinkedIn), another crawls every linked page on the company's website looking for team changes, press mentions, blog posts, and PDF publications. The capability runtime, the @lossless/in-app-agent transcript shape, and the chat UI all need to handle (rows × agents) fan-out, partial results, heterogeneous latencies, per-agent rate limits, and per-agent caching. The memopop character-cast pattern is the UI surface this maps to."
date_created: 2026-05-18
date_modified: 2026-05-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Exploration
  - Augment-It
  - Multi-Agent
  - Research-Agents
  - Fan-Out
  - Job-Runner
  - Rate-Limiting
  - Character-Cast
status: Draft
---

# Multi-Agent Research Fan-Out Per Row

## The shape I had wrong, the shape it actually is

Earlier framings of augment-it's batch behavior treated it as *"one chat utterance → N LLM calls"* where N = number of rows. That's wrong.

The real shape: for one row, **multiple specialized research agents run in parallel**, each producing its own findings, each using different APIs, each with its own latency profile and rate-limit budget. For a 500-row CSV with four research agents, you have a **2,000-task heterogeneous fan-out** — not a batch of identical LLM calls.

A concrete picture of what's happening to one row when a user says *"enrich the prospects in this list"*:

| Agent | What it does | Backend mechanics | Typical latency |
|---|---|---|---|
| `research.social_profiles` | Find X/LinkedIn/GitHub handles, follower counts, recent post velocity | Public-search + API auth where available | 2–10s |
| `research.web_crawl` | Hit company URL, crawl all internal links to depth N, classify pages | Polite crawler + per-page parser + LLM summarize | 30–180s |
| `research.team_changes` | Identify management / key team-member changes since last touch | Crawl + LLM diff against last-known team | 30–90s |
| `research.press_mentions` | Recent in-press media coverage | News API or web search + dedup + summarize | 10–30s |
| `research.publications` | Recent blog posts, PDF reports, white papers published by the company | Crawl + filter by content-type + LLM summarize | 30–120s |

All five run concurrently for one row. None of them are "an LLM call" in the simple sense — most are *workflows* with a fetch step, a parse step, and an LLM-summarize step. The LLM is one stage of each agent, not the whole agent.

## What this forces on the capability runtime

If the unit of work is "an agent operating on a row," then the in-app-agent's capability runtime needs to support:

### 1. Capabilities-as-agents, not capabilities-as-LLM-calls

The capability list isn't a flat list of LLM verbs. It's a list of named research agents, each with its own internal workflow. From the chat's perspective they all have the same shape — *call this capability with these args, receive a result* — but the agents inside them are domain-specific.

A first-pass capability list for augment-it:

```
records.import({ csv_url | file_blob })            → record_set_id
records.list({ record_set_id, filter?, page? })    → records[]
prompts.list()                                     → templates[]

# Research agents — each one is a workflow, not a single LLM call.
research.social_profiles({ record_id })            → SocialProfilesResult
research.web_crawl({ record_id, depth?: 2 })       → WebFindingsResult
research.team_changes({ record_id })               → TeamChangesResult
research.press_mentions({ record_id, since?: date }) → PressMentionsResult
research.publications({ record_id })               → PublicationsResult

# Orchestration — fan out one row, fan out the whole set.
enrich.row({ record_id, agents: string[] })        → job_id (fans out N agents)
enrich.batch({ record_set_id, agents: string[] })  → job_id (fans out rows × agents)

# Review + distill stages (per [[Why-Response-Reviewer-and-Highlight-Collector-Exist]])
responses.list({ record_id, status? })             → responses[]
highlights.suggest({ response_id, field })         → proposed highlight
highlights.confirm({ highlight_id })               → committed cell value

# Write back (single CRM at a time for v1)
crm.export({ record_set_id, target_crm })          → file
crm.writeback({ record_set_id, target_crm })       → confirmation
```

Notable: `enrich.row` and `enrich.batch` are **orchestration capabilities** — they return immediately with a `job_id` and the actual work happens asynchronously via fan-out. The chat polls or subscribes for progress.

### 2. Job semantics, not request/response

A research-agent invocation is long-running. `enrich.batch` against 500 rows × 5 agents is a 2,500-task job that takes 10+ minutes of wall-clock time. The capability runtime needs to support:

- **Spawn a job** that returns a `job_id` immediately
- **Subscribe to job progress** via SSE — task started, task completed, task failed, task retried
- **Query job status** at any time
- **Cancel a job** mid-flight
- **Resume a job** after a disconnect (memopop already handles SSE backlog replay; same discipline)

The chat surfaces a job-runner view (the equivalent of memopop's `JobView.svelte`) mounted via `display_hint`. The user sees rows progressing through agents in real time.

### 3. Heterogeneous progress events tagged with (row, agent)

Each task progresses through its own stages. A web-crawl might emit *"fetched root", "fetched 12 internal links", "summarized findings"* before it completes. The progress events need at minimum:

```ts
interface ResearchEvent {
  job_id: string;
  record_id: string;          // which row
  agent: string;              // which research agent
  task_id: string;            // composite (record × agent)
  stage: 'queued' | 'started' | 'progress' | 'completed' | 'failed' | 'retried';
  detail?: unknown;           // agent-specific payload
  ts: string;
  seq: number;                // monotonic — for SSE-replay dedup, per FlowState
}
```

The transcript / character-cast UI reads these events to show *"social-profiles-finder finished row 12; web-crawler is on stage 3 of 5 for row 14."*

### 4. Partial-result tolerance

If `research.social_profiles` finishes in 5 seconds and `research.web_crawl` takes 90 seconds, **the row's enrichment is partially complete in between**. The data model has to accept partial fills:

```ts
interface Record {
  id: string;
  base_fields: Record<string, unknown>;       // imported from CSV
  enrichments: Record<string, AgentResult>;   // keyed by agent name
}

interface AgentResult {
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  data?: unknown;                              // agent-specific shape
  highlight_suggestions?: HighlightSuggestion[];
  error?: { message: string; retryable: boolean };
  completed_at?: string;
}
```

The UI shows partial state without blocking. A row card shows three checkmarks and two spinners; users can start reviewing the completed agents' results before the slow ones finish.

### 5. Per-agent rate limits and politeness

Different agents hit different backends. Real constraints to encode:

- X.com / Twitter API: hard rate limits per token, per user, per app
- Web crawler: polite rate per domain (1 req/sec/domain), respect robots.txt, max-depth cap
- News API: monthly quota
- LLM calls inside agents: per-provider rate limits (Anthropic, OpenAI, Perplexity)

Each agent declares its rate-limit profile. The job runner respects them globally — if 200 rows want `research.web_crawl` against the same company (unlikely but possible), it doesn't fire 200 concurrent requests against one domain. Per-agent concurrency caps and per-domain throttles.

### 6. Per-agent caching

A web crawl produces meaningful data. Re-crawling the same site on every batch is wasteful and rate-limit-hostile. Each agent has its own cache:

- **Cache key:** typically the entity being researched (company domain, person LinkedIn URL, X handle)
- **TTL:** per-agent — social profiles can cache for hours; team-change detection wants near-zero TTL or it can't detect changes; press mentions cache for a day
- **Invalidation:** explicit "re-run this agent against this row, ignoring cache"

Caching is at the *agent* layer, not the capability runtime layer. The runtime sees "this capability call took 200ms" without needing to know whether it was a cache hit. Each agent decides.

## How this maps onto the chat UI

This is where memopop's prior art lands directly. Memopop's `apps/memopop-native/src/lib/components/CharacterRow.svelte` is exactly the surface this needs.

The mapping:

- **Memopop's characters** (researcher, scorecard navigator, writer, etc.) → **augment-it's research agents** (social-profiles-finder, web-crawler, team-changes-detector, etc.)
- **Memopop's per-memo agent activity** → **augment-it's per-row agent activity, multiplied across rows**
- **Memopop's single job-runner view (`JobView.svelte`)** → **augment-it's batch job-runner showing a matrix of (row × agent) status**

The augment-it batch view is essentially memopop's job view crossed with a spreadsheet — rows down, agents across, cells showing per-(row × agent) status. The character cast still names the agents currently active; the difference is augment-it can have a hundred instances of the "social-profiles-finder" character running at once.

## Anti-patterns to avoid

- **Mega-prompt mixing all research into one LLM call.** Loses parallelism, loses specialization, loses fault-tolerance per agent, and gives you one giant slow response that's hard to attribute findings to specific sources.
- **Treating each agent as a single LLM call.** Most agents are fetch + parse + LLM-summarize workflows. Modeling them as one LLM call loses the per-stage progress events and the rate-limit boundary at the fetch layer.
- **Sequential agents per row.** Fan-out is the whole point. `enrich.row` invokes its declared agents in parallel; only the orchestration layer waits for all-to-finish.
- **No per-agent caching.** Re-crawls the world on every batch. Burns rate limits. Slow.
- **Global rate-limit budget** rather than per-agent / per-backend. Different agents share no budget; conflating them creates phantom contention.
- **Failing the whole row when one agent fails.** Partial results are a feature. A failed web-crawl shouldn't prevent the social-profiles result from being committed. The row's enrichment is "incomplete," not "failed."

## What this means for next steps

1. **The capability runtime in `@lossless/in-app-agent`** needs job semantics (`spawn → poll → SSE → cancel → resume`) before augment-it can do anything useful. Whether this lives in the agent package or in a per-app sidecar that the agent talks to is an open question, but the *contract* lives in the agent package.

2. **The chat UI's character-cast pattern** is shared work between augment-it and memopop. The shared component for "named characters working concurrently" probably belongs in `@lossless/in-app-agent` itself.

3. **Per-agent backend implementation** is augment-it's domain. Each agent is its own small package (probably `packages/shared-services/research-agents/{social-profiles,web-crawl,team-changes,press-mentions,publications}/`), each implementing a typed `Agent` interface the runtime knows how to invoke.

4. **The batch job-runner remote** is its own federated microfrontend, mounted by `enrich.batch`'s display hint. New work — wasn't in any of the prior implementations.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Federation-and-Bundler-Decision]]
- [[Why-Response-Reviewer-and-Highlight-Collector-Exist]]
- [[Remote-Mount-Contract-for-In-App-Agent]] (ai-labs)
- [[In-App-Chat-as-Agent-Surface-for-Client-Apps]] (ai-labs)
- `memopop-ai/context-v/specs/Character-Cast-for-Live-Agent-Indication.md` — the UI surface this maps to
- `memopop-ai/apps/memopop-native/src/lib/components/CharacterRow.svelte` — working implementation
- `memopop-ai/apps/memopop-native/src/lib/components/JobView.svelte` — working job-runner pattern
