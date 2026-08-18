---
title: "In-App Chat v0.0.1 for Augment-It — The Prompt-Drafting Triad as the Demo Affordance"
lede: >-
  Gated enhancement made conversational: `prompts.draft` → `improve` → `apply`, with postconditions that check what the prompt promised.
date_created: 2026-05-22
date_modified: 2026-06-03
date_completed: 2026-05-23
revisions:
  - 2026-05-22 — Replaced `corpus.search` (no corpus to query yet) with the `prompts.draft → improve → apply` triad as the lead demo affordance. Adapter-shape coverage drops from three to two; that's honest and called out.
  - 2026-05-25 — Status swept to Shipped; v0.0.1 landed in commit 9ac3a50 per changelog 2026-05-23_01. McpCapability + SkillCapability still deferred to v0.0.2 successor.
  - 2026-06-03 — Appended §"Industry context — how command + skill registration works across the ecosystem" (0.0.0.4). Survey of the three registration sources, two dispatch purposes, and the description-driven dispatch pattern across MCP / Discord / OpenAI tools / Claude Code skills. Maps the existing CAPABILITY_TO_SUBJECT + CHAT_TOOLS substrate to MCP-compatible exposure. Informs v0.0.2's McpCapability + SkillCapability sequencing without changing the shipped v0.0.1 contract.
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.4
tags:
  - Plan
  - Augment-It
  - In-App-Agent-Chat
  - Walking-Skeleton
  - Prompt-Drafting-Triad
  - Gated-Enhancement
  - Client-Demo
  - Strict-Alignment
status: Shipped
site_uuid: c923b898-4a8d-47d0-9670-b86718f99eef
hex_code: a782lv
date_authored_initial_draft: 2026-05-22
date_authored_current_draft: 2026-05-22
---

# In-App Chat v0.0.1 for Augment-It

## What this plan is for

A demo-shaped first slice of the in-app chat surface, scoped to **augment-it only**, sized for the upcoming client meeting on fundraising pipeline development. The demo's core affordance: **the chat helps the user author the prompt that drives their enrichment run** — drafting it from a stated goal, improving it from feedback, then explicitly applying it to a scope of records. That's the gated-enhancement pattern from [[Per-App-Workspace-Conventions]] §"Naming convention — entity.verb" rendered conversationally.

The slice exercises the patterns in [[Chat-As-Verb-Surface-Patterns]] enough to learn whether the conventions hold under one real workflow before generalizing. It does **not** exercise every adapter shape (Pattern 1) — McpCapability and SkillCapability are deferred. That's a deliberate, called-out trade: a smaller slice with a stronger client-meeting story beats a wider slice with a weaker one.

## Prerequisites — what has to be true before this lands

- [[Augment-It-Workspace-Walking-Skeleton]] is at "row-store loads two CSVs and the workspace state reflects them" — the workspace package + Workspace Service + row-store + NATS bus all exist and the browser sees real data.
- [[Prompt-Template-Manager-Walking-Skeleton]] (the augment-it prompt-template work) has a usable template-storage shape we can write `prompts.*` capabilities against — even if its own UI isn't done. Worst case: a JSON file under `services/prompts/data/` is enough.
- The enrichment script invoked by `prompts.apply` accepts a prompt-template path (or inline string) plus a record-set ID + scope. If it doesn't yet, wiring that parameter is a Phase-0 task below.
- An Anthropic API key in `~/.secrets`, exported in the chat-service container's environment.

If any of the above is missing the day-of, **stop and do that first** — the chat with nothing to drive is not a demo.

## Where in augment-it this lives

```
augment-it/
├── packages/
│   └── workspace/                          # @augment-it/workspace (exists)
│       └── src/
│           ├── state.ts
│           ├── capabilities/               # NEW — four capability handlers
│           │   ├── records-list.ts         # TS handler
│           │   ├── prompts-draft.ts        # TS handler (calls model server-side)
│           │   ├── prompts-improve.ts      # TS handler (calls model server-side)
│           │   └── prompts-apply.ts        # ScriptCapability with postconditions
│           ├── entities/
│           │   └── prompts.ts              # NEW — the Prompt entity + draft-versioning
│           ├── anticipation.ts             # NEW — Pattern 3 flat map
│           └── prompts/
│               └── system.md               # NEW — the four slabs (Pattern 5)
├── apps/
│   └── chat/                               # NEW — federation remote for the chat surface
│       └── src/
│           ├── ChatSurface.svelte
│           ├── CharacterCastRow.svelte     # consumes capability lifecycle events
│           ├── ResponseModeRenderer.svelte # branches on answer | propose | invoke
│           └── PromptDraftPanel.svelte     # renders a prompts.draft / improve result inline
└── services/
    └── chat/                               # NEW — Node/Fastify; the model proxy
        └── src/
            ├── server.ts                   # SSE endpoint
            ├── prompt.ts                   # assembles the four slabs with cache breakpoints
            ├── dispatch.ts                 # wires LLM tool calls → workspace.invoke()
            └── lifecycle.ts                # emits capability.* events onto NATS
```

The chat service is a **fifth container** in the compose file (workspace-service + row-store + ingest + nats + chat-service). Demo-audience caveat from [[Augment-It-Workspace-Walking-Skeleton]] applies: every container must have a legible reason. The chat service exists because the Anthropic API key never sits in the browser, and the prompt-slab assembly + cache-breakpoint emission is server-side logic. Two legible reasons.

