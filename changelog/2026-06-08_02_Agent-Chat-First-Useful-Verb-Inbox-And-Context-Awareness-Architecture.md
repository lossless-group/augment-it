---
title: "Agent-chat ships its first non-prompt verb — `/inbox <url>` saves to the operator's Corpus Inbox via Claude Sonnet 4.6 with active-client context; companion architecture spec defines the three-layer cleanup path"
lede: "The chat surface (`apps/chat/`) has been mechanically functional for weeks — Anthropic SDK in `services/prompt-runner/src/chat-turn.ts`, four-cache-eligible system slabs assembled in `services/workspace/src/chat.ts`, three-mode tool dispatch (chat_answer / chat_propose / chat_invoke), Svelte transcript with accept-proposal cards — but it knew about three verbs (`prompt.draft`, `prompt.improve`, `prompt.apply`) and one context dimension (`record_set_id`). For the funder content corpus workflow the operator is actually in, that meant the chat had nothing to offer. This commit ships the first non-prompt verb: `/inbox <url>` recognized by the model, dispatched as `corpus.inbox.add`, writes to `clients/reach-edu/corpus/inbox/` with the extended frontmatter contract from the Corpus-Inbox-Capture-and-Triage spec. Claude is the default and was the default; what changed is the chat now has something useful to do with the API key it already had. Companion spec `Chat-Context-Awareness-Architecture.md` lands alongside, naming the three v0.0.1 design holes the inbox verb exposed (hand-written verb roster, hardcoded active_client_id in the context slab, ActiveView covers only half the microfrontends) and defining a three-layer migration plan (workspace as context broker → slab-assembly contract → verb registry) that each layer ships independently. Path B per the user's pick — ship the verb tonight, spec the architecture once it's working."
publish: true
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Agent-Chat
  - Corpus-Inbox
  - Claude
  - Anthropic
  - Architecture
  - Milestone
files_changed:
  - services/content-ingest/src/corpus.ts (new addToInbox + buildInboxFrontmatter sibling of addToCorpus; writes the inbox-extended frontmatter contract — funder_slug literal "inbox", inbox_status pending, captured_* block populated at write, triaged_* block null until triage runs)
  - services/content-ingest/src/handlers.ts (new corpus.inbox.add NATS handler — validates URL, Jina-fetches with graceful fetch-failed stub, writes via addToInbox, publishes corpus.inbox.added)
  - services/workspace/src/capabilities.ts (corpus.inbox.add wired into router with 30s timeout)
  - services/workspace/src/chat.ts (V001_CHAT_VERBS gains the corpus.inbox.add entry + recognition shortcuts for /inbox, "save this", "park this", "remember this URL"; chat_propose + chat_invoke tool enums widened; contextSlab now inlines active_client_id reach-edu — the architectural cleanup target)
  - apps/chat/src/ResponseModeRenderer.svelte (inbox-specific capability_result render branch showing the corpus_path)
  - apps/chat/src/app.css (.bubble.result.inbox + .inbox-path styles)
  - context-v/specs/Chat-Context-Awareness-Architecture.md (NEW v0.0.0.1 — three-layer architecture spec: workspace as context broker, slab-assembly contract with 4 cache + 4 volatile slabs, verb registry derived from per-verb descriptors; written alongside the inbox-verb ship so future verbs land cleanly against the architecture rather than extending the hand-written prose roster)
---

# Agent-chat ships its first non-prompt verb

## Why care

The chat surface has been mechanically working for weeks — Claude
Sonnet 4.6 wired via Anthropic SDK in
`services/prompt-runner/src/chat-turn.ts:21`, four-cache-eligible
system slabs assembled in `services/workspace/src/chat.ts`, three
response modes locked behind `tool_choice: { type: 'any' }`, accept-
proposal flow rendered in the Svelte transcript. Nothing about the
LLM gateway or the chat surface needed building.

What kept it from being useful was a deliberate v0.0.1 scoping
decision: the verb roster was hand-written and covered only the
three prompt verbs (`prompt.draft`, `prompt.improve`,
`prompt.apply`), and the context slab knew only about
`record_set_id`. For the operator who's been spending the last few
days inside the Content Reader doing per-funder corpus work, the
chat had no idea anything else was happening in the product. The
"blank" feeling wasn't about a broken connection — it was about a
narrow capability roster meeting a wide actual workflow.

This commit closes the gap with the smallest meaningful proof: ship
*one* new verb that exercises *one* new context dimension. The verb
is `/inbox <url>` (Vector 2a from yesterday's
[[Corpus-Inbox-Capture-and-Triage]] spec). The context dimension is
`active_client_id`. Both are now real. The chat finally has
something to do with the funder workflow.

## What's new

**Backend.** `services/content-ingest/src/corpus.ts` gains
`addToInbox()` + `buildInboxFrontmatter()` as siblings of the
existing `addToCorpus()` + `buildFrontmatter()` — same collision-
suffix logic, same slug, same YAML quoting, but writes the inbox-
extended frontmatter shape per the spec. `funder_slug: "inbox"`,
`pack_id: "inbox"`, `record_id: null`, `response_id: null`, plus the
two new sibling blocks: `captured_*` (populated at write,
immutable) and `triaged_*` (all null until the future triage layer
runs).

`services/content-ingest/src/handlers.ts` registers the
`corpus.inbox.add.requested` NATS handler. Validates URL parses and
is http(s), Jina-fetches (reusing the same per-URL cache the
existing manual-add path uses), writes via `addToInbox`, publishes
`corpus.inbox.added` for downstream subscribers. Gracefully handles
Jina fetch failure by writing the file with a stub body and
`extra_metadata.jina_status: "fetch_failed"` — the URL itself is
never lost.

