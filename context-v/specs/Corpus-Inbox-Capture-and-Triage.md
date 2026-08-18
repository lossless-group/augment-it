---
title: "Corpus Inbox — capture first, triage later; a zero-friction save destination for URLs without a home yet, with a future triage layer that sorts inbox content into the right places"
lede: >-
  A URL with no home yet shouldn't cost a filing decision: `corpus/inbox/` captures the page, its body, and a drive-by note, then waits.
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
revisions:
  - "2026-06-08 — Initial draft. Written immediately after shipping the Content Reader manual-URL add ([[Funder-Content-Corpus-Workflow]] v0.0.0.2, Step 5b). The operator's framing: *\"I don't want to proceed to augment with human-searched links for record-focused corpus content without having some way to capture everything I am seeing.\"* Inbox is gating further per-record manual-add work — capture has to be cheap before triage can be deliberate."
  - "2026-06-08 — Added Vector 2b: conversational paste-without-verb. Operator pastes a raw URL into the agent-chat (no `/inbox` prefix) and the agent recognizes the inbox-worthy shape, asks \"save this to your inbox?\" with optional note/tag prompts, then runs `corpus.inbox.add` on yes. The verb-less path is friction-minimum for the \"I just want to dump this without remembering the command\" rhythm; the verb stays for operators who prefer explicit-command muscle memory. Backend is identical to Vector 2a — same capability, same on-disk shape. Operator framing: *\"copy and paste a link directly into the agent-chat and have it ask if this should go to the inbox, if so, the agent runs the commands on the backend.\"*"
tags:
  - Spec
  - Augment-It
  - Corpus-Inbox
  - Capture-Layer
  - Funder-Corpus
  - Microfrontend
  - Agent-Chat
  - Per-Client
  - Operator-UX
status: Draft
site_uuid: ae0e40eb-5a3d-47cb-91c8-160b03324d06
hex_code: 314zyu
date_authored_initial_draft: 2026-06-08
date_authored_current_draft: 2026-06-08
---

# Corpus Inbox — Capture and Triage

## Why this exists

While researching funders, the operator finds URLs across a wide range
of shapes:

- Pages about the *right* funder but a different angle than the
  currently-active record (a 2024 strategy refresh found while
  searching 2026 grants).
- Cross-funder articles where one piece references three or four
  funders in the pipeline — belongs to none individually, useful to
  several.
- Sector reports, regulatory documents, market data — relevant to
  the client's broader fundraise strategy, not to any one funder.
- Downloadable PDFs (foundation IRS-990s, grant reports, white
  papers).
- Pages worth remembering even if the operator can't articulate why
  yet — "I'll know it when I see it on a later pass."

The existing Content Reader manual-add affordance
([[Funder-Content-Corpus-Workflow]] §5b) writes a URL to a
**specific record's corpus**. It requires the operator to have
already decided *which record* the URL belongs to. For URLs that
don't yet have a home that decision is premature — and the typical
work-around (open a notes file, paste the URL, keep researching) is
how operators end up with tab graveyards and forgotten findings.

Corpus Inbox is the missing destination: **capture first, triage
later.** Same on-disk shape as a corpus markdown entry (Jina-fetched
body + frontmatter), parked under `clients/<client>/corpus/inbox/`
with `inbox_status: pending`. The triage layer (specced separately)
moves it to its real home when the operator's ready.

> The operator's framing 2026-06-08: *"I don't want to proceed to
> augment with human-searched links for record-focused corpus
> content without having some way to capture everything I am
> seeing."*

Read this as **a prerequisite for further manual-add work.** Without
the inbox, every URL the operator finds during research carries a
"file me to a record right now or lose me" tax that throttles the
research itself.

## Scope

This spec covers:

- **What gets captured** — the shape of an inbox-eligible item.
- **Filesystem layout** — where inbox files live and how they
  relate to the rest of `clients/<client>/corpus/`.
