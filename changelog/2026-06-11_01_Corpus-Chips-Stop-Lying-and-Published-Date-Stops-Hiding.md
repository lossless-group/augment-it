---
title: "Corpus chips stop lying — the records sheet column the operator was already editing becomes the join key; and Jina's `Published Time:` stops sitting unread in the body of every capture, lifting to top-level frontmatter on every write going forward and backfilled into 244 .md files retroactively"
lede: "Tonight started with a small symptom — three rows in the Sort & Filter Lens on the v10 record set showing `corpus 0` despite per-funder corpus directories full of files on disk: hewlett-foundation (2 files), howard-schultz-foundation (6), kellogg-foundation (6). The yesterday-night issue file had named four others (sobrato, stand-together, cohen, todd-fisher) and proposed a per-client `corpus-overrides.yaml` as the defense-in-depth fix. Hard-refresh resolved those four cleanly — but exposed these three. A second NATS probe confirmed the backend was returning the correct counts (2 / 6 / 6) end-to-end for the new symptoms too. The actual bug was in the wire, not the join: `corpus.list_for_record` had no `CAPABILITY_TIMEOUTS_MS` entry so dispatch fell through to the 5000ms default, the content-ingest handler is a serial `for await` loop, and each call walked every funder directory under `clients/<id>/corpus/` (~40 dirs × ~300 .md files). With 96 visible rows firing 96 parallel requests on view load, late ones in the burst timed out and the lens swallowed the error silently — race timing explained why sobrato et al. recovered post-refresh and hewlett/schultz/kellogg didn't. The operator's framing: *'shouldn't there be a pretend join where the column in the records sheet for corpus references a folder name/relative path?'* The records sheet already populates `corpus_funder_slug` per row. Wiring that into `listForRecord` as the primary join key dissolved THREE things at once: the bug (operator's explicit assertion routes around every lineage edge case), the timeout race (per-request walk went from 300 files to ≤13), and the planned `corpus-overrides.yaml` proposal (the cell IS the override surface — no new file format needed). Lineage stays as the fallback for rows without a slug. While the door was open we noticed something else: Jina's response body has a `Published Time:` preamble line on every capture, and we'd been writing it to the body but never lifting it into frontmatter. The sort/filter UIs had no first-class authored-date field. A six-line addition to `jina.ts` parses the preamble + a `liftPublishedAt` helper in `corpus.ts` promotes it between `fetched_at:` and `record_id:` on both writers. A sibling backfill script rescued 244 dates from existing files (some going back to Wikipedia article creation dates from 2004 — the corpus carries deep history we couldn't see). Also tonight: 226 hand-curated captures across 20 funder directories + 86 inbox triages from the operator's v10 hand-search rhythm, including the first `manual-local-pdf` convention (operator drops a ResearchGate PDF from a local download; sidecar .md flags the missing canonical URL for later replacement). The slug-join means each of those 20 new funder dirs surfaces on its row's chip the moment the dir exists, no record_uuid plumbing required."
publish: true
date_created: 2026-06-11
date_modified: 2026-06-11
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Corpus
  - Sort-Filter-Lens
  - Lineage-Join
  - Slug-Join
  - Workspace-Timeout
  - Jina
  - Frontmatter
  - Published-Date
  - Inbox
  - Backfill
  - Operator-Intuition