**Workspace router.**
`services/workspace/src/capabilities.ts` wires
`corpus.inbox.add` → `corpus.inbox.add.requested` with a 30s
timeout (single Jina fetch + filesystem write).

**Chat verb roster.** `services/workspace/src/chat.ts:50
V001_CHAT_VERBS` gains the `corpus.inbox.add` entry plus a new
**VERB RECOGNITION SHORTCUTS** block teaching Claude to read
`/inbox <url>` as an explicit verb signal (route via
`chat_invoke` rather than the strict-alignment default
`chat_propose`). Same block covers "save this", "park this",
"inbox this", "remember this URL" — natural-language shortcuts the
operator can use without the slash prefix.

The `chat_propose` and `chat_invoke` tool definitions' enum on
`capability` is widened to include `corpus.inbox.add`. Without this
the model couldn't pick the verb even if it wanted to.

**Active-client context.** `contextSlab()` inlines an active_client
line:

> *"The active client is: reach-edu (this is the client_id arg for
> corpus.inbox.add and any other client-scoped capability)."*

This is hardcoded for v0.0.1 — reach-edu is the only client today
and this is the line the architecture spec is targeting for proper
broker resolution in the next pass. The hardcode is the working
seam, not the destination.

**Chat-side render.**
`apps/chat/src/ResponseModeRenderer.svelte` gains a capability-
specific result branch for `corpus.inbox.add`: instead of the
generic "✓ corpus.inbox.add completed" muted line, the bubble shows
"✓ Saved to inbox" with the resulting `corpus_path` rendered in
monospace below. CSS adds `.bubble.result.inbox` and `.inbox-path`
styles.

## How it works

End-to-end:

1. Operator types `/inbox https://example.com/path` in the chat
   composer and hits cmd-enter.
2. Chat surface's `chatTurn()` sends the message + thread + context
   to workspace via the WebSocket.
3. Workspace's `dispatchChatTurn()` assembles the six-slab system
   prompt (now including `active_client_id: reach-edu` in the
   context slab) + the four chat tool definitions + the thread.
4. Workspace publishes `chat.turn.requested` to NATS.
5. Prompt-runner's chat-turn handler calls Claude Sonnet 4.6 with
   `tool_choice: { type: 'any' }` — the model must pick one of the
   four tool calls.
6. Claude recognizes the `/inbox` shortcut + the
   `prefer_invoke_when` discipline and returns
   `chat_invoke { capability: 'corpus.inbox.add', args: {
   client_id: 'reach-edu', url: 'https://example.com/path',
   captured_from: 'chat-verb' } }`.
7. Chat surface receives the invoke turn and immediately runs the
   tool call via `workspace.invoke('corpus.inbox.add', args)`.
8. Workspace dispatches `corpus.inbox.add.requested` to NATS.
9. Content-ingest's handler Jina-fetches the URL (reusing the same
   cache the manual-paste path uses), writes the inbox markdown,
   publishes `corpus.inbox.added`.
10. Chat surface gets the capability_result back and renders the
    inbox-specific bubble — "✓ Saved to inbox" with the corpus_path.

Result file lands at
`clients/reach-edu/corpus/inbox/2026-06-08_<title-slug>.md` with
the full extended frontmatter (`funder_slug: "inbox"`,
`inbox_status: "pending"`, `captured_from: "chat-verb"`,
`captured_at: <ISO>`, `triaged_*: null`) and the Jina-fetched
markdown body.

## What's still loose

- **Verb roster is still hand-written.** The
  `V001_CHAT_VERBS` prose block grew today; each new verb is two
  edits (prose + enum). Layer 3 of the
  [[Chat-Context-Awareness-Architecture]] spec is the cleanup —
  derive the roster from a `CHAT_VERBS[]` descriptor list with per-
  verb args schemas + `recognition_hints` + `context_required`.
  Ship the next time a non-trivial verb is added (likely
  `corpus.inbox.list` or one of the pack verbs).
- **`active_client_id` is hardcoded `reach-edu` in
  `contextSlab()`.** Works because there's one client today;
  fragile because there will be more. Layer 1 of the architecture
  spec is the real fix — workspace becomes the source of truth for
  active client (single top-level field), each microfrontend
  pushes its state, the slab assembly reads from the broker.
- **`ActiveView` still covers four kinds.** Content Reader, Inbox,
  Pack Runner, Request Reviewer, Response Reviewer, Records
  Surface, Prompt Template Manager — none of them push their state
  into the workspace. The chat doesn't know which surface the
  operator is on; can't tailor proposals to the surface. Same
  Layer 1 fix; the spec sketches each variant.
- **Conversational paste (Vector 2b) NOT shipped.** Pasting a bare
  URL without `/inbox` doesn't trigger anything yet — `/inbox <url>`
  is required. Vector 2b needs the intent classifier
  (`corpus.inbox.classify_intent`, Haiku-class) + the inline
  confirmation card + the per-host snooze heuristic per
  [[Corpus-Inbox-Capture-and-Triage]] §Vector 2b. Lands when the
  conversational rhythm is wanted.
- **Inbox doesn't have a Browse view yet.** Captured items are
  visible only as files in the per-client repo's filesystem.
  `apps/corpus-inbox/` microfrontend with the Browse mode is step 5
  of the inbox spec's migration plan.
- **No status-bar badge for inbox count.** "N items pending
  triage" nudge isn't wired; trivial to add once the
  `corpus.inbox.list` capability lands.
- **Renderer didn't get a "browse inbox" action button.** The
  result bubble shows the path but doesn't offer "open this in the
  Inbox surface" because the surface doesn't exist yet. Wire it
  when the surface ships.
