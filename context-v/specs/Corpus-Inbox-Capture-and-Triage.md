---
title: "Corpus Inbox — capture first, triage later; a zero-friction save destination for URLs without a home yet, with a future triage layer that sorts inbox content into the right places"
lede: "While researching funders the operator finds URLs that don't yet have a home — articles about the right funder but at a different angle than the active record, cross-funder pieces mentioning several records at once, sector reports, regulatory documents, downloadable PDFs, destination sites worth remembering. The existing Content Reader manual-add affordance requires an active record context; without one the operator either makes a premature filing decision or loses the URL to a tab graveyard. Corpus Inbox is the missing third path: a zero-friction `clients/<client>/corpus/inbox/` destination that captures the URL + Jina-fetched body + operator's drive-by note, holds it in pending state, and waits for triage. Capture vectors at v1: a dedicated microfrontend (`apps/corpus-inbox/`) and a chat verb (`/inbox <url>`); a future browser-plugin capture vector slots in cleanly per the [[../explorations/In-App-Browser-Or-Plugin-For-Corpus-Add]] sketch. The triage layer — direct UI or agent-chat harness that routes inbox items to `corpus/<funder-slug>/`, `corpus/reference/<topic>/`, or `discard` — is scoped here but specced separately. This spec is the *prerequisite* for healthy manual-add work: without an inbox the operator can't research freely without paying a filing tax on every discovery."
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-08 — Initial draft. Written immediately after shipping the Content Reader manual-URL add ([[Funder-Content-Corpus-Workflow]] v0.0.0.2, Step 5b). The operator's framing: *"I don't want to proceed to augment with human-searched links for record-focused corpus content without having some way to capture everything I am seeing."* Inbox is gating further per-record manual-add work — capture has to be cheap before triage can be deliberate.
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
captured_from: "content-reader"    # content-reader | chat | plugin | inbox-direct
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

### Vector 2 — `/inbox` chat verb

The Augment-It chat surface (`apps/chat/`) gets a new verb. The
friction-minimum capture path — useful when the operator is reading
something elsewhere and wants to file it without leaving the surface
they're on.

Shape, with progressively richer forms:

```
/inbox https://example.com/path
/inbox https://example.com/path "looks relevant to Schusterman apprenticeship work"
/inbox https://example.com/path #workforce-dev #state-policy
/inbox https://example.com/path "note text" #tag-a #tag-b
```

Resolves to the same `corpus.inbox.add` capability the microfrontend
uses. Chat returns a one-line confirmation with the `corpus_path` and
a `[browse inbox]` link that pops the corpus-inbox remote into the
shell.

Per [[../explorations/Agent-Chat-Skills-and-Commands-Candidates]] the
verb gets registered in the verb roster; `/inbox` is a simple
non-destructive read-write capability so the gating shape is mild.

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

## Migration / first concrete implementation step

1. **`corpus.inbox.add` backend capability** in `services/
   content-ingest/` reusing the Jina cache + frontmatter writer.
   No UI yet — verified via NATS request from a test script.
2. **`apps/corpus-inbox/` microfrontend scaffold** with Capture
   mode only (no Browse). Federated remote on a new port (the
   shell's port allocation should pick the next available — likely
   `:3010` given current allocations through `:3009`).
3. **`/inbox` chat verb** wired to `corpus.inbox.add`. Capture
   vector 2 is live.
4. **Browse mode** in the microfrontend, read-only. Lists items,
   filters by tag/status. Per
   [[../explorations/Agent-Chat-Skills-and-Commands-Candidates]],
   a `/inbox-list [--tag X] [--from Y]` chat verb can sibling this
   if useful.
5. **Status-bar badge** in the shell — "N inbox items pending
   triage" — nudges the operator.
6. **(Parallel) plugin / bookmarklet path** per the existing
   exploration; defaults its destination to `corpus.inbox.add`.
7. **Triage spec** when there's real inbox volume to triage
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
