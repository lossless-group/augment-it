---
title: "Chat Context-Awareness Architecture — three layers (workspace as context broker, slab-assembly contract, verb registry) that grow the in-app chat from prompt-only to surface-aware verb router"
lede: "The agent-chat surface (`apps/chat/`) already has working scaffolding — Anthropic SDK in `services/prompt-runner/src/chat-turn.ts`, four cache-eligible system slabs assembled in `services/workspace/src/chat.ts`, three response modes (chat_answer / chat_propose / chat_invoke), the Svelte transcript + proposal-card surface. What makes it feel narrow is two design holes the v0.0.1 implementation deliberately left open: the verb roster is hand-written and prompt-only, and the context slab inlines `record_set_id` and nothing else. This spec defines the architecture for closing both — workspace as the single source of truth for *what the user is looking at right now and what client they're in*, a slab-assembly contract that names every dimension of context the chat can use, and a verb registry that derives the model's tool roster from `CAPABILITY_TO_SUBJECT` + per-verb args schemas rather than from a hand-edited prose block. The corpus-inbox `/inbox` verb (shipped 2026-06-08 as the first non-prompt verb) is the load-bearing demo: it works because the context slab now carries `active_client_id`, and it points at the seams the spec is here to formalize."
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-08 — Initial draft. Written immediately after shipping the `/inbox` verb (the first non-prompt chat verb), which exposed the v0.0.1 design holes: hardcoded `active_client_id: "reach-edu"` in the context slab, hand-written verb roster prose, no awareness of the operator's current view-mode beyond record_set. This spec is the cleanup target.
tags:
  - Spec
  - Augment-It
  - Chat
  - Agent-Chat
  - Context-Awareness
  - Architecture
  - Workspace
  - Verb-Registry
status: Draft
---

# Chat Context-Awareness Architecture

## Why this spec exists

The v0.0.1 chat surface ships with three deliberate design holes that
let us land the scaffolding without committing to the architecture
prematurely:

1. **`V001_CHAT_VERBS` is a hand-written prose block** in
   `services/workspace/src/chat.ts`. Every new verb is a string edit
   in two places (the prose block + the `enum` on the `chat_propose`
   tool's args schema). Tolerable at 3 verbs (the original prompt
   triad); brittle at 10; awful at 50.
2. **`contextSlab()` inlines `record_set_id` and `focused_prompt_id`
   only.** It does not know what view-mode the operator is in, which
   client they're scoped to, what record they're focused on, what
   they just did, what's waiting for them. The chat model decides
   *what to suggest* without seeing *what's actually happening*.
3. **`ActiveView` is a small discriminated union**
   (`packages/workspace/src/types.ts:177`) covering `idle |
   record_set_list | record_set | row_detail`. Half the
   microfrontends (`content-reader`, `inbox`, `pack-runner`,
   `request-reviewer`, `records-surface`) don't push their state
   into it.

The 2026-06-08 `/inbox` ship made all three holes concrete: the verb
roster needed a fourth verb (so the hand-written list grew), the
chat needed to know which client to write to (so we hardcoded
`active_client_id: "reach-edu"` in `contextSlab()`), and the chat
had no idea whether the operator was looking at Content Reader, the
Records Surface, or nothing — so it can't tailor proposals to the
surface they're on.

This spec defines the architecture for closing all three holes
together. The shape is **three layers, none of which need to ship
at once**:

- **Layer 1 — workspace as context broker.** Extend `ActiveView`,
  add `active_client_id`, define the contract each microfrontend
  honors when its state changes.
- **Layer 2 — slab-assembly contract.** Name every dimension the
  chat sees, with locked semantics per dimension. Keeps the slab
  growth disciplined.
- **Layer 3 — verb registry.** Derive the model's tool roster from
  the existing `CAPABILITY_TO_SUBJECT` map plus per-verb args
  schemas + per-verb chat metadata (when to propose, when to invoke,
  what context the verb cares about).

Each layer is independently ship-able. The order below is the
recommended one — Layer 1 unlocks Layer 2's value, Layer 2 unlocks
Layer 3's payoff. But Layer 3 alone is shippable as the next thing
that hurts; the others can wait.

