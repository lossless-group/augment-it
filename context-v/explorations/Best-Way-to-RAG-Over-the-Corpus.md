---
title: "Best Way to RAG Over the Corpus — design space for retrieval-augmented operations on augment-it's per-client corpus, given the structured frontmatter we just earned"
lede: "245 corpus files carry `funder_slug` and `published_at`, so retrieval is facet-filter-first — embeddings handle the residual about-ness."
date_created: 2026-06-11
date_modified: 2026-06-11
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-11 — Initial draft, written immediately after the published_at lift + backfill landed (the corpus's first-class metadata surface is now load-bearing for retrieval; before tonight, dates lived in body text and a metadata-filtered retrieval would have missed 244 of 245 files). Captures the design space rather than picking a winner — the phased plan at the bottom is the recommended sequence but Phase 1 is the only step that doesn't depend on usage data we don't have yet.
tags:
  - Exploration
  - Augment-It
  - RAG
  - Retrieval
  - Vector-Store
  - Chroma
  - Hybrid-Search
  - Metadata-Filtering
  - Corpus
  - Embeddings
  - MCP
  - Living-Roster
status: Active

# Related cross-tree skills
related_skills:
  - chroma-local
  - chroma-cloud
  - search-lossless-corpus
site_uuid: 5c24a169-70f5-4747-b789-03a4c1836972
hex_code: ie8zvz
date_authored_initial_draft: 2026-06-11
date_authored_current_draft: 2026-06-11
---

# Best Way to RAG Over the Corpus

## Why this question now

Until tonight, the corpus was a flat set of markdown files keyed by
`record_id` (the row identity) and stamped with `funder_slug` (the
directory). The retrieval primitive was filesystem-level:
`listForRecord` walked dirs and parsed frontmatter to assemble the
chip count. That works for "show me files attached to this row" but
not for "what does the corpus say about X."

The published_at backfill and the record_uuid backfill both ran
tonight. The corpus now has — across 245 reach-edu files — top-level
frontmatter for:

- `title` — Jina-extracted page title
- `exact_url` — canonical source URL
- `fetched_at` — when WE pulled it
- `published_at` — when the source authored it ← **new tonight**
- `record_id` — row identity in the current record set
- `record_uuid` — lineage-stable identity across promotions
- `funder_slug` — which row's corpus this belongs to (the slug-join)
- `pack_id` — which capability flow added it
- `tags[]` — operator-curated topical tags
- `inbox_status`, `captured_*`, `triaged_*` (inbox-only)
- `binary_asset.{filename, sha256, size_bytes, content_type}` for PDFs
- `extra_metadata.{language, description, jina_status, content_length_bytes, ...}`

That's a lot of structured signal. The question this doc explores:
**given this metadata surface, what's the best way to make the
corpus retrievable beyond the filesystem-level join?**

This isn't pure semantic search and shouldn't be designed as if it
were. It's hybrid: the metadata facets do most of the filtering, and
dense embeddings handle the residual "about-ness" once the candidate
set is small.

## The shape of useful retrieval

Concrete operator questions the system should answer:

- *"What's the freshest material on Hewlett's K-12 strategy?"* —
  funder filter + topic embedding + sort by `published_at`
- *"Has any funder we track funded community college apprenticeship
  programs in the last two years?"* — date filter +
  cross-funder semantic search + return funder grouping
- *"This new prospect just landed. What do we already know about
  them?"* — embed prospect description + retrieve across the whole
  inbox + group by similarity
- *"Find the document that says 'pay-for-performance' next to a
  philanthropy's name."* — keyword + funder filter + return context
- *"What sources cite the WEF Future of Jobs 2025 report?"* —
  exact_url substring search + reverse-link surface
- *"Summarize Kellogg's grantmaking priorities from their last three
  press releases."* — funder filter + sort-by-published_at top-3 +
  abstractive synthesis

Notice the pattern: every question starts with structured filters
(funder, date range, document type) and ends with either semantic
similarity, keyword match, or abstractive generation. The metadata
isn't auxiliary; it's the first move.

Pure-embedding RAG would force every one of these through cosine
similarity over 245+ chunks, which is both expensive and noisy. A
hybrid retrieval that filters first and ranks second is dramatically
better — both in accuracy and in cost.

## Vector store choice

### Local Chroma (recommended starting point)

The wider lossless-monorepo already has a local Chroma MCP wired in
at user scope and at `.mcp.json`. The `chroma-local` and
`search-lossless-corpus` skills encode the discipline for using it.
Four collections already exist (`context-vigilance-corpus`,
`lossless-changelog`, `claude-code-sessions`,
`claude-code-tool-traces`) and the ingest pipeline lives at
`ai-labs/context-vigilance-kit/scripts/`.

Adding an `augment-it-corpus` (or per-client `augment-it-corpus-
reach-edu`) collection to the existing infrastructure is the
cheapest move. The Chroma client supports rich metadata filtering
(`where={"funder_slug": "hewlett-foundation"}`), so hybrid retrieval
is one query.

| Pro | Con |
|---|---|
| Zero new infra; reuses existing MCP wiring | Single-user; local-only |
| Metadata filter + embedding ranking in one query | Re-index cost is on the laptop |
| Same patterns as other Lossless tooling | Won't scale beyond ~100K files comfortably |
| Free | Backup discipline is the operator's problem |

### Chroma Cloud (graduation target)

When multi-user reach matters (a co-researcher sharing the corpus, a
splash page exposing corpus search publicly, embedding the corpus in
a shipped product), Chroma Cloud's `CloudClient` is a drop-in API
match for the local `ChromaClient`. The `chroma-cloud` skill
documents the migration shape.

Defer this to Phase 3 in the plan below. Local-first earns its way
to cloud.

### pgvector / single-store hybrids

If augment-it ever consolidates row-store into a Postgres backend,
pgvector becomes attractive (one DB for everything). Today row-store
is a flat JSON file, so this is hypothetical and not on the
critical path.

### Why not "just" build something custom

The `sqlite-vss` / `faiss` / hand-rolled embedding store paths are
fine for a one-off; they're not fine for augment-it because:

1. We give up the Chroma MCP server's protocol — the chat surface
   can't call them via MCP.
2. We give up metadata filtering (faiss-only stores need a sidecar
   metadata DB and you join client-side; Chroma does this natively).
3. The other Lossless tools that already query Chroma can't reach
   them.

Chroma is the cheapest answer here precisely because the surrounding
tree already standardized on it.

## Chunking strategy

The Lossless corpus has a working pattern from
`ai-labs/context-vigilance-kit/scripts/ingest-all.sh`: section-chunk
by markdown H2. That's right for augment-it too, with one adaptation
— Jina's output isn't structured under H2s. It's typically a long
flat body. So:

**Chunking rules per source type:**

| Source | Strategy |
|---|---|
| Jina-extracted webpage (most .md files) | Sliding window of 800 tokens with 100-token overlap |
| Hand-curated markdown (rare in corpus today) | Section-chunk by H2; fall back to sliding window if no H2s |
| PDF-derived markdown (binary_asset block present) | Section-chunk by detected headings; sliding window otherwise |
| Inbox stubs (operator-dropped, no body yet) | Skip — re-ingest after triage |

Each chunk carries the full frontmatter as metadata so a filter
query (`where={"funder_slug": "hewlett"}`) hits all chunks of all
hewlett documents.

**Chunk identity** should be `{record_uuid}_{chunk_index}` — using
`record_uuid` not `record_id` because the uuid is lineage-stable
across `/promote-snapshot`. When v10 → v11 happens, the same chunk
ID resolves to the new row without re-embedding. (This is exactly
the same reason `corpus.add` started stamping `record_uuid` in
commit `3a97892`.)

**Re-index trigger**: a NATS event `corpus.added` (existing) +
`corpus.published_at_changed` (new) + `corpus.removed` (new) drive
chunk-level updates. Full re-index lives in
`scripts/index-corpus.mjs` and runs on demand (and after every
`/promote-snapshot`).

## Embedding model

For local-first, **`all-MiniLM-L6-v2`** (384-dim, MIT, Chroma's
default) is fine for a first cut. It's cheap, fast, and Chroma
ships with it.

Upgrade path when retrieval quality matters:

- **`bge-large-en-v1.5`** (1024-dim, MIT) — strong English-only
  performance; fits the corpus today
- **`text-embedding-3-small`** (1536-dim, OpenAI API) — best quality
  / cost ratio if we want to pay
- **`voyage-2`** (1024-dim, paid API) — strong on long contexts; fits
  PDF-extracted chunks

The corpus is currently English-only (Jina's `x-language` header
mostly returns `en`). When that changes we want a multilingual
model — `bge-m3` is the obvious choice.

**Embed at ingest time, store the embedding in Chroma, never re-embed
unless the model changes.** A model-version field in the collection
metadata makes regeneration straightforward.

## Per-funder collections vs single-with-filter

The slug-join discipline means every chunk has a `funder_slug` that
identifies its row. Two ways to use that:

### Single collection with metadata filter

```
collection: augment-it-corpus-reach-edu
chunks: ~2500 (from 245 files at ~10 chunks/file average)
query: { texts: ["K-12 strategy"], where: { funder_slug: "hewlett-foundation" } }
```

Pros: One index. Simple ingest. Cross-funder queries are trivial
(omit the `where`). One backup target.

Cons: A 2500-chunk filter-then-embed is fast for now but ugly at
50K+ chunks. The `where` filter happens BEFORE embedding similarity
in Chroma, so this scales well — but the index file grows linearly.

### Per-funder collections

```
collections: augment-it-corpus-reach-edu-hewlett, ...-kellogg, ...-inbox, ...
chunks: 10-100 per collection
query: client picks collection from funder_slug
```

Pros: Smaller indexes per collection. Backup-per-funder. Easier
to delete-a-funder's-corpus.

Cons: Cross-funder queries (the more common operator question by
far) require fan-out. Operator-curated cross-funder tags can't be
indexed cleanly. The collection list grows unbounded.

**Recommendation: single collection.** The cross-funder query is
the common case; the per-funder query is just a `where` clause. The
chunk count doesn't justify the operational overhead of N
collections.

Exception: **the inbox gets its own collection** (`augment-it-
corpus-reach-edu-inbox`) because inbox documents have a triage
lifecycle — they get re-routed, deleted, or moved out of inbox.
Keeping the lifecycle isolated in its own collection means triage
operations don't pollute the funder-attributed index. After triage,
a file's chunks move from the inbox collection to the main one.

## Where retrieval lives in the runtime

The existing pattern: lens calls `workspace.invoke('corpus.list_for_
record', ...)` → workspace dispatches NATS request → content-ingest
handler returns. Mirror that:

```
corpus.retrieve.requested
  args: {
    client_id: string;
    query: string;              // natural language or keyword
    funder_slug?: string;       // optional metadata filter
    record_uuid?: string;       // optional — scope to one row
    published_after?: string;   // ISO date
    published_before?: string;
    pack_id?: string;           // which capability flow
    tags?: string[];            // any/all match
    top_k?: number;             // default 8
    include_chunks?: boolean;   // default true
  }
  reply: {
    hits: Array<{
      record_uuid: string;
      corpus_path: string;
      title: string;
      published_at: string | null;
      funder_slug: string;
      chunk_index: number;
      chunk_text: string;
      similarity: number;
      record_id: string;
    }>
  }
```

The handler reads from Chroma (initial implementation: through the
existing `chroma` MCP server; medium-term: a dedicated client
embedded in content-ingest for lower latency).

A new workspace capability `corpus.retrieve` with a generous timeout
(say 10s) exposes this to the chat surface, the lens, and any
future surface.

## Operator-facing surfaces

### Chat surface citations

The chat already routes verbs. Add `/recall <query>` (or auto-detect
"what do we know about" intent) — fires `corpus.retrieve` with the
current record-set as `client_id`, displays top-K hits as LFM
citations using the hex-code citation pattern (`[[...]]` with
metadata-rich preview). Clicking a citation opens the source .md in
a side panel.

This is where the `lossless-flavored-markdown` skill's citation
rendering becomes load-bearing. The corpus hit's `corpus_path` +
`chunk_index` form a stable address. The chat output ships with the
citation already embedded; the operator gets a paragraph of
synthesis with sources next to it.

### Lens-side retrieval-backed chips

Right now the chip says `corpus N` — a count. Once retrieval is
live, hovering the chip could pop a one-line summary of the corpus
for that row, drawn from the top-K query of "what is the main
theme of this row's corpus?" Pre-computed at index time, cached
until the corpus changes.

A new lens — call it the **Retrieval Lens** — could be the inverse
view: enter a query, see which rows have corpus that matches, ranked
by similarity. Useful when an operator is hunting for "which funder
already has work that overlaps with X."

### MCP export

If we register a `corpus.retrieve` MCP server, other Lossless tools
in the tree — the chat surface, the lossless-monorepo's main Claude
Code session, sibling projects — can query the corpus over a
standard protocol. The `search-lossless-corpus` skill becomes an
analog of `search-augment-it-corpus`, with the same shape.

This is the "graduate the corpus as an asset other tools can query"
move. Phase 3, but worth shaping for.

## How the inbox composes

The inbox is a triage zone. Files there have `inbox_status:
"pending"` and are intended to move out into a funder dir (or get
discarded). Retrieval over the inbox is a different operation than
retrieval over assigned files:

- **Triage-assist retrieval**: "this inbox file mentions X — which
  funder does that match?" The system surfaces 3 candidate funders
  whose corpus already covers X, suggests one as the destination.
- **Inbox dedupe**: "is this new capture already in the corpus?"
  Embedding similarity over the inbox itself + the assigned corpus,
  returns nearest neighbors with a confidence band.
- **Inbox-as-corpus-too**: the inbox file's content is sometimes
  exactly what the operator wants in a retrieval answer — even
  before triage. Querying both collections (`inbox` + `assigned`)
  with a result-set filter that marks inbox hits visually is the
  right shape.

The `inbox-sort-by-agent-tasks` exploration (sibling doc) gets into
how the inbox's task structure interacts with retrieval. They're
orthogonal axes — retrieval is "what does the corpus say"; task
sorting is "what should I do next." Both feed off the same metadata.

## Phased plan

### Phase 1: index + retrieve (this branch's natural follow-on)

- New script `scripts/index-corpus.mjs`. Walks `clients/<client>/
  corpus/**/*.md`, chunks by sliding window, embeds with
  all-MiniLM-L6-v2 via the chroma MCP, writes to `augment-it-
  corpus-<client>` collection.
- New NATS handler `corpus.retrieve.requested` in content-ingest.
- New workspace capability `corpus.retrieve` (10000ms timeout).
- Verify against three operator-style queries:
  - "what's Hewlett's K-12 strategy" → returns top-K from hewlett-foundation dir
  - "community college apprenticeship since 2024" → returns cross-funder hits filtered by published_at
  - "WEF Future of Jobs report" → returns the existing inbox PDFs that mention it

### Phase 2: surface integration

- `/recall <query>` chat verb fires `corpus.retrieve` and returns
  LFM-cited synthesis. Citation format pairs `corpus_path` +
  `chunk_index` for stable addressing.
- Retrieval Lens (new app under `apps/`) — search box + result list
  + filter chips for funder / date / tags.
- Chip hover summary on Sort & Filter Lens (pre-computed per-row
  topical synthesis, cached).

### Phase 3: graduate

- Migrate to Chroma Cloud when multi-user / production reach is
  needed. `CloudClient` replaces `ChromaClient`. Same code, same
  collection layout.
- Register `corpus.retrieve` as an MCP server so the broader
  Lossless tree can query augment-it's corpus.
- Embedding model upgrade: re-index from all-MiniLM-L6-v2 → BGE or
  paid OpenAI/Voyage based on retrieval-quality evidence collected
  in Phases 1-2.

## Open questions

- **Embedding model**: stick with default through Phase 1, or
  invest in BGE upfront? Recommendation: start with default, swap
  if retrieval quality stalls.
- **Chunk overlap budget**: 100 tokens at 800-window is a guess.
  Measure recall-at-K after Phase 1 and adjust.
- **PDF text quality**: Jina's text from PDFs is uneven — table-
  heavy reports lose structure. Worth a separate path that uses
  Marker / PyMuPDF for PDFs the operator marks as "high-value"?
  Probably yes, but not Phase 1.
- **Re-ranking**: after Chroma returns top-K, run a cross-encoder
  (e.g. `bge-reranker-large`) to re-rank? Adds latency but bumps
  precision. Decide after seeing Phase 1's baseline.
- **Multi-tenancy**: per-client collections vs one collection with
  `client_id` filter? The single-tenant single-collection model is
  the floor; multi-tenant comes when a second client (humain-vc?)
  has real corpus.
- **Eval discipline**: a small JSONL of operator-curated
  query→expected-hits pairs would let us measure retrieval quality
  across embedding model changes. Build this as Phase 1 lands.

## See also

- [[../skills/search-lossless-corpus]] — the broader Lossless
  retrieval discipline (four collections via Chroma MCP, four-step
  agentic search loop, citation discipline)
- [[../skills/chroma-local]] — Chroma client patterns, local
  persistence, the ingest discipline
- [[../skills/chroma-cloud]] — graduation path when local stops
  scaling
- [[../skills/lossless-flavored-markdown]] — citation rendering
  on retrieval hits
- [[Inbox-Sort-by-Agent-Tasks]] — sibling doc on the triage-side
  task structure; this doc's "inbox composes" section interacts
  with that one
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the existing
  exploration on parallel research agents; retrieval is the
  read-side analog of that write-side fan-out
- `services/content-ingest/src/corpus.ts` — `listForRecord` (the
  filesystem-level join this complements, doesn't replace)
- `ai-labs/context-vigilance-kit/scripts/ingest-all.sh` — the
  precedent ingest pipeline; structure to mirror