## The Prompt entity (new, lives in `@augment-it/workspace`)

```ts
interface Prompt {
  id: string;                      // 'prompt_a1b2c3...'
  goal: string;                    // the user's stated intent in their own words
  body: string;                    // the actual prompt template, with {{column}} placeholders
  expected_outputs: string[];      // column names this prompt should populate
  derived_from: string | null;     // parent prompt_id if this is an `improve` result
  derivation_feedback?: string;    // free-text feedback that produced this version
  status: 'draft' | 'applied' | 'archived';
  record_set_context?: {           // the columns the prompt was drafted against
    record_set_id: string;
    sample_size: number;
    columns: string[];
  };
  created_at: number;
}
```

`improve` creates a new Prompt with `derived_from` set, not an in-place edit. That preserves the iteration history and matches the "improve is the refinement loop, not a direct edit" distinction in the [[Per-App-Workspace-Conventions]] verb table.

`apply` updates the source prompt's `status` to `'applied'` and writes the application result against the record set (column-by-column enrichment values).

## Decisions to settle before coding (15 min)

1. **Alignment mode.** `strict` for v0.0.1 (per [[Chat-As-Verb-Surface-Patterns]] Pattern 4 — propose-by-default suits the client meeting).
2. **Model.** `claude-sonnet-4-6` for v0.0.1. Sonnet's latency suits the drafting-refinement loop; Opus is reserved for the actual enrichment inside `prompts.apply` (overkill for verb routing, right-sized for the per-record extraction).
3. **System-prompt static spine — first cut.** Draft to `packages/workspace/src/prompts/system.md`. Three paragraphs: "you operate inside augment-it", the three response modes from Pattern 4, the strict-alignment instruction, and one specific instruction that **`prompts.improve` is for iterating drafts, not for applying them** — the chat must not silently switch from refinement to execution.
4. **Prompt storage location.** A JSON file at `services/prompts/data/prompts.json` for v0.0.1; libSQL once the prompt-template-manager catches up. The walking skeleton's persistence discipline applies (D3 from the workspace walking skeleton's pre-flight decisions).
5. **Enrichment script wiring.** Confirm which entry under `services/ingest/` or `services/enrich/` accepts a prompt-template parameter today. If none do, this becomes a Phase 0 task — add a `--prompt-template` flag to the existing enrichment runner.

## Phase 0 — Wire the enrichment script's prompt parameter (~30 min, only if needed)

If the existing enrichment runner can't accept a prompt template by reference, add a `--prompt-template <path>` flag that reads the JSON, substitutes `{{column}}` placeholders from each record's columns, and dispatches per-record to the model. This is augmenting an existing script, not building a new one — keep the change small.

Done-when: running the script manually with `--prompt-template path/to/prompt.json --record-set-id demo-1 --scope all` enriches the record set and exits 0.

## Phase 1 — Four capability handlers (~90 min)

Goal: the four capabilities exist with real implementations, and a unit test against each invokes through the workspace.

### 1a. `records.list` — TS handler (~10 min)

Same as the prior plan version — reads from row-store via NATS, returns `{ records, display_hint: { mount: 'record_list' } }`. Lightweight; supports the demo's "show me the result" beat.

### 1b. `prompts.draft` — TS handler (~30 min)

```ts
export const promptsDraft: Capability<DraftArgs, { prompt: Prompt }> = {
  name: 'prompts.draft',
  description: 'Draft a prompt template from a user goal + a sample of the record set columns. Returns an editable Prompt entity, not a side effect.',
  args_schema: z.object({
    goal: z.string().min(8),
    record_set_id: z.string(),
    expected_outputs: z.array(z.string()).default([]),
  }),
  required_tier: 'user',
  requires_user_confirmation: false,        // drafts are inert — no real records change
  handler: async (args, ctx) => {
    const sample = await ctx.workspace.rowStore.sample(args.record_set_id, 5);
    const columns = Object.keys(sample[0] ?? {});
    const draftBody = await draftPromptViaModel({         // server-side LLM call
      goal: args.goal,
      columns,
      sampleRows: sample,
      expectedOutputs: args.expected_outputs,
    });
    const prompt = await ctx.workspace.prompts.save({
      goal: args.goal,
      body: draftBody,
      expected_outputs: args.expected_outputs,
      derived_from: null,
      status: 'draft',
      record_set_context: { record_set_id: args.record_set_id, sample_size: sample.length, columns },
    });
    return { data: { prompt }, display_hint: { mount: 'prompt_draft', props: { promptId: prompt.id }, layout: 'inline' } };
  },
};
```

The `display_hint.mount: 'prompt_draft'` is a new `activeView` variant the chat surface renders inline (the `PromptDraftPanel.svelte` from the file tree above). Critical UX point: the draft shows up **inside the chat conversation**, not as a side-panel — the user sees the draft as a turn in the dialog and reacts to it conversationally.

Done-when: from a chat turn, typing *"Draft a prompt to find each founder's LinkedIn URL and current role from this list of companies"* triggers `prompts.draft`, the draft body renders in the chat, and the prompt is persisted.

### 1c. `prompts.improve` — TS handler (~20 min)