## Layer 1 — Workspace as context broker

### Design

`ActiveView` becomes the **single source of truth for what surface
the operator is in right now**, with a variant per microfrontend.
The workspace singleton already has the slot
(`packages/workspace/src/state.svelte.ts:39`); the union shape
grows.

```ts
export type ActiveView =
  | { kind: 'idle' }
  | { kind: 'record_set_list' }
  | { kind: 'record_set'; record_set_id: string }
  | { kind: 'row_detail'; record_set_id: string; row_id: string }
  // NEW — one variant per remote that has a meaningful "what am I
  // looking at right now" state:
  | { kind: 'content_reader'; client_id: string; record_set_id: string; focused_row_id?: string }
  | { kind: 'inbox'; client_id: string }
  | { kind: 'pack_runner'; record_set_id: string; focused_pack_id?: string }
  | { kind: 'request_reviewer'; pending_count?: number }
  | { kind: 'response_reviewer'; record_set_id: string; view_mode: 'by-response' | 'by-record' | 'content-reader' }
  | { kind: 'records_surface'; record_set_id: string; focused_row_id?: string }
  | { kind: 'prompt_template_manager'; focused_prompt_id?: string };
```

Each microfrontend takes one of two responsibilities:

1. **On mount and on view-state change**, call
   `workspace.setActiveView({...})` with its own `ActiveView`
   variant.
2. **On unmount**, IF it was the most-recently-set view, call
   `workspace.setActiveView({ kind: 'idle' })`. This is the part
   that's easy to skip; we may want a workspace-side timeout/
   heartbeat as a safety net so a hung remote doesn't leave stale
   `activeView` data forever.

### `active_client_id` — sibling top-level field

Distinct from `ActiveView` because **the active client persists
across view changes** — the operator stays in `reach-edu` while
hopping between Content Reader, Inbox, and Pack Runner. Put it on
the workspace singleton as a top-level field:

```ts
class Workspace {
  activeView: ActiveView;            // current
  active_client_id: string | null;   // NEW
  last_capability: string | null;    // current
  // ...
}
```

Resolution rules:

- If the most-recent `ActiveView` carries a `client_id` field, use
  it.
- If not, fall back to a workspace-level "default client" the user
  picks on first login (stored in localStorage; `'reach-edu'` is
  the only choice today so this is degenerate).
- If multiple `ActiveView` events come from sibling federated
  remotes with **different** client_ids, the workspace logs a
  warning and uses the most-recent. Cross-client work in one
  session is a v2 question.

### Capability lifecycle in the broker

Workspace already tracks `last_capability` (set when `invoke`
finishes). Extend to a small ring buffer — `recent_capabilities:
{capability, ok, ts}[]` capped at ~10 — so the slab can inline "in
the last few minutes the user ran X, Y, Z" without exploding the
prompt. The model uses this for two things: anticipating next-verb
proposals, and grounding "what just happened?" answers.

### Why the broker, not the chat surface

The chat-side `chat-state.svelte.ts` could in principle assemble all
of this itself by reading the workspace state at send time. The
broker pattern is more defensible because:

- **Other consumers want the same info.** The anticipation `suggest()`
  function in the chat composer already reads
  `workspace.activeView`. The status-bar badge for "N inbox items
  pending" reads the same. A future cross-surface "what's the
  operator's focus" indicator reads the same.
- **Audit and debugging.** When the chat misroutes a verb, "what
  did the workspace think was active at the time?" is a clean
  question with a single answer.
- **Defensive update semantics.** Workspace-side
  `setActiveView()` can apply diff-based update rules (e.g. ignore
  no-op updates to silence event spam) once for all consumers.

## Layer 2 — Slab-assembly contract

### Design

Today `services/workspace/src/chat.ts` assembles 4 cache-eligible
slabs + 2 volatile slabs. The cache discipline is correct (the
prompt cache wants long stable prefixes; volatile content goes
last). The architecture needs to *name every dimension the chat
sees* so additions land in the right slab consistently and don't
silently burst the cache.