- **Frontmatter schema** — the inbox-extended fields on top of the
  existing corpus markdown shape.
- **Capture surfaces** — three vectors (microfrontend, chat verb,
  future plugin), shared backend capability.

This spec **does not** design the triage layer beyond sketching its
shape, its destinations, and the two candidate UX paths (direct UI
vs agent-chat harness). Triage gets its own spec when it's time to
build it.

## What gets captured

Any URL the operator chooses to save. The system does not pre-judge:

- Funder-specific articles, press releases, blog posts (potentially
  triage-to-funder-corpus targets).
- Cross-funder pieces (potentially triage-to-reference targets).
- Sector data, regulatory documents (potentially triage-to-reference
  or triage-to-discard).
- PDFs Jina can extract.
- Pages the operator's hunch says "save this" without a specific
  reason yet.

The operator's intent at capture time is **"I might want this
later."** Triage decides what *later* means.

## Filesystem shape

Inbox is a sibling of per-funder corpus directories under the same
client's `corpus/` root:

```
clients/<client>/corpus/
  inbox/
    <YYYY-MM-DD>_<title-slug>.md         ← pending capture
    <YYYY-MM-DD>_<title-slug>.md
  <funder-slug>/
    <YYYY-MM-DD>_<title-slug>.md         ← already-triaged to a funder
  reference/                              ← (future) cross-funder content
    <topic-slug>/
      <YYYY-MM-DD>_<title-slug>.md
```

**Inbox files are real corpus markdown.** Same frontmatter contract
+ Jina-fetched body + same date-prefixed filename slug. The only
on-disk distinction from a "real" corpus file is the directory
(`inbox/` vs `<funder-slug>/`) and two frontmatter fields:

- `funder_slug: "inbox"` (the literal string, not a real funder
  slug)
- `inbox_status: "pending"`

**Triage = move + frontmatter update**, never a format conversion.
The same file gets `git mv`-ed from `inbox/` to its triage
destination and its `triaged_*` frontmatter block gets populated.
This keeps the data model boring and recoverable: a misfiled inbox
item is fixable by a manual `mv` and a frontmatter edit.

## Frontmatter schema

Extends the existing corpus markdown contract from
[[Response-Reviewer-Shell-and-Content-Reader-Mode]] §Corpus markdown
shape with **two new sibling blocks**: the `captured_*` block (set
at capture time, immutable) and the `triaged_*` block (set at
triage time, future-populated).

```yaml
---
# Existing corpus contract:
title: "Article Title from Jina or operator-edited"
exact_url: "https://example.com/path/to/article"
fetched_at: 2026-06-09T14:32:11.000Z
client_id: "reach-edu"
funder_slug: "inbox"               # literal "inbox" until triaged
record_id: null                    # null until triaged to a record (some triages skip — see Reference path)
response_id: null                  # null — no pack response upstream
pack_id: "inbox"                   # literal "inbox" (vs "official-blog-pack", "manual")
tags:
  - workforce-development          # operator-supplied at capture
  - state-policy

# NEW — inbox capture block:
inbox_status: "pending"            # pending | triaged | discarded | archived
captured_at: 2026-06-09T14:32:11.000Z
captured_from: "content-reader"    # content-reader | chat-verb | chat-paste | plugin | inbox-direct
captured_note: "looks relevant to Reach apprenticeship work; revisit when triaging Schusterman row"
captured_session_id: "..."         # optional — for "review my captures from today" queries

# NEW — inbox triage block (null until triage runs):
triaged_at: null
triaged_to: null                   # funder_slug | "reference/<topic-slug>" | "discard"
triaged_by: null
triaged_note: null

# Existing extra_metadata from Jina:
extra_metadata:
  jina_status: "200"
  content_length_bytes: "6619"
  same_host: false                  # may surface for plugin-captured URLs; not gating
---
<Jina-fetched markdown body>
```