```ts
export const promptsImprove: Capability<ImproveArgs, { prompt: Prompt }> = {
  name: 'prompts.improve',
  description: "Given an existing draft prompt and user feedback, produce a refined version. Does NOT apply the prompt to records — apply is a separate verb.",
  args_schema: z.object({
    prompt_id: z.string(),
    feedback: z.string().min(4),
  }),
  required_tier: 'user',
  requires_user_confirmation: false,
  handler: async (args, ctx) => {
    const parent = await ctx.workspace.prompts.get(args.prompt_id);
    const refinedBody = await improvePromptViaModel({ parent, feedback: args.feedback });
    const refined = await ctx.workspace.prompts.save({
      goal: parent.goal,
      body: refinedBody,
      expected_outputs: parent.expected_outputs,
      derived_from: parent.id,
      derivation_feedback: args.feedback,
      status: 'draft',
      record_set_context: parent.record_set_context,
    });
    return { data: { prompt: refined }, display_hint: { mount: 'prompt_draft', props: { promptId: refined.id }, layout: 'inline' } };
  },
};
```

Done-when: an existing draft + the feedback string *"also extract the year the company was founded"* produces a refined Prompt that mentions the founding year in its body, linked back to the parent via `derived_from`.

### 1d. `prompts.apply` — ScriptCapability with postconditions (~30 min)

```ts
export const promptsApply: Capability<ApplyArgs, { record_set_id: string; rows_enriched: number; columns_added: string[] }> = {
  name: 'prompts.apply',
  description: 'Bind a drafted prompt to a record set scope and run the enrichment. This is the only verb that mutates the record set; draft and improve do not.',
  args_schema: z.object({
    prompt_id: z.string(),
    record_set_id: z.string(),
    scope: z.enum(['all', 'unscored', 'selection']),
    selection?: z.array(z.string()).optional(),
  }),
  required_tier: 'user',
  requires_user_confirmation: false,        // demo-friendly; v0.0.2 will gate this for non-trivial scopes
  command: 'pnpm --filter @augment-it/services-enrich run apply -- --prompt {{prompt_id}} --record-set {{record_set_id}} --scope {{scope}}',
  cwd: '.',
  expected_effect: {
    description: 'The expected_outputs columns are populated on every in-scope record; the prompt status flips to applied.',
    postconditions: [
      { kind: 'exit_code', equals: 0 },
      { kind: 'row_count_change', entity: 'enrichments', op: '>=', value: 1 },
      { kind: 'stdout_matches', pattern: 'rows_enriched=\\d+', mode: 'must' },
      { kind: 'stdout_matches', pattern: 'rows_enriched=0', mode: 'must_not' },
    ],
  },
  handler: 'script',
};
```

The two `stdout_matches` postconditions together encode "we got an explicit count, and it wasn't zero." A `rows_enriched=0` outcome is a postcondition violation — it means the script ran but the prompt produced nothing usable, which is exactly the failure shape the gated-enhancement pattern is meant to catch.