The **locked slab inventory**:

#### Cache-eligible slabs (in cache order — earlier = bigger cache wins)

1. **`STATIC_SPINE`** — what the chat *is*. Augment-It's identity,
   the three response modes, the strict-alignment discipline.
   Pinned to the chat package version; changes only on a release
   commit.
2. **`CAPABILITY_ROSTER`** — the verb roster, rendered from the
   Layer 3 registry. Changes whenever a verb is added or a verb's
   args schema changes (rare; one cache miss per release).
3. **`ACTIVE_SKILLS`** — opt-in skill packs the operator has
   enabled for this session. Empty today, reserved breakpoint.
4. **`PER_CLIENT_DISCIPLINE`** — per-client rules (e.g. "this
   client's funder corpus is strictly funder-domain-only," "this
   client uses controlled tag vocabulary X"). Loaded from the
   per-client repo's `agent-discipline.md` if present; empty
   otherwise. Cache hit per client.

#### Volatile slabs (no cache_control; cheap to recompute)

5. **`ACTIVE_VIEW_SLAB`** — the current `ActiveView` rendered as
   prose, e.g. *"The user is in Content Reader, scoped to client
   `reach-edu` and record set `master-pipeline-tracker-v6` (783
   records), focused on row `griffin-catalyst`."* This is the slab
   that gives the chat surface-awareness.
6. **`RECENT_ACTIVITY_SLAB`** — last-N capability outcomes, e.g.
   *"In the last 5 minutes the user has: added 3 URLs to
   `arthur-blank-foundation` corpus, fired the entity-blog pack
   against 14 rows, then opened Inbox."* Inlined recent-capabilities
   ring buffer from Layer 1.
7. **`AMBIENT_COUNTS_SLAB`** — *"6 items in inbox awaiting triage;
   12 responses in Request Reviewer pending review."* A small set
   of "what's waiting" counters the chat surface can mention without
   the user having to ask. Counters are cheap workspace queries.
8. **`SUGGESTIONS_SLAB`** — the existing
   `suggestedVerbsSlab()`. Stays at the bottom.

### Locked semantics per slab

The point of naming the slabs isn't bureaucracy — it's so that *the
next agent who adds a context dimension knows which slab to put it
in*. Locked rules:

- **Anything user-identity-shaped goes in `STATIC_SPINE`** (the
  chat's character) or `PER_CLIENT_DISCIPLINE` (the client's
  character). Never in volatile slabs.
- **Anything that changes per view goes in `ACTIVE_VIEW_SLAB`**.
  Including `active_client_id` even though the client is fairly
  stable — because the slab itself is volatile, and rendering it
  consistently in one place beats spreading client info across
  multiple slabs.
- **Anything that's "what happened" goes in `RECENT_ACTIVITY_SLAB`**.
- **Anything that's "what's waiting" goes in `AMBIENT_COUNTS_SLAB`**.
- **Capability suggestions come last** so they're nearest the user's
  message (a small recency boost for the model's attention).

### Cache miss budget

Adding a slab dimension to the cache-eligible region (1-4) costs
one cache miss per change. Volatile slabs (5-8) cost no cache
delta — they're after the cache breakpoint. New context dimensions
should default to volatile unless the dimension is genuinely
stable per-session.

## Layer 3 — Verb registry

### Design

`V001_CHAT_VERBS` becomes a derived string, not a hand-written one.
The source of truth lives in a new file
`services/workspace/src/chat-verb-registry.ts`:

```ts
export type ChatVerbDescriptor = {
  capability: string;            // e.g. 'corpus.inbox.add'
  one_line: string;              // model-facing tagline
  args_schema: JSONSchema;       // for the chat_propose tool's args field
  recognition_hints?: string[];  // explicit "/foo <bar>" patterns
  prefer_invoke_when?: string;   // prose hint to the model
  prefer_propose_when?: string;
  context_required?: ('active_client_id' | 'active_record_set_id' | 'active_row_id')[];
};

export const CHAT_VERBS: ChatVerbDescriptor[] = [
  {
    capability: 'corpus.inbox.add',
    one_line: 'Save a URL to the operator\'s Corpus Inbox for later triage.',
    args_schema: { /* JSON schema */ },
    recognition_hints: [
      '/inbox <url>',
      '/inbox <url> [note]',
      '/inbox <url> #tag1 #tag2',
      '"save this" / "park this" / "inbox this" + URL',
    ],
    prefer_invoke_when: 'user explicitly types /inbox or names "save / park / inbox / remember" alongside a URL',
    prefer_propose_when: 'a URL appears in conversation but operator intent is unclear',
    context_required: ['active_client_id'],
  },
  // ...
];
```

Rendering:

- `CAPABILITY_ROSTER` slab is `CHAT_VERBS.map(renderForModel).join('\n')`.
- The `chat_propose` and `chat_invoke` tool definitions' enum on
  `capability` is `CHAT_VERBS.map(v => v.capability)`.
- Each verb's `context_required` is checked at slab-assembly time:
  if the verb needs `active_client_id` but the workspace doesn't
  have one, the chat surface emits a warning and the verb is
  hidden from the roster for that session (prevents the model from
  proposing verbs it can't actually run).

### How verbs land going forward

To add a new chat verb:

1. Ship the backend capability + workspace router entry (unchanged
   process).
2. Add a `ChatVerbDescriptor` entry to `CHAT_VERBS`. The roster
   prose + the tool's enum update automatically.
3. (Optional) Add a `recognition_hints` line for explicit-verb
   patterns the model should treat as `chat_invoke` candidates.

No prose-block edits. No tool-schema edits. The cache misses *once*
on the next chat turn after the registry changes (because slab 2
content changes), then it's stable again.

### What this doesn't do (yet)

- **Per-verb gating** — some verbs need destructive-action gating
  (e.g. a future `corpus.discard`); the registry has a hook for it
  but the gating UX is a separate question.
- **Argument auto-validation** — the model fills in args matching
  the JSON schema, but cross-arg constraints (e.g. "`row_limit`
  ≤ `record_set.row_count`") still happen at the capability handler.
- **Skill-pack scoping** — `ACTIVE_SKILLS` lets the operator
  enable/disable groups of verbs (e.g. "I'm only doing corpus
  work today, hide the prompt verbs"). Hooks reserved; UX TBD.

## Migration plan

1. **Layer 1 — workspace `ActiveView` extension + `active_client_id`.**
   The largest single change; touches every microfrontend that needs
   to push state. Could land in a single named branch with one PR
   per microfrontend, OR (lean) trunk-style with one PR per
   microfrontend over a week. Either way, the chat keeps working
   throughout because the slab assembly checks for variant
   exhaustively via `kind` switch.
2. **Layer 2 — slab assembly cleanup.** Once Layer 1 is in,
   `contextSlab()` gets renamed and split into the four volatile
   slabs above. Add `PER_CLIENT_DISCIPLINE` plumbing (reads the
   per-client repo's `agent-discipline.md` if present). The chat's
   answers immediately get richer; same verb roster.
3. **Layer 3 — verb registry.** Extract `CHAT_VERBS` into the
   registry file. Cache-eligible slab 2 becomes derived. The next
   new verb (likely `corpus.inbox.list`, the inbox triage path, or
   one of the pack/connector verbs) lands as a registry entry.
4. **(Parallel)** as verbs are added, each microfrontend's
   anticipation-`suggest()` function reads from the registry too —
   "what verbs is this view a good launching pad for?"

Per the [[branch-cadence]] feedback memory: Layer 1 is a named
branch (multi-microfrontend); Layer 2 is trunk; Layer 3 is a single
named branch (refactor with no behaviour change). The architecture
is designed so each layer ships independently and the chat keeps
working between layers.

## What this spec is NOT trying to decide

- **Which model.** Sonnet 4.6 is the v0.0.1 chat model and stays
  the default; per-verb model overrides are a v2 question (e.g.
  the conversational-paste intent classifier in
  [[Corpus-Inbox-Capture-and-Triage]] Vector 2b uses Haiku-class,
  not the chat default).
- **Cross-client work in one session.** Workspace's
  `active_client_id` is single-valued. If the operator wants to
  research two clients in parallel that's a separate UX question
  (paired-mode shell? per-tab client?) that doesn't gate this
  architecture.
- **Skill-pack scoping UX.** `ACTIVE_SKILLS` slab is reserved;
  what enables/disables it is its own spec.
- **Memory across sessions.** Today the chat thread_id is per-tab.
  Persistent threads, summarization, recall — all v2 questions.
- **Multi-turn capability chains.** The chat invokes one capability
  per turn. Chained workflows (e.g. "draft → improve → apply" as
  one user request) live in the verb registry's `prefer_invoke_when`
  semantics, not in a separate orchestration layer.

## Open questions

- **Heartbeat for stale `ActiveView`.** When a microfrontend
  unmounts without resetting (browser tab crash, network blip),
  `ActiveView` is stuck. Should workspace expire it after N
  seconds of no heartbeat from any remote, fall back to `idle`?
  Lean: yes, 60s heartbeat with a 10s expiry window. Cheap.
- **`PER_CLIENT_DISCIPLINE` source-of-truth.** The per-client repo
  is the natural home for client-specific chat discipline. Format
  for `agent-discipline.md` — free-form markdown (paste into slab
  as-is) or structured (parsed into a typed schema)? Lean:
  free-form for v1; clients write their own; structure emerges.
- **Verb registry visibility to other surfaces.** The microfrontends
  themselves want to know about the verbs (for the connector
  palette, for the chat-prompt suggestions in other surfaces).
  Should the registry live in `packages/workspace/` rather than
  `services/workspace/`? Lean: yes — types in the package, the
  per-verb prose stays server-side (so model-facing content can
  evolve without a remote rebuild).
- **`RECENT_ACTIVITY_SLAB` summarization.** A ring buffer of 10
  capability events × medium-length prose lines = ~500 tokens at
  worst. Cheap, but: should the model see raw event lines or a
  summarized rollup? Lean: raw lines for v1; summarize when the
  buffer is full *and* fewer than 3 distinct verbs are involved
  (then the rollup line "added 6 URLs to inbox in the last 5
  minutes" is more useful than 6 individual events).
- **Multi-language verb recognition.** `recognition_hints` are
  English-only today. v2 candidate; not blocking.
- **Verb gating tier.** Mutating verbs (`corpus.discard`,
  `record_set.delete`) want `chat_propose` only — never
  `chat_invoke`. The registry should carry a `gating: 'mutate' |
  'safe'` field that the slab-assembly translates into a discipline
  rule. v1 leans on author discipline; v2 adds the field formally.

## See also

- [[Corpus-Inbox-Capture-and-Triage]] — the first non-prompt chat
  verb. The shipped `/inbox` verb is the load-bearing demo for this
  architecture; its hardcoded `active_client_id` in the v0.0.1 slab
  assembly is the cleanup target.
- [[../explorations/Agent-Chat-Skills-and-Commands-Candidates]] —
  the running list of candidate verbs that will populate the Layer
  3 registry as they ship. This spec is the architectural
  counterpart to that exploration.
- [[../blueprints/Chat-As-Verb-Surface-Patterns]] — (in ai-labs/
  context-v/) the five patterns this implementation instances:
  capability adapters, lifecycle events, anticipation, three
  response modes, four cache-eligible slabs. This spec extends the
  fifth pattern from "four slabs" to "four cache + four volatile,
  with a locked inventory."
- [[Response-Reviewer-Shell-and-Content-Reader-Mode]] — the
  microfrontend whose Content Reader mode is the first non-trivial
  `ActiveView` variant to design. Its three view-modes (by-response,
  by-record, content-reader) are the model for how a remote's
  internal view-state maps to the workspace-level
  `ActiveView.kind`.
- [[Packs-and-Bundles-Pattern]] (blueprint) — the verb registry's
  `context_required` semantics extend cleanly to pack/bundle verbs
  that need a record-set context. As pack verbs join the registry
  this connection grounds.