The `captured_*` block is intentionally separate from `triaged_*` so
the audit trail reads cleanly — *what was the operator thinking when
they grabbed it, and what was the operator thinking when they
filed it.*

### What about capture-without-fetch?

For sites Jina chokes on, for batch captures, or for the operator
who wants to park a URL without waiting on a fetch, support a
`fetch: false` mode. The file is still written, with:

- No `<body>` (or a placeholder line).
- `fetched_at: null` and `extra_metadata.jina_status: "not_fetched"`.
- Triage can later request the fetch as part of its own step (or
  the operator can re-run capture with `fetch: true`).

Lean: ship `fetch: true` only in v1; add `fetch: false` once the
first round of capture friction is understood. If it turns out the
fetch is the bottleneck, that's a real signal.

## Capture surfaces

Three vectors. The first two ship in v1; the third is in flight as
part of [[../explorations/In-App-Browser-Or-Plugin-For-Corpus-Add]].

### Vector 1 — `apps/corpus-inbox/` microfrontend

A new federated Svelte 5 remote, following the existing Augment-It
microfrontend conventions (CSS namespace `.ci-app`, mount alongside
the others in the shell). Two view modes:

- **Capture mode.** Paste-a-URL surface. URL input, optional note
  textarea, optional comma-separated tags, optional checkbox "fetch
  body now" (default on). Submit → calls `corpus.inbox.add` →
  toast with the resulting `corpus_path`. The capture field stays
  open and clears for the next URL.
- **Browse mode.** List of inbox items: title (or URL if title not
  yet extracted), captured-at, tags, note, excerpt (first ~150
  chars of body if available). Sort by captured-at (most recent
  first) by default. Filter by tag, by capture vector
  (`captured_from`), by status. **Read-only in v1.** Triage actions
  belong to the future triage spec.

Why a standalone remote rather than a tab inside Response Reviewer:

- The inbox is a **different mental mode** from "I'm triaging
  responses for a record." Mixing them adds noise to both.
- It needs to be reachable **from anywhere** — chat dispatches to
  it, future plugin posts to it, Content Reader links into it
  ("show me my inbox while I work").
- The shell already supports pair-mode (50/50 splits) — operator can
  put Content Reader on one side and Inbox on the other while
  researching a record.