Done-when: invoking `prompts.apply` with a real draft + a small record set completes, the postconditions evaluate, and a deliberately-broken prompt (e.g., one that asks for a column that doesn't fit the data) emits `capability.quality_violation` with the failing postcondition named.

## Phase 2 — Anticipation map (~10 min)

In `packages/workspace/src/anticipation.ts`. Four entries for v0.0.1, all keyed off `record_list`:

```ts
export const anticipation: Record<AnticipationKey, Suggestion[]> = {
  'record_list::none': [
    { capability: 'prompts.draft',   hint: 'Draft a prompt to enrich these records.' },
    { capability: 'records.list',    hint: 'Preview the rows you have to work with.' },
  ],
  'record_list::prompts.draft': [
    { capability: 'prompts.improve', hint: 'Refine the draft with feedback.' },
    { capability: 'prompts.apply',   hint: 'Run this prompt against the record set.' },
  ],
  'record_list::prompts.improve': [
    { capability: 'prompts.improve', hint: 'Refine further.' },
    { capability: 'prompts.apply',   hint: 'Run this version.' },
  ],
  'record_list::prompts.apply': [
    { capability: 'records.list',    hint: 'See the enriched records.' },
    { capability: 'prompts.draft',   hint: 'Draft another prompt for a different column.' },
  ],
};
```

That map *is* the demo arc, rendered as data. The fact that the same screen with different recent verbs suggests different next steps is the "anticipation" pattern doing visible work.

Done-when: after each capability completes, the chat surface renders the matching suggestions as clickable proposals (Pattern 4's `propose` mode in UI).

## Phase 3 — Chat service + four-slab prompt (~75 min)

`services/chat/` is a new container. Node/Fastify, one route: `POST /api/agent/chat` streaming SSE.

### Prompt assembly (Pattern 5)

Same shape as the prior plan: static spine, capability schemas, active skills (empty in v0.0.1), per-org reminders (empty in v0.0.1), then suggestions + thread + user message uncached. Cache breakpoints between each cacheable slab.

The new wrinkle: the static spine for v0.0.1 must include **one explicit instruction** that `prompts.improve` is for iterating drafts, not for applying them. Without that line, the model will sometimes "improve and apply" in one turn, which destroys the gating discipline. Worth a sentence; cheap insurance.

### Dispatch (Pattern 4)

Same three intents — `answer` / `propose` / `invoke`. The dispatcher branches identically to the prior version of this plan. The novel thing is that `prompts.draft` and `prompts.improve` return prompts that **render inline in the chat** (via `display_hint.layout: 'inline'`), so the conversation feels like a drafting session, not a sequence of disconnected tool calls.

Done-when: each mode can be triggered manually; a draft renders inline; the user can react to it with another chat message that triggers `prompts.improve`.

## Phase 4 — Chat surface (~60 min)

`apps/chat/` is a new federation remote, Svelte 5, mounts as a panel in the augment-it shell (Configuration A from [[Slides_Anatomy-of-the-In-App-Agent-Shell]] — chat-as-primary).

Four components:

- `ChatSurface.svelte` — message list + composer.
- `CharacterCastRow.svelte` — subscribes to `workspace.jobEvents`, renders one chip per open `invocation_id`.
- `ResponseModeRenderer.svelte` — branches on `answer` | `propose` | `invoke` SSE events.
- `PromptDraftPanel.svelte` — renders a `prompt_draft` `activeView` inline as part of a chat turn (not in a side panel). Shows the prompt body in a readable block, with affordances to "Refine this" (triggers `prompts.improve` proposal) and "Run this" (triggers `prompts.apply` proposal). Both affordances go through `propose`, not direct `invoke` — the user clicks once more to confirm.

Done-when: open augment-it, see chat panel, type a goal, get a draft rendered inline, click "Refine this," type feedback, get a new draft inline, click "Run this," watch character-cast row fire as enrichment runs, then see the suggested `records.list` to view results.

## Phase 5 — End-to-end demo rehearsal (~30 min)

The exact path the client meeting will use. Pipeline: a CSV of 47 companies the client is considering for fundraising outreach.

1. Open augment-it. Workspace already has the CSV loaded from startup. `activeView = record_list`.
2. Chat panel shows: *"Draft a prompt to enrich these records."* and *"Preview the rows you have to work with."*
3. Type: *"I want to find each company's founder, their LinkedIn URL, and the year the company was founded."* → `prompts.draft` invokes → draft renders inline in the chat as a readable block: *"For each company in {{record_set}}, find the founder's name, their LinkedIn URL, and the year of incorporation. Use the company's domain in {{website}} as your primary search anchor..."*
4. Type: *"Also flag which ones are SaaS — that's the segment we care about."* → `prompts.improve` invokes → new draft renders inline, now including the SaaS classification field. `derived_from` links to the parent.
5. Click "Run this." → proposal renders: *"Apply this prompt to all 47 records?"* → click Accept → `prompts.apply` invokes → character-cast row shows one chip ("Enrichment Agent — 12 of 47..."). Postconditions check at the end; all pass.
6. Anticipation suggests: *"See the enriched records."* → click → `records.list` invokes → records render with the new columns populated.

Total demo: ~3–4 minutes including narration. Two adapter shapes exercised (TS + Script), four capabilities, the anticipation map fired three times, postconditions checked, and — critically — the client saw the chat **help author the prompt** rather than just execute on one.

Run this rehearsal **end-to-end at least three times** before the client meeting. Watch for: (a) the model trying to skip from `improve` straight to enrichment without an explicit `apply` (the static-spine instruction should prevent this; rehearsal verifies), (b) the postcondition firing on a deliberately-bad prompt, (c) the inline draft rendering legibly.

## Phase 6 — Stop and write down what hurt (~15 min, mandatory)

Append a `## v0.0.1 Session Notes` section to *this plan file* covering:

- Where the blueprint patterns didn't match reality (edit [[Chat-As-Verb-Surface-Patterns]] same-session if so).
- Whether prompt-cache headers actually fired (`cache_read_tokens > 0` on the second turn).
- Whether the postcondition check caught anything real or was just decoration.
- Whether `strict` alignment was right for the demo, or whether mid-demo it felt sluggish.
- Whether `improve` ever silently mutated records (it shouldn't; verify).
- The first thing v0.0.2 should attack. Likely candidates: McpCapability (firecrawl or tavily for live crawl during apply), SkillCapability (wrap `crawl-fetch-ingest`), mutate-with-confirmation gating for non-trivial `apply` scopes, the `reminders.*` and `cache.*` capabilities once memory-layers reads land.

## Out of scope (deliberate, called out)

- **`corpus.search` and McpCapability adapter.** No corpus exists for augment-it yet. v0.0.2 likely brings firecrawl or tavily as the first MCP wrap — they fit the fundraising-pipeline enrichment use case (live company-page crawls during `prompts.apply`).
- **SkillCapability adapter.** No skill is wrapped in v0.0.1. v0.0.2 candidate: wrap `crawl-fetch-ingest` so the chat can plan an ingestion run, then `prompts.apply` executes it.
- **BYOK.** The chat service uses the org's Anthropic key. UI for user-provided keys is v0.0.2+.
- **Tauri.** Web only.
- **Mutate-with-confirmation gating.** `prompts.apply` runs without an explicit confirm step for v0.0.1 because the demo arc *is* the confirmation (the user has to click "Run this"). For larger scopes or non-demo use, v0.0.2 adds the preview/accept loop.
- **Per-organization reminders + AI cache (`reminders.*`, `cache.*`).** Needs the Neo / Letta / mem0 reads from the memory-layers study first.
- **Character-cast personification per capability.** v0.0.1 uses a single generic "Enrichment Agent" character. Per-verb characters land in v0.0.2.
- **The shared `@lossless/in-app-agent` package.** Memopop adopts the patterns first; extraction after the second app, not the first.

## Pre-flight checklist (30 min before the demo)

- [ ] `docker compose up` brings up workspace-service + row-store + ingest + nats + chat-service cleanly.
- [ ] Browser loads augment-it shell at the expected URL/port (avoid :3000 per [[project_user_port_3000_open_webui]]).
- [ ] Chat panel renders; the empty-state suggests `prompts.draft` and `records.list`.
- [ ] A test "draft a prompt to extract X" message produces an inline draft.
- [ ] A follow-up "also extract Y" produces a refined draft with `derived_from` set.
- [ ] A test `prompts.apply` against a 3-record subset enriches all three and postconditions pass.
- [ ] A deliberately-corrupted prompt (asks for an impossible column) triggers `capability.quality_violation`.
- [ ] The demo CSV is at the path the script expects; the 47-record file loads cleanly.
- [ ] The system prompt's static spine has been read once aloud — the model's first turn is more legible if the spine doesn't sound like a robot wrote it.

## If the session runs short

Priority order:

1. **Phase 1d (`prompts.apply` with postconditions) must finish.** Without it, the demo arc has no climax and the quality-monitoring story disappears.
2. **Phase 4's `PromptDraftPanel.svelte`** is the *visible* product. Cutting it cuts the "chat helps me draft a prompt" beat. Keep it even if other UI components stub out.
3. **Phase 5 rehearsal is non-negotiable.** Cut Phase 6 write-up time before cutting rehearsal time.
4. **Phase 3's cache breakpoints** can ship with empty slabs 3 and 4 (active skills, reminders) — restructuring later is worse than scaffolding the empty slots now.
5. **Phase 1c (`prompts.improve`)** can degrade to "the user re-runs `prompts.draft` with a longer goal" if time is brutal. The arc weakens but doesn't die.

## Related artifacts to create or update during the session

- [ ] `augment-it/packages/workspace/src/prompts/system.md` — first cut of the static spine, including the *improve-doesn't-apply* instruction.
- [ ] `augment-it/packages/workspace/src/entities/prompts.ts` — the Prompt entity + draft-versioning.
- [ ] `augment-it/services/chat/` scaffolded with the Fastify SSE route.
- [ ] `augment-it/apps/chat/` scaffolded as a federation remote with the four components.
- [ ] `augment-it/docker-compose.yml` extended with the `chat-service` container.
- [ ] `augment-it/changelog/2026-05-23_In-App-Chat-v0-0-1.md` — at end of session, per [[changelog-conventions]].
- [ ] Append the `## v0.0.1 Session Notes` section to this file (Phase 6).
- [ ] If anything in [[Chat-As-Verb-Surface-Patterns]] or [[Per-App-Workspace-Conventions]] proved wrong, bump same-session.

## Pre-rehearsal implementation notes (2026-05-22)

The plan was authored before walking the augment-it tree; recon during
implementation surfaced four things worth recording. Captured here in
advance of Phase 6 so the post-rehearsal write-up only adds what hurts
at demo time.

### Substrate was further along than the plan assumed

Augment-it already had: `services/prompt-store` (with the PromptTemplate
entity, NATS handlers, CRUD), `services/prompt-runner` (the LLM gateway —
`anthropic.ts` carries a comment that **it is the ONLY file that sends
LLM requests**), `services/workspace` (the dispatch surface with
`CAPABILITY_TO_SUBJECT`), and `packages/workspace` (Svelte 5 singleton,
adapter, transport, types). The plan's Phase 0 ("wire prompt parameter
into the enrichment runner") was already done — `prompt.run` exists.

### The LLM-gateway invariant changed the chat service architecture

Plan called for a new `services/chat/` container with its own Anthropic
call. The `anthropic.ts` comment makes "only one container holds the API
key" a security invariant, not just a convention. Respecting it: no new
container. Browser → workspace WebSocket → workspace assembles the
four-slab prompt → publishes `chat.turn.requested` to NATS → prompt-runner
makes the SDK call → returns the tool_use block → workspace translates
to a `ChatResponseFrame` → browser. Container count stays at the existing
seven backend services.

### Adapter-shape coverage tightened from "two of four" to "one of four"

ScriptCapability doesn't fit augment-it's substrate — services are
NATS-addressable, not shell-invocable. McpCapability and SkillCapability
were already deferred. All four v0.0.1 capabilities (records.list,
prompt.draft, prompt.improve, prompt.apply) are TS handlers. The
blueprint's full Pattern 1 (four adapter shapes) is NOT proven by v0.0.1;
the gated-enhancement triad is. v0.0.2 brings the other three adapter
shapes via firecrawl/tavily MCP wrap, a SkillCapability wrap of
`crawl-fetch-ingest`, and a real ScriptCapability if any new service
warrants it.

Postconditions still ship — at the workspace-reply-evaluation layer in
`services/prompt-runner/src/apply.ts`, not at a shell-process layer. Same
"monitor quality of command execution and output" story, different
mechanics.

### What changed in the existing codebase

| Layer | New | Modified |
|---|---|---|
| `services/prompt-store/src/store.ts` | `createDraft`, `cloneAsDraft`, `markApplied`; `PromptStatus`, `RecordSetContext` types | `PromptTemplate` (optional draft-versioning fields); `load` backfills `status='applied'` for existing prompts |
| `services/prompt-store/src/handlers.ts` | Three subjects: `prompt.draft.save.requested`, `prompt.draft.improve.save.requested`, `prompt.mark_applied.requested` | — |
| `services/prompt-runner/src/drafter.ts` | New file — `draftPrompt`, `improvePrompt` (LLM calls + persistence via NATS) | — |
| `services/prompt-runner/src/apply.ts` | New file — `applyPrompt` (wraps `runPromptAgainstRecordSet` + postcondition eval + status flip) | — |
| `services/prompt-runner/src/chat-turn.ts` | New file — `registerChatTurnHandler` (the LLM call for chat verb routing) | — |
| `services/prompt-runner/src/server.ts` | — | Subscribed to four new subjects: `prompt.draft.requested`, `prompt.improve.requested`, `prompt.apply.requested`, `chat.turn.requested` |
| `services/workspace/src/capabilities.ts` | — | Three new entries in `CAPABILITY_TO_SUBJECT` (`prompt.draft`, `prompt.improve`, `prompt.apply`) + matching timeouts |
| `services/workspace/src/chat.ts` | New file — four-slab prompt assembly, `CHAT_TOOLS`, `dispatchChatTurn` | — |
| `services/workspace/src/ws.ts` | — | Handles new `chat_turn` ClientFrame; emits `chat_response` / `chat_error` ServerFrame |
| `packages/workspace/src/types.ts` | `ChatTurnFrame`, `ChatResponseFrame`, `ChatErrorFrame`, `ChatProposal`, `ChatToolCall`, `ChatResponseMode` | `ClientFrame` and `ServerFrame` unions expanded |
| `packages/workspace/src/transport.ts` | `chatTurn()` method; `chatPending` map | — |
| `packages/workspace/src/state.svelte.ts` | `chatTurn()` method; `last_capability` field | `invoke()` updates `last_capability` |
| `packages/workspace/src/anticipation.ts` | New file — flat lookup map + `suggest()` | — |
| `packages/workspace/src/index.ts` | Exports for `suggest`, `Suggestion`, all chat-related types | — |
| `apps/chat/` | New federation remote (port 3006) — `App.svelte`, `ChatSurface.svelte`, `CharacterCastRow.svelte`, `ResponseModeRenderer.svelte`, `PromptDraftPanel.svelte`, `chat-state.svelte.ts`, `mount.ts`, `index.ts`, `app.css`, `package.json`, `rsbuild.config.ts`, `tsconfig.json` | — |
| `shell/rsbuild.config.ts` | — | `chat` added to `remotes` map |
| `shell/src/remotes.ts` | — | `chat` REMOTES entry |
| `scripts/dev.sh` | — | Frontend announce message lists all six dev URLs |

### What Phase 6 (the actual rehearsal) needs to confirm

- [ ] `./scripts/dev.sh up` brings up backend + frontend cleanly. (Note: no new container — the chat surface ships as a federation remote at :3006. Backend changes are additions to existing prompt-runner + workspace containers, picked up on `docker compose up --build`.)
- [ ] `pnpm install` succeeded at the augment-it root — confirm the chat dev server starts at :3006 and the shell at :3100 sees the new remote in its picker.
- [ ] A test message in the chat panel produces any of the three response modes. (If the model insists on `chat_answer` for everything, the static spine in `services/workspace/src/chat.ts` needs sharper "prefer chat_propose" framing.)
- [ ] A `prompt.draft` proposal accepted by clicking "Run this" lands a draft visibly inline (the PromptDraftPanel rendering).
- [ ] A draft accepted via "Refine this" + a feedback string produces a refined draft linked via `derived_from`.
- [ ] A draft "Run this" produces a `prompt.apply` invocation that completes; postconditions evaluate; status flips to `applied`.
- [ ] Prompt-cache headers fire on the second turn (`cache_read_tokens > 0` visible in prompt-runner logs).
- [ ] Anticipation pills update after each capability completes — `record_set::prompt.draft` shows the improve+apply suggestions, etc.

If any of those fail, edit this section in place with what happened, then add a Session Notes section below capturing the cache-hit ratio and any fit/finish to clean before showing a client.

## Industry context — how command + skill registration works across the ecosystem

Appended 2026-06-03 while planning v0.0.2's McpCapability + SkillCapability
adapters. Captures the framework so the v0.0.2 work has a clear target and
augment-it's existing registry pattern slots into the broader ecosystem
without re-discovering the conventions.

### Two distinct dispatch purposes (often conflated)

1. **Human-typed shortcuts** — `/help`, `/entity-pulse`, `/voice-of-entity`.
   Autocomplete on `/`, dispatched by exact name match. The human picks the
   verb; the system runs it. Examples: Discord slash commands, Slack
   slash commands, Telegram `setMyCommands`, Claude Code commands at
   `~/.claude/commands/<name>.md`, Continue.dev's slash-command JSON.
2. **LLM-invoked tools / skills** — the model decides which to call from
   the *description*. The human never types the name; they describe a
   goal in natural language and the model routes. Examples: Anthropic
   tool use (`tool_use` block), OpenAI function calling, MCP `tools/list`,
   LangChain `@tool` decorator, Claude Code skills (description IS the
   routing logic).

Some systems do both (Claude Code: slash commands AND skills, separate
trees). Most pick one and force-fit the other. Augment-It's existing
shape is **LLM-invoked-with-proposal-gate** — the model picks the verb
via the four-slab prompt's `CHAT_TOOLS`, but a `chat_propose` mode
inserts a human-clicks-to-confirm step before invocation. Pattern 4
from [[Chat-As-Verb-Surface-Patterns]].

### Three registration sources

1. **Manifest files** — static, version-controlled, declarative.
   Examples: Slack app manifest (YAML), Discord application commands
   (JSON), MCP server's `tools/list` response (returned from the
   server), Claude Code `~/.claude/skills/<name>/SKILL.md` with YAML
   frontmatter. Augment-It's `CAPABILITY_TO_SUBJECT` map in
   `services/workspace/src/capabilities.ts` is a manifest in code.
2. **API at boot** — runtime registration but stable across the
   session. Examples: Discord's `applicationCommands.create()`,
   Telegram's `setMyCommands`, LangChain's `agent.bind_tools(...)`.
3. **Hot-add via runtime API** — registration mid-session.
   Examples: MCP's `notifications/tools/list_changed`, Discord guild
   commands (instant propagation), Augment-It's NEW Connector Inventory
   registry (`registry.register(...)` per
   [[../specs/Connector-Inventory-and-Per-Record-Palette]]). The
   connector registry is structurally the same shape as MCP's tools
   registry — that's not a coincidence; it's the same problem.

### The de facto schema

Every modern stack converges on roughly the same shape:

```json
{
  "name": "entity_pulse",
  "description": "Fan out OfficialUpdates + MediaMentions + SocialsMentions across a record set",
  "inputSchema": {
    "type": "object",
    "properties": { "record_set_id": {...}, "relevance_context": {...} },
    "required": ["record_set_id"]
  }
}
```

JSON Schema for args is the universal language. For LLM-invoked tools,
**the description IS the dispatch logic** — the model reads it and
decides whether to call this tool. For human-typed shortcuts, the
description is UI tooltip.

Augment-It's `CHAT_TOOLS` in `services/workspace/src/chat.ts` already
matches this shape (Anthropic's tool-use format, which is structurally
isomorphic to MCP's). The four-slab prompt assembly slots tools into
the second slab; cache breakpoints make the tool definitions cacheable
across turns.

### Why MCP is the standard worth caring about

Augment-It already runs firecrawl, chroma, tavily as MCP servers
(`.mcp.json` at the augment-it root, plus the user-scope config for
the cross-project Chroma). MCP — Model Context Protocol — is the
emerging standard for the registration question this section answers.
Its primitives map directly to v0.0.1's existing patterns:

| MCP primitive | Augment-It equivalent today | Status |
|---|---|---|
| `tools/list` — invokable tools | `CHAT_TOOLS` in `chat.ts` | Native shape, just not exposed via MCP yet |
| `prompts/list` — named prompt templates surfaced as slash commands | None — v0.0.1 doesn't have `/<name>` shortcuts | v0.0.2 candidate |
| `resources/list` — addressable read-only contexts | `row://`, `record_set://` — implicit in workspace state but not addressable | v0.0.2 candidate |
| `notifications/tools/list_changed` — hot-reload | Connector Inventory registry's `register/unregister` pattern | NEW (this session) |

MCP is two-way: a process can be an MCP **server** (exposes tools to
hosts like Claude Code, Cursor, Augment-It's chat) AND an MCP **client**
(consumes tools from other MCP servers). v0.0.2's McpCapability is the
client direction; expose-Augment-It-as-an-MCP-server is a separate
candidate that would let the chat UI of any MCP-aware host (Claude
Code, Cursor, future) trigger Augment-It enrichments.

### Other systems worth knowing (briefly)

- **Discord application commands** — manifest at registration; client
  autocompletes the `/` from the registered set. Two-tier scope: global
  (slow propagation, ~1hr) vs guild (instant). Slash commands have
  typed options, choices, autocomplete callbacks. Closest analog to
  the "host autocompletes from the registry" pattern.
- **Slack app manifests** — YAML/JSON declaration of slash commands +
  the POST URL each routes to. No LLM dispatch — purely human-typed.
- **OpenAI function calling / Assistants API** — JSON Schema for args,
  model decides from description. Tools API; Custom GPTs use a
  manifest + OpenAPI spec for "actions" instead.
- **LangChain `@tool` decorator** — Python decorator generates the
  schema from function signature; `agent.bind_tools(...)` registers at
  runtime. Description-driven dispatch.
- **Claude Code skills** — directory + SKILL.md with YAML frontmatter.
  The description in frontmatter is what Claude reads to decide when
  to invoke. Different from Claude Code's slash commands, which are
  `~/.claude/commands/<name>.md` and human-typed. Same product, two
  trees, two dispatch modes.
- **Continue.dev / Cursor / Cody** — IDE-embedded; each has a JSON
  config declaring custom slash commands. Less structured than
  Claude Code skills, no LLM-decides-from-description tier.

### Mapping Augment-It's path to MCP-compatible exposure (v0.0.2 sequencing)

The shipped v0.0.1 substrate is already structurally MCP-shaped. The
work to make it MCP-native is largely **wrapping existing layers**, not
rebuilding them:

1. **Tools** — `CHAT_TOOLS` array becomes the response to MCP
   `tools/list`. Each entry already has `name`, `description`,
   `input_schema`. Wrap workspace's NATS dispatch as the tool execution
   path: MCP `tools/call` → `workspace.invoke()` → existing
   CAPABILITY_TO_SUBJECT → existing NATS handler. The Connector
   Inventory registry is already this pattern at a finer grain
   (connector-level instead of capability-level); the same shape
   generalizes up.
2. **Prompts** — surface the bundle chat verbs (`/entity-pulse`,
   `/voice-of-entity`, `/who-mentions-us` per
   [[../specs/Entity-Pulse-Bundle]] open questions) as MCP prompt
   templates. Each prompt template's parameters become `{record_set_id,
   relevance_context}` etc.; the host UI autocompletes `/`. This gives
   Augment-It both dispatch modes (LLM-invoked AND human-typed) for
   free, against the same underlying capability registry.
3. **Resources** — `row://<row_id>` and `record_set://<id>` URIs
   addressable through MCP `resources/read`. Useful for the chat
   surface to attach context without re-fetching, and for external MCP
   hosts to read Augment-It data without coupling to NATS.
4. **McpCapability (v0.0.2 deferred adapter)** — consume external MCP
   servers (firecrawl crawl during `prompts.apply`; tavily for live
   research; chroma for the Lossless corpus search). Wrap the MCP
   client SDK so capabilities can be registered from MCP tool
   discovery — drop a new MCP server in `.mcp.json`, the registry
   discovers its tools and they become available capabilities at runtime.
5. **SkillCapability (v0.0.2 deferred adapter)** — wrap a Claude Code
   skill (the user already has `crawl-fetch-ingest`,
   `search-lossless-corpus`, etc.). The skill's SKILL.md frontmatter
   description routes the LLM; the skill's body becomes a chain of
   capability invocations the chat agent walks. Maps directly onto
   the LangChain "agent calls a sequence of tools" pattern but with
   Augment-It's gated-enhancement discipline (each step proposes; the
   human can break the chain).

### Practical implication for Connector Inventory

The Connector Inventory registry pattern that landed in this branch
(`feat/bundle-media-packs`) is **the same registration pattern this
section describes**, applied one level down — connector-level instead
of capability-level. That's not duplication; that's the registry
pattern recursing:

- Top level (chat agent): `CAPABILITY_TO_SUBJECT` — verbs the chat
  knows about.
- Mid level (bundle): `BUNDLES[id].members[]` — packs that compose
  a bundle.
- Bottom level (connector): `ConnectorRegistry.resolve(intent)` —
  providers that serve a capability.

All three are description-driven, registration-based, hot-swappable.
When v0.0.2 ships McpCapability, the McpCapability adapter at the top
level will register MCP-tool-shaped entries into CAPABILITY_TO_SUBJECT;
those tools may themselves trigger Connector Inventory resolution at
the bottom; the symmetry is structural.

### One concrete v0.0.2 first step

The cheapest move that proves the framework: **expose `entity-pulse`
bundle as an MCP prompt**. Three changes:

1. Add an MCP server endpoint to `services/workspace/` (alongside the
   existing WebSocket) that responds to `prompts/list` with one entry:
   `entity-pulse` with the bundle's input parameters as MCP prompt
   arguments.
2. Wire `prompts/get` to assemble the four-slab prompt with the bundle
   pre-injected.
3. Add Augment-It's MCP endpoint to `.mcp.json` of any host (Claude
   Code, Cursor) and verify `/entity-pulse` autocompletes there.

This is small enough to fit in a single PR, doesn't change the existing
v0.0.1 contract, and earns Augment-It the "MCP-compatible chat verb"
property — which is a credibility signal for any future LLM host
integration. Logical next step after the Entity Pulse Phase 2
rollup-agent lands and there's something worth firing.

## Related

- [[Chat-As-Verb-Surface-Patterns]] (ai-labs) — the blueprint this plan implements; defines the four adapter shapes and the five patterns
- [[Per-App-Workspace-Conventions]] (ai-labs) — the workspace shape; defines the verb vocabulary including `draft → improve → apply`
- [[Augment-It-Workspace-Walking-Skeleton]] — the substrate this rides on
- [[Prompt-Template-Manager-Walking-Skeleton]] — the augment-it prompt-template work this leans on for storage
- [[Remote-Mount-Contract-for-In-App-Agent]] (ai-labs) — the adapter seam
- [[In-App-Chat-as-Agent-Surface-for-Client-Apps]] (ai-labs) — origin exploration
- [[Slides_Anatomy-of-the-In-App-Agent-Shell]] (ai-labs) — augment-it is chat-as-primary (Configuration A)
- [[Federation-and-Bundler-Decision]] — federation substrate this plugs into
- [[Augment-It-Prior-Art-Survey]] — capability vocabulary this plan picks from
- [[project_augment_it_gating_and_microfrontend_thesis]] (memory) — the gating discipline this triad is the structural answer to