files_changed:
  - services/content-ingest/src/corpus.ts (listForRecord accepts corpus_funder_slug?; when present, scans only `corpus/<slug>/` and treats every .md in that dir as belonging to the row — strategy 0; lineage strategies 1/2/3 stay as fallback for rows without a slug. liftPublishedAt helper promotes extra_metadata.published_at to a top-level `published_at:` line between fetched_at and record_id on BOTH buildFrontmatter and buildInboxFrontmatter; stripped from the extra block to avoid duplication)
  - services/content-ingest/src/handlers.ts (fetchRowMetaByRowId / getRowMetaByRowId replace the prior uuid-only cache; one row.list pass builds {uuids, slugs} parallel maps with the same 60s cache + in-flight dedup. corpus.list_for_record.requested handler passes meta.slugs.get(row_id) to listForRecord as corpus_funder_slug. getRecordUuidByRowId becomes a shim returning meta.uuids for corpus.add's stamping path)
  - services/content-ingest/src/jina.ts (NEW parsePreamble — reads Jina's leading `Key: Value` lines until `Markdown Content:` separator, cap 30 lines, blank lines BETWEEN entries are NOT a terminator. NEW normalizeToISO — feeds ISO/RFC-2822/plain-date through new Date and returns ISO 8601 or null when un-parseable. published_at lifted into extra, plus description / language when present and not already in extra from response headers)
  - services/workspace/src/capabilities.ts (corpus.list_for_record gets a 15_000ms entry — post-slug-join it shouldn't need it, but the 5s default was too tight for any cold-start fan-out and the new entry is belt-and-suspenders)
  - scripts/backfill-corpus-record-uuid.mjs (NEW — sibling to the published_at backfill, dry-run by default. Walks clients/<id>/corpus/**/*.md, fetches the row_id → record_uuid map via NATS row.list.requested, stamps record_uuid into files whose record_id resolves in row-store but whose frontmatter doesn't carry the uuid yet. Categorizes: already-stamped, backfill, stale-uuid (file disagrees with row-store — LOGGED, never overwritten), orphan-no-row, orphan-null-id. Reach-edu dry-run found 201 stampable, 0 stale conflicts, 64 null-id all in inbox/ — apply not run yet, kept as independent hygiene)
  - scripts/backfill-corpus-published-at.mjs (NEW — sibling. Walks .md files, parses body preamble for Published Time, inserts top-level published_at: directly after fetched_at:. Idempotent re-runs report 0 backfill candidates. Reach-edu apply stamped 244 files; 272 files have no Published Time in body (mostly PDFs); 2 Lumina files surfaced an un-parseable "2025-03-04EST09:00:00EST" format flagged for hand-review)
  - context-v/issues/Some-Records-Show-Empty-Corpus-Despite-Directories-on-Disk.md (semantic_version 0.0.0.1 → 0.0.0.2 — new top section "2026-06-10 follow-on" reframes the issue: real root cause is the wire (timeout + serial handler + walks-all-dirs), slug-join supersedes the corpus-overrides.yaml proposal, sequencing revised. Original draft preserved below as history)
  - clients/reach-edu (submodule bump — see reach-edu commits below for the 226-file corpus session and the 245-file published_at backfill)
---

# Corpus chips stop lying, and Published Date stops hiding

## Why care

Two failure modes the operator was carrying in their head all evening
got resolved with the same kind of move: *what the system is trying to
infer, the operator already knows and can state directly.*

The first was the corpus chip. The Sort & Filter Lens has a column
that says `corpus N` per row — "this record has N captured documents
on disk." When it says 0, the operator assumes there's nothing there
yet, and reaches for the hand-search rhythm. That was wrong tonight:
three records (hewlett, schultz, kellogg) had files on disk and the
chip said 0 anyway. The system was trying to *deduce* which dir
belonged to which row by chasing a lineage chain through `record_id`
→ `record_uuid` → row-store → match-by-uuid — and timing out under
fan-out before the deduction could finish.

The records sheet has a `corpus_funder_slug` column. The operator
edits it. It already says "this row's corpus lives in
`corpus/hewlett-foundation/`." We didn't have to deduce anything.

The second was the publish date. Jina puts `Published Time:
2004-04-02T02:43:06Z` near the top of every response body. We were
writing it straight into the .md file's content and never looking at
it. The sort/filter UIs had no first-class authored-date field —
when the operator wanted to ask "what's the freshest material on
this funder," there was no way to answer. The date was sitting *in
the file* the whole time. We just had to lift it.

Both moves are about respecting what's already explicit.

## What's new

- **`corpus.list_for_record` joins by `corpus_funder_slug` first**,
  lineage second. Per-request walk drops from "all dirs × all
  files" (~300 files) to "one dir × ≤13 files." Hewlett / schultz /
  kellogg chips now read 2 / 6 / 6 on first paint, no refresh
  required. Verified against the NATS subject in 4-51ms per row
  (was: 5s timeout race).
- **The `corpus-overrides.yaml` proposal is superseded.** The
  override surface is now the records-sheet cell. Operator edits
  one column to repoint a row's corpus; no new file format, no new
  capability, no new lens UI affordance to maintain.
- **Workspace timeout for `corpus.list_for_record`** bumped from
  the 5000ms default to 15000ms as belt-and-suspenders. Post
  slug-join it shouldn't matter, but the default was too tight for
  any cold-start fan-out and the new entry documents intent.
- **Jina's `Published Time:` lifts to top-level `published_at:`
  frontmatter** on every new capture (forward fix in jina.ts +
  corpus.ts) AND retroactively on 244 existing files (backfill
  script). Spot-checks: alabama news 2023-06-13, AECF blog
  2026-05-17, hewlett Wikipedia 2004-04-02. All distinct from
  `fetched_at` (when WE pulled it) and now sortable independently.
- **Backfill script for `record_uuid`** built but not applied —
  201 stampable files, 0 stale conflicts. Independent hygiene
  that hardens the lineage fallback path; lands when convenient.
- **226-file corpus ship from the operator's v10 hand-search
  rhythm** lands across 20 funder dirs + 86 inbox triages. First
  use of a new `captured_from: "manual-local-pdf"` convention for
  operator-dropped local PDFs where the canonical URL wasn't
  captured at drop-time (the ResearchGate workflow).

## How we got here

The session opened with the issue file from last night still warm.
Yesterday's framing: four records (sobrato, stand-together, cohen,
todd-fisher) showed `corpus 0` despite per-funder dirs on disk;
backend NATS probe confirmed the lineage join was returning correct
counts; conclusion was "stale browser tab, hard-refresh should fix
it, and let's build a `corpus-overrides.yaml` mechanism for the
remaining edge cases the lineage join can't handle." Reasonable
read from that vantage point.

Hard-refresh resolved the original four. But three NEW records
showed up as 0: **hewlett-foundation**, **howard-schultz-foundation**,
**kellogg-foundation**. The operator's hypothesis: maybe a
name-matching bug ("the Name in the record is not actually the
official name of the philanthropy"). The diagnostic answer was
sharper:

```bash
node -e "<probe corpus.list_for_record for each row_id>"
# row_rs_mq7k9jaw_wsjkfl_1b → 2 entries (hewlett)
# row_rs_mq7k9jaw_wsjkfl_1c → 6 entries (schultz)
# row_rs_mq7k9jaw_wsjkfl_1i → 6 entries (kellogg)
```

The backend was returning the right answer. The lens was rendering 0.

Three converging causes:

1. `corpus.list_for_record` had no entry in `CAPABILITY_TIMEOUTS_MS`
   (`services/workspace/src/capabilities.ts:160`) so dispatch fell
   through to the **5000ms** default.
2. The content-ingest handler is a serial `for await` loop
   (`services/content-ingest/src/handlers.ts:429`). 96 visible rows
   fire 96 parallel `corpus.list_for_record` requests against one
   consumer; they process one at a time.
3. Each request walked every funder directory under
   `clients/<id>/corpus/`. ~40 dirs × ~300 .md files = lots of FS
   reads + frontmatter parses per request.

Late requests in the burst timed out at 5s. The lens `catch` block
(`apps/sort-filter-lens/src/App.svelte:219`) swallowed silently. The
race timing made sobrato et al. lucky and hewlett/schultz/kellogg
unlucky — and re-refreshing reshuffled the deck.

### The operator's move

> *"Shouldn't there be a pretend join where the column in the
> records sheet for corpus references a folder name/relative path?"*

The records sheet already populates `corpus_funder_slug` per row.
Verified:

| Row | `corpus_funder_slug` | Dir on disk |
|---|---|---|
| Hewlett Foundation | `hewlett-foundation` | ✓ |
| Howard Schultz Foundation | `howard-schultz-foundation` | ✓ |
| Kellogg Foundation | `kellogg-foundation` | ✓ |

Using the column as the primary join dissolves all three causes at
once. Per-request walk drops from "all dirs × all files" to "one
dir × a dozen files." The operator controls the slug cell — so the
column IS the override surface. The `corpus-overrides.yaml`
proposal from yesterday's issue becomes unnecessary; you edit a
sheet cell instead of authoring YAML.

```ts
// listForRecord — strategy 0 (slug match) bypasses 1/2/3 entirely
if (slug) {
  matches = true;  // operator's explicit assertion wins
} else if (fileRecordId === args.record_id) {
  ...  // legacy lineage paths stay as fallback
}
```

Lineage match stays as the fallback for rows without a slug — but
in current data every row has one.

### Verification

```
hewlett   row_rs_mq7k9jaw_wsjkfl_1b → 2  (51ms)
schultz   row_rs_mq7k9jaw_wsjkfl_1c → 6  (10ms)
kellogg   row_rs_mq7k9jaw_wsjkfl_1i → 6  (6ms)
sobrato   row_rs_mq7k9jaw_wsjkfl_25 → 3  (4ms)
standtog  row_rs_mq7k9jaw_wsjkfl_27 → 13 (9ms)
```

Time-per-call collapsed by two orders of magnitude. The timeout
race is structurally impossible now.

## The other shoe — Published Date was always there

While verifying the slug-join was sound, we noticed something:

```
=== sample inbox file ===
Title: 2024_Work_Trend_Index_Annual_Report
URL Source: https://assets-...azurefd.net/.../Work-Trend-Index.pdf
Published Time: 2024-05-08T13:30:22.000Z

Markdown Content:
...
```

The publish date was right there. `services/content-ingest/src/
jina.ts` was grabbing four named response headers
(`x-canonical-url`, `x-title`, `x-description`, `x-language`) but
never reading the body preamble where Jina ALSO emits `Title:`,
`URL Source:`, `Published Time:`, sometimes `Description:` and
`Language:`. The data sat unread.

Forward fix — six lines added to `jinaFetchOnce` to call a new
`parsePreamble` helper:

```ts
const preamble = parsePreamble(markdown);
const publishedTime = preamble['Published Time'];
if (publishedTime) {
  const iso = normalizeToISO(publishedTime);
  if (iso) extra.published_at = iso;
}
```

`buildFrontmatter` and `buildInboxFrontmatter` then lift
`extra_metadata.published_at` to a top-level `published_at:` line
between `fetched_at` and `record_id` — first-class field, not
metadata miscellany.

First-write verification: fired `corpus.inbox.add` for
`wikipedia/Bloomberg_Philanthropies` through the rebuilt container.
Result file line 5: `published_at: "2013-01-27T02:15:41.000Z"`.

### Backfill — the 244 files already on disk

`scripts/backfill-corpus-published-at.mjs` walks every existing
.md, parses the body preamble for `Published Time:`, inserts
`published_at:` directly after `fetched_at:`. Same parser logic as
`jina.ts` so the output is indistinguishable from a post-fix
write.

Dry-run report on reach-edu:

```
total files inspected:    517
already stamped:           1  (the bloomberg verify-published-at capture)
would stamp:             244
no Published Time:       272  (mostly PDFs + sources Jina didn't extract)
un-parseable raw date:     2  (Lumina — "2025-03-04EST09:00:00EST")
```

Applied. Re-running the dry-run reports `245 already stamped / 0
backfill candidates` — idempotent. Sample dates that landed:

| Source | published_at | fetched_at |
|---|---|---|
| Alabama news article | 2023-06-13T17:00:36.000Z | 2026-06-08T18:58:53.873Z |
| AECF blog post | 2026-05-17T14:36:00.000Z | 2026-06-06T01:27:13.682Z |
| Hewlett Wikipedia | 2004-04-02T02:43:06.000Z | 2026-06-10T04:16:44.499Z |

Each row now has *both* dates as sortable columns. "When was this
authored" and "when did we pull it" are different questions and
the corpus can finally answer both.

## Under the hood

### Why slug-join is more than a perf fix

The lineage join was clever: file's `record_id` resolves through
row-store to a `record_uuid` and matches the requested row's
uuid. It correctly recovers files written under an earlier
record-set's row_ids — the v8 → v9 → v10 promotion case.

But it depends on three things that aren't always true:

1. The file has a non-null `record_id`.
2. Row-store still has that row (not deleted, just archived).
3. The lineage edge from old row to new row was actually built at
   promotion time.

The four failing-then-recovered records (sobrato et al.) succeeded
because they were stamped with v10 record-set row_ids directly —
strategy 1 (strict match) fired. The three failing-now records
(hewlett et al.) succeeded because their `record_uuid` was
stamped at write-time and matched the v10 row's `record_uuid` —
strategy 2 fired. Both worked at the backend; both lost the race
on the wire.

The slug join is structurally different: it doesn't need any
lineage at all. The records sheet says "row X's corpus is at
`corpus/<slug>/`." We scan that one dir. We don't have to know
*anything* about how the files inside got their record_ids.

That property is why the operator's framing was right and the
`corpus-overrides.yaml` proposal was overkill. The override
surface was always there. We just weren't reading it.

### What the backfill scripts look like

Two sibling scripts in `scripts/`, both with the same shape:

- **Dry-run by default.** Walks the corpus, classifies every file
  into buckets, prints a report with examples per bucket. No
  writes.
- **`--apply` flag** to actually mutate.
- **Idempotent.** Re-running with --apply on an already-stamped
  corpus reports zero candidates.
- **Conservative.** Never overwrites a value that disagrees with
  the lookup — logs as `stale-uuid` for hand-review.
- **Insertion not regeneration.** Edits the existing frontmatter
  region in place to preserve ordering, quoting, and any keys
  the script's parser doesn't recognize.

The record_uuid one ran dry only this session (201 stampable, no
conflicts). Holding for separate apply when convenient — the
slug-join made it non-critical.

The published_at one ran apply: 244 files stamped, with the 272
no-publish-time files (mostly PDFs where Jina doesn't extract a
date) and the 2 un-parseable Lumina files (non-standard `EST`
suffix format) both intentionally left alone for hand-correction.

## What's next

- **PR open** for `fix/corpus-chip-slug-join` against
  `feat/bundle-media-packs` once the reach-edu pointer bumps. The
  branch carries: slug-join + timeout, record_uuid backfill tool,
  published_at lift + backfill tool. Three commits, type-checked,
  rebuilt, verified live.
- **Two exploration docs** queued for tonight: *Best Way to RAG
  Over the Corpus* and *Inbox-Sort by Agent Tasks*. The corpus is
  now real enough to ask interesting retrieval questions — 245
  files with first-class `published_at`, `record_id`,
  `record_uuid`, `funder_slug`, `tags`, and structured
  `extra_metadata`. RAG can lean on real metadata facets, not
  just embeddings.
- **The 2 un-parseable Lumina dates** are surfaced in the
  backfill report; an operator pass through the lens can hand-
  correct them.
- **The lens chip catch block** still soft-fails to "loading"
  (undefined) rather than visible error. Could be louder, but
  post-slug-join the timeout race is gone and it's a non-issue.
  Flagged for future "verbose-mode" polish.

## See also

- [[../context-v/issues/Some-Records-Show-Empty-Corpus-Despite-Directories-on-Disk]] — the issue, now v0.0.0.2 with the real root cause and slug-join fix as the top section; the original corpus-overrides.yaml draft preserved as superseded history below
- `2026-06-09_01_Inbox-PDFs-Land-as-Binaries-Plus-Chat-Commands-Popover.md` — the prior session this builds on (`/inbox` verb + binary download)
- `2026-06-08_02_Agent-Chat-First-Useful-Verb-Inbox-And-Context-Awareness-Architecture.md` — the architecture that made the `/inbox` rhythm cheap to extend
- commit `3a97892` — the lineage fix from two sessions ago, which the slug-join now layers over (lineage stays as fallback, not replacement)
- commit `cb4227f` — slug-join + timeout
- commit `465cddd` — record_uuid backfill tool
- commit `8b8d78f` — published_at lift + backfill tool
- reach-edu corpus commits (submodule) — 226-file v10 hand-search session + 245-file published_at backfill