CSS namespace and mount conventions follow
[[Response-Reviewer-Shell-and-Content-Reader-Mode]] §Federation
shape (mirrored from the existing remotes' patterns).

### Vector 2 — Agent-chat capture (two sub-modes, shared backend)

The Augment-It chat surface (`apps/chat/`) is the second capture
vector and has **two sub-modes** that share the same
`corpus.inbox.add` capability. Both are valuable, and they serve
different operator habits:

- **2a (explicit verb)** is for operators who want zero-prompt,
  zero-confirmation capture and have the `/inbox` command in muscle
  memory.
- **2b (conversational paste)** is for operators who want to dump a
  URL into chat without remembering a command, and don't mind a
  one-tap confirmation in exchange.

The user-locked framing for 2b, 2026-06-08: *"copy and paste a link
directly into the agent-chat and have it ask if this should go to
the inbox, if so, the agent runs the commands on the backend."*

#### Vector 2a — `/inbox <url>` explicit verb

The friction-minimum *command* path — useful when the operator is
reading something elsewhere and wants to file it without leaving the
surface they're on. No agent reasoning step, no confirmation prompt,
just a direct call.

Shape, with progressively richer forms:

```
/inbox https://example.com/path
/inbox https://example.com/path "looks relevant to Schusterman apprenticeship work"
/inbox https://example.com/path #workforce-dev #state-policy
/inbox https://example.com/path "note text" #tag-a #tag-b
```

Resolves to the `corpus.inbox.add` capability. Chat returns a
one-line confirmation with the `corpus_path` and a `[browse inbox]`
link that pops the corpus-inbox remote into the shell.

Per [[../explorations/Agent-Chat-Skills-and-Commands-Candidates]] the
verb gets registered in the verb roster; `/inbox` is a simple
non-destructive read-write capability so the gating shape is mild.

#### Vector 2b — Conversational paste (no verb)

The friction-minimum *no-command* path — operator pastes a bare URL
into the chat, the agent recognizes the inbox-worthy shape and asks
a single-button confirmation. On yes, the agent calls
`corpus.inbox.add` with sensible defaults; on no, the URL is left
alone (treated as conversational context for whatever the operator
is actually doing).

##### Trigger detection — when does the agent offer to inbox?

The agent watches incoming chat messages for URL-shaped tokens.
"Inbox-worthy shape" is locked as **the message contains a URL and
either (a) the URL is the whole message after trimming, or (b) the
URL is accompanied by ≤ ~80 chars of prose that reads as a
drive-by note rather than a question or instruction.**

Worked examples — would offer inbox:

```
https://example.com/path
https://example.com/path                                ← bare URL, whitespace only
https://example.com/path looks relevant to Schusterman   ← URL + short note
https://example.com/path #workforce-dev                  ← URL + hashtag-style tag
"looks great" https://example.com/path                   ← short prefix + URL
```

Would NOT offer inbox (URL is reference, not save-intent):

```
what do you think about https://example.com/path?        ← clearly a question
can you summarize https://example.com/path for me        ← clearly an instruction
the article at https://example.com/path conflicts with what we found yesterday, can you reconcile?
                                                         ← long context, URL is reference
```

The classifier is **a small per-message LLM step** (Haiku-class, the
same tier used by relevance scoring in [[Entity-Pulse-Bundle]] —
cheap, fast, no need for the heavy model). Prompt asks "is this
operator's intent to save this URL for later, or to ask me something
about it?" Returns `intent: 'save' | 'question' | 'instruction' |
'unclear'`. Only `save` triggers the offer.

The classifier defaults conservatively — on `unclear`, the agent
*asks* rather than silently inboxing. Better to nudge and let the
operator dismiss than to inbox a URL they wanted you to read aloud.

##### The confirmation prompt — single-button + optional fields

When the agent decides to offer, the chat surface renders an inline
prompt below the operator's pasted URL:

```
┌──────────────────────────────────────────────────────────────┐
│ Save to inbox?                                                │
│                                                              │
│ https://example.com/path                                     │
│ (fetching title…)                                            │
│                                                              │
│ Note  ┌────────────────────────────────────────┐  (optional) │
│       │                                        │              │
│       └────────────────────────────────────────┘              │
│ Tags  workforce-dev, state-policy           (optional)       │
│                                                              │
│ [✓ Save to inbox]   [✗ Not now]   [⤴ Send to a record …]    │
└──────────────────────────────────────────────────────────────┘
```

Notes:

- **Title pre-fetch.** As soon as the agent offers, it fires a
  background `corpus.inbox.preview` (a thin wrapper around the
  existing `content_ingest.preview_url`) so the title and excerpt
  appear in the confirmation card before the operator clicks. The
  fetch is warm-cached by Jina; if the operator confirms, the
  `corpus.inbox.add` reuses the cache for free.
- **Note pre-fill.** If the message included prose alongside the
  URL ("looks relevant to Schusterman"), the prose is suggested as
  the default note. Operator can edit or clear.
- **Tag detection.** Hashtag-style tokens (`#workforce-dev`) in the
  message are pre-extracted into the tags field. Operator can edit
  or clear.
- **Third button — "Send to a record."** Escape hatch for "this
  isn't inbox-shaped, it belongs to a specific record I have in
  mind." Opens a record-set picker, then routes the URL through the
  same path the Content Reader manual-add uses (writes to
  `corpus/<funder-slug>/` instead of `inbox/`). Same backend
  plumbing, different `funder_slug`.

##### Off-mode behaviour — keep it forgivable

- **"Not now" never blocks the chat conversation.** The URL stays in
  the operator's message verbatim; the agent goes on to do whatever
  it was going to do with the message (answer the question, etc.).
- **Snooze-this-host pattern.** If the operator dismisses an offer
  for a host three times in a row (e.g. `github.com` URLs they
  paste while chatting about code, not about funders), the agent
  learns to skip the offer for that host for the rest of the
  session. Cheap heuristic, no backend storage; resets on session
  start. Per-host preference persistence is a v2 question.
- **Always-allow per-host.** A small "always offer for this host"
  toggle inside the confirmation card lets the operator pin trusted
  hosts (e.g. the foundation directory site they live in for an
  afternoon). Stored per-session in v1; persisted per-client in v2.

##### Why this is its own vector (not just the agent inferring `/inbox`)

Sub-mode 2b could in principle be implemented as "agent silently
runs `/inbox` when it sees a URL," but the confirmation step is
load-bearing for two reasons:

1. **Audit clarity.** The operator should *see* the agent decide to
   save before it saves. Silent saves create a "where did this come
   from" debugging surface later, especially in a session with many
   URLs in conversation.
2. **Intent ambiguity is real.** Operators paste URLs into chat for
   many reasons (asking a question, sharing a reference, dropping
   context for a multi-turn task). The classifier will be wrong some
   of the time; the confirmation is the cheap correction loop. As
   the classifier improves (operator-specific tuning over time) the
   confirmation friction can be downgraded to a "saved — undo?"
   toast.

So 2a and 2b stay as **siblings, not a hierarchy**. Same backend,
different operator habits.

### Vector 3 — Browser plugin / bookmarklet (future)

Option B of [[../explorations/In-App-Browser-Or-Plugin-For-Corpus-Add]].
When that ships, the plugin's default destination is the inbox
(rather than a specific record's corpus), precisely because the
plugin is invoked from contexts where the active-record handshake
isn't reliable. "Save this tab to my Augment-It inbox" is a much
simpler primitive than "save this tab to record X" and it's the
right default.

Plugin posts to the same `corpus.inbox.add` capability. Adds
`captured_from: "plugin"` for analytics later.

## Capabilities

New NATS subjects + workspace router entries, all in
`services/content-ingest/` (extending the existing content-ingest
service rather than spinning up a new one — inbox is corpus work,
not a separate domain):

### `corpus.inbox.add` (v1)

```
{ client_id, url, note?, tags?, captured_from, fetch?: boolean }
  → { corpus_path, written_at }
```

Internally:

1. Validate URL parses (http(s) only).
2. If `fetch: true` (default), call Jina via the existing
   content-ingest cache (`fetchViaJina` + `cache.set`).
3. Compose frontmatter per §Frontmatter schema above, with
   `funder_slug: "inbox"`, `pack_id: "inbox"`, `inbox_status:
   "pending"`, `captured_*` block populated, `triaged_*` block null.
4. Write to
   `clients/<client_id>/corpus/inbox/<YYYY-MM-DD>_<title-slug>.md`
   using the existing `addToCorpus` collision-suffix logic from
   `services/content-ingest/src/corpus.ts`.
5. Publish `corpus.inbox.added` for any subscribers (the inbox
   microfrontend's browse view should refresh on this).

Shares Jina cache + frontmatter writer + collision-suffix logic with
the existing `corpus.add`; should land as a thin variant rather than
a parallel implementation.

### `corpus.inbox.preview` (v1, for Vector 2b)

```
{ url } → PreviewResult
```

Thin alias for the existing `content_ingest.preview_url` capability,
exposed under the `corpus.inbox.*` namespace for chat-side
discoverability. Used by the conversational-paste confirmation card
to pre-fetch title + excerpt while the operator decides. Reuses the
same Jina cache, so a confirmed inbox-add is free.

Could be skipped (chat just calls `content_ingest.preview_url`
directly), but having the namespaced alias keeps the chat-side
capability surface coherent ("everything an `/inbox` flow needs
lives under `corpus.inbox.*`").

### `corpus.inbox.classify_intent` (v1, for Vector 2b)

```
{ message_text } → { intent: 'save' | 'question' | 'instruction' | 'unclear', extracted_url?, extracted_note?, extracted_tags? }
```

The per-message LLM classifier for the conversational-paste vector.
Wraps a Haiku-class prompt that decides whether the operator is
trying to save the URL or trying to do something else with it.
Extracts the URL, candidate note (prose accompanying the URL), and
candidate tags (hashtag-style tokens) for the confirmation card to
pre-fill.

The chat surface calls this on every incoming message that contains
a URL; cheap and cacheable. Cost discipline applies — batch where
possible, skip when the message has no URL token at all (regex
short-circuit).

### `corpus.inbox.list` (v1)

```
{ client_id, status?: "pending" | "triaged" | "discarded" | "archived",
  captured_from?: string, tag?: string, limit?: number }
  → { entries: InboxEntry[] }
```

Reads `clients/<client_id>/corpus/inbox/` (and optionally other
`corpus/` subdirs when filtering by `status: "triaged"`), parses
frontmatter, returns `InboxEntry[]` sorted by `captured_at` desc.

Reuses the frontmatter parser from `services/content-ingest/src/
corpus.ts`. The `InboxEntry` shape mirrors `CorpusEntry` with the
inbox blocks added.

### `corpus.inbox.triage` (future)

```
{ client_id, corpus_path, destination, note? }
  → { new_corpus_path }
```

Where `destination` is `funder_slug` | `"reference/<topic>"` |
`"discard"`. Moves the file from `inbox/` to its destination,
updates `triaged_*` frontmatter, flips `inbox_status: "triaged"` (or
`"discarded"` on discard, in which case file moves to
`corpus/_discarded/` for audit rather than being deleted — see Open
questions).

Specced separately when triage UX is designed.

## Triage layer (sketched, not designed here)

When triage gets specced, the destinations it routes to are:

- **`corpus/<funder-slug>/`** — record-specific. The triage UI/agent
  reads the record-set's row entity names and proposes which row
  this inbox item belongs to.
- **`corpus/reference/<topic-slug>/`** — cross-funder content. The
  client gets a freeform `topic-slug` vocabulary (operator-defined,
  not enforced). Useful for sector reports, regulatory documents,
  meta-research.
- **`corpus/_discarded/`** (or hard delete) — operator's "saw it,
  no." Lean: keep a `_discarded/` directory rather than delete, so
  the operator can recover from a mis-discard. The directory name
  stays plain (no dot-prefix), per the [[no-hidden-dot-folders]]
  feedback memory.

Two candidate UX paths for the triage surface itself:

### Path A — Direct triage UI

A third view-mode in the `corpus-inbox` microfrontend that lists
inbox items alongside a destination picker. The picker is populated
from:

- The currently-loaded record set's row entity names (so the
  operator triages "to funder X" with one click rather than typing).
- The client's known `reference/` topic slugs.
- The discard action.

Bulk affordances: discard all items captured today from a specific
session, route all items tagged `#workforce-dev` to a topic, etc.

Pros: deterministic, debuggable, ships fastest, no LLM cost.
Cons: per-item-click can be tedious at scale.

### Path B — Agent-chat triage harness

A chat-verb sequence: `/inbox-triage [--filter <tag>]` opens a
dialog where an agent reads each inbox item, scores it against the
client's record-set names + research context + topic vocabulary,
proposes a destination per item, and the operator yes/no/redirects
each in a tight loop. Agent uses the per-item `captured_note` as a
prior — "operator already flagged this for Reach apprenticeship
work" is a strong signal.

Pros: scales to large inboxes, operator triages "at the abstraction
level of reviewing the agent's calls" rather than per-item filing.
Cons: LLM cost, requires the agent harness to exist, harder to
debug a stuck triage flow.

Lean: **ship A first**, prove the data shape works, then build B on
A's primitives once they're solid. This mirrors the "ship the small
thing, observe, then commit" pattern that worked for the per-record
connector palette and Content Reader.

## What this spec is NOT trying to decide

- Which specific agent shape (LangGraph subagent, dedicated chat
  verb sequence, Augment-It's own dialog runtime) drives the future
  Path B triage UX. Triage spec will pick.
- Per-record-vs-global topic vocabularies for the `reference/`
  destination. The operator defines slugs ad-hoc in v1; vocabulary
  curation is a v2 question.
- How the inbox integrates with cross-client research. v1 inbox is
  strictly per-client; cross-client capture is a separate question.

## Open questions

- **Per-client vs global inbox.** Lean per-client (mirrors corpus
  shape; clients are the privacy boundary per
  [[../explorations/Per-Client-Privacy-and-the-Path-Off-Local]]).
  But a researcher who reads industry pieces relevant to *several*
  clients hits friction filing the same URL N times. v1: per-client;
  consider a global `~/.augment-it/inbox/` if friction becomes
  real.
- **Capture-without-fetch.** Ship `fetch: true` only in v1. Add
  `fetch: false` once the first round of capture friction is
  understood. If Jina fetch latency is the bottleneck, that's a
  real signal worth knowing.
- **Auto-dedup on capture.** If the operator captures the same URL
  twice, do we collapse or duplicate? Lean: collapse — update
  `captured_at` to the new value, append the new note to the
  existing entry's `captured_note`, leave `captured_at` on the
  original as `original_captured_at`. This mirrors Rule 6 of
  [[Funder-Content-Corpus-Workflow]] (already-in-corpus items don't
  reappear).
- **Inbox stub left behind on triage?** When triage moves an item
  out of `inbox/`, should a small stub remain (so the operator
  remembers they triaged it without browsing every funder folder)?
  Lean: no — clean move, the `triaged_*` block in the destination
  file is the audit. The browse view's "show triaged" filter can
  surface them when wanted.
- **Discard: delete or archive?** Lean: archive to
  `corpus/_discarded/` (visible directory, gitignored if the
  per-client repo cares; per [[no-hidden-dot-folders]] no
  dot-prefix). Hard delete is a v2 affordance, gated.
- **Chat verb client-scoping.** Should `/inbox` ask which client
  when multiple are active in the chat session? Lean: default to
  the chat session's active client, prompt only if ambiguous (and
  remember the choice per-session).
- **"Inbox items relevant to this record" affordance in Content
  Reader.** When the operator opens Content Reader for record X
  and the inbox has items the system could plausibly route to X
  (URL host matches `row.url`, or operator's `captured_note`
  contains the entity name), surface them as a candidates strip
  with a one-click "promote to this record's corpus" action. Lean:
  yes, ship this in Content Reader once the inbox is real — the
  feedback loop closes nicely.
- **Visibility into the inbox from the Augment-It home / shell
  status bar.** A small "n items in inbox" badge in the shell
  status bar nudges the operator to triage periodically. Lean: ship
  in v1; it's a single capability call and three lines of UI.
- **What happens to a session's captures when the session ends?**
  Inbox is per-client, not per-session, so captures persist
  independently. `captured_session_id` is optional metadata for
  "review my captures from today" queries. Lean: don't gate any
  behaviour on session — captures are durable per-client artefacts.
- **Vector 2b classifier conservatism.** On `intent: 'unclear'`,
  should the agent offer (and let the operator dismiss) or stay
  silent (and let the operator type `/inbox` if they wanted to)?
  Lean: **offer.** Dismissing is one click; missing a capture costs
  the URL. Reconsider if dismiss-rate is high enough to be
  annoying.
- **Vector 2b classifier learning.** As the operator dismisses /
  confirms over time, should the classifier adapt? Per-operator
  fine-tuning is overkill at our scale; per-operator *prompt
  shaping* (e.g. "this operator often pastes GitHub URLs for code
  questions; deprioritize save-intent for github.com") is feasible.
  Lean: ship the static classifier in v1, revisit after watching
  real dismissals.
- **Vector 2b "Send to a record" path.** The third button on the
  confirmation card opens a record-set picker. How does it pick
  *which* record set when the chat session has none active? Lean:
  default to the operator's most-recently-touched record set
  (workspace can already answer this); fall back to a picker if
  none.
- **Vector 2b and the per-host preference store.** Snooze + always-
  allow are in-session in v1. Per-client persistence (per
  [[../explorations/Per-Client-Privacy-and-the-Path-Off-Local]]
  Path D) is a v2 candidate — store as a small `inbox-prefs.yaml`
  inside the per-client repo so the preference moves with the
  client.

## Migration / first concrete implementation step

1. **`corpus.inbox.add` backend capability** in `services/
   content-ingest/` reusing the Jina cache + frontmatter writer.
   No UI yet — verified via NATS request from a test script.
2. **`apps/corpus-inbox/` microfrontend scaffold** with Capture
   mode only (no Browse). Federated remote on a new port (the
   shell's port allocation should pick the next available — likely
   `:3010` given current allocations through `:3009`).
3. **`/inbox` chat verb** wired to `corpus.inbox.add`. Capture
   Vector 2a is live.
4. **Vector 2b — conversational paste**. Chat surface gains a
   pre-send message hook that calls `corpus.inbox.classify_intent`
   on any message containing a URL; on `intent: 'save'` (or
   `'unclear'`), renders the inline confirmation card with
   `corpus.inbox.preview` pre-fetching title/excerpt. Confirm →
   `corpus.inbox.add`. Includes the per-host snooze + always-allow
   in-session heuristics.
5. **Browse mode** in the microfrontend, read-only. Lists items,
   filters by tag/status. Per
   [[../explorations/Agent-Chat-Skills-and-Commands-Candidates]],
   a `/inbox-list [--tag X] [--from Y]` chat verb can sibling this
   if useful.
6. **Status-bar badge** in the shell — "N inbox items pending
   triage" — nudges the operator.
7. **(Parallel) plugin / bookmarklet path** per the existing
   exploration; defaults its destination to `corpus.inbox.add`.
8. **Triage spec** when there's real inbox volume to triage
   against. Path A direct UI ships first.

Per the [[branch-cadence]] feedback memory: the microfrontend
scaffold is a named branch + PR; the backend capability + chat
verb are trunk-shaped commits.

## See also

- [[Funder-Content-Corpus-Workflow]] — the spec this plugs into.
  Inbox is the third path of Step 5 (alongside 5a pack-discovered
  and 5b operator manual-paste); triage routes inbox items into
  the same per-funder corpus shape.
- [[Response-Reviewer-Shell-and-Content-Reader-Mode]] — the
  Content Reader is the sibling capture surface for record-scoped
  URLs; inbox is for unscoped URLs.
- [[../explorations/In-App-Browser-Or-Plugin-For-Corpus-Add]] —
  Option B (browser plugin) defaults to inbox as its destination.
- [[../explorations/Agent-Chat-Skills-and-Commands-Candidates]] —
  `/inbox`, `/inbox-list`, `/inbox-triage` get registered there.
- [[../explorations/Per-Client-Privacy-and-the-Path-Off-Local]] §Path
  D — the per-client filesystem layout that inbox extends.
- [[Pulse-Curation-Layer-and-UI]] — three-layer raw / curated /
  finalized pattern for pulse-shaped bundles; inbox triage has
  *shape* similarities (raw → triaged) but is single-item-shaped,
  not rollup-shaped, so it doesn't inherit the curation pattern
  directly.
