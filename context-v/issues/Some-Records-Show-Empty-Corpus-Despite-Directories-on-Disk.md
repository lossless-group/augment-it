---
title: "Some records show empty corpus in the Sort & Filter Lens despite per-funder directories existing on disk — the lineage join is healthy but the workspace-service capability has no timeout override (defaults to 5000ms), the content-ingest handler processes requests serially, and each call walks every funder directory under clients/<id>/corpus/, so late requests in the 96-row fan-out time out and the lens swallows the error silently; the durable fix is to make corpus_funder_slug (a column the records sheet already populates) the primary join key, which limits each call to one small directory and dissolves the timeout race — this supersedes the originally-proposed corpus-overrides.yaml because the override surface is now the records-sheet cell"
lede: "No `CAPABILITY_TIMEOUTS_MS` entry for `corpus.list_for_record` — 96 parallel calls hit the 5000ms default and the lens swallows the error."
date_created: 2026-06-10
date_modified: 2026-06-10
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
revisions:
  - 2026-06-10 — Initial draft, written end-of-session at operator's explicit request before context-overflow forced a new session. Captures the diagnostic that confirmed the backend is healthy, the four specific records that surfaced the symptom, and the proposed corpus-overrides.yaml mechanism that defends against future join gaps regardless of cause.
  - "2026-06-10 (follow-on session) — Hard-refresh resolved the original four but exposed three more (hewlett / howard-schultz / kellogg). Second NATS probe confirmed backend is healthy for those too. Root cause identified: workspace capability timeout defaults to 5000ms + serial handler + per-request walk of every funder directory → late requests in the 96-row fan-out time out. Audit of corpus dir: 301 files total, 36 already stamped with record_uuid, 201 unstamped but resolvable (script `scripts/backfill-corpus-record-uuid.mjs` built this session), 0 stale-uuid conflicts, 64 null-record_id files (all in inbox/). Operator proposed using the existing `corpus_funder_slug` column as the primary join key — that change dissolves the timeout race AND makes the originally-proposed corpus-overrides.yaml unnecessary because the override surface is already a records-sheet column the operator edits."
tags:
  - Issue
  - Augment-It
  - Corpus
  - Lens
  - Sort-Filter-Lens
  - Lineage-Join
  - Slug-Join
  - Workspace-Timeout
  - Defense-In-Depth
status: Open · Real Root Cause Identified (Workspace Timeout + Serial Handler + Walks-All-Dirs) · corpus_funder_slug Join Strategy Supersedes corpus-overrides.yaml · Fix In Progress
site_uuid: d399a7a6-d4e4-4fe6-9c6d-fe9b406fc145
hex_code: m1mdv1
date_authored_initial_draft: 2026-06-10
date_authored_current_draft: 2026-06-10
publish: true
---

# Some records show empty corpus despite directories on disk

> **2026-06-10 follow-on session update — read this first.** The original draft below
> (everything from §"The symptom" through §"Adjacent work that would compose well") was
> written after a partial diagnostic. A second session found the real root cause and a
> simpler durable fix. The §"corpus-overrides.yaml" proposal is **superseded** by
> §"2026-06-10 follow-on: real root cause & the slug-join fix" immediately below.

## 2026-06-10 follow-on session — real root cause and the slug-join fix

### What hard-refresh actually showed

- Sobrato (3 files), Stand Together (13), Cohen (8), Todd Fisher (8) — **all now showing correctly** ✓
- Hewlett (2 on disk), Howard Schultz Foundation (6), Kellogg Foundation (6) — **still showing `corpus 0`**

A second NATS probe against `corpus.list_for_record.requested` for the three remaining problem rows confirmed the backend returns the expected counts. Strategy 2 of the lineage join (file's stamped `record_uuid` matches the v10 row's `record_uuid`) IS succeeding for these three — they're among the 36 files that already had `record_uuid` stamped. Yet the chip stays empty.

### The real bug is in the wire, not the join

Three converging causes:

1. **`corpus.list_for_record` has no entry in `CAPABILITY_TIMEOUTS_MS`** (`services/workspace/src/capabilities.ts`) so `dispatch` falls through to the default **5000ms** at line 160.
2. **The content-ingest handler is a serial `for await` loop** (`services/content-ingest/src/handlers.ts:429`). 96 visible rows fire 96 parallel `corpus.list_for_record` requests against this one consumer; they process one at a time.
3. **Each request walks every funder directory** under `clients/<id>/corpus/` (~40 dirs × ~300 .md files = lots of FS reads + frontmatter parses per request).

Late requests in the burst time out at 5s. The lens `catch` block (`apps/sort-filter-lens/src/App.svelte:219`) swallows silently → `corpusByRowId[row_id]` stays `undefined` → chip never updates. The race explains why sobrato et al. recovered post-refresh (early in the iteration order, won their 5s budget) and hewlett/schultz/kellogg didn't (later in the order, lost it). Re-refreshing reshuffles which rows win and which time out — non-deterministic by design.

### The operator's slug-column proposal dissolves all three causes

The records sheet already has `corpus_funder_slug` populated per row (verified in `row.list.requested` dump: hewlett → `"hewlett-foundation"`, schultz → `"howard-schultz-foundation"`, kellogg → `"kellogg-foundation"`). Using it as a primary join key:

- **Per-request walk drops from "all dirs × all files" to "one dir × ≤13 files"** — the timeout race vanishes without rewriting the handler to be parallel.
- **The override surface already exists as a sheet column** — the operator edits the `corpus_funder_slug` cell to repoint a row; no new YAML format needed. The §"corpus-overrides.yaml" proposal further down is superseded.
- **Lineage stays as a fallback** for any row without a slug set — currently all rows have one.

### Scope of the fix

| File | Change |
|---|---|
| `services/content-ingest/src/corpus.ts` | `listForRecord` accepts `corpus_funder_slug?`. When present, walks only `corpus/<slug>/` and treats "file is in that dir" as the primary match (strategy 0). Existing lineage match logic still runs for files in that dir whose `record_id` is stale. When absent, current full-walk + lineage behavior is unchanged. |
| `services/content-ingest/src/handlers.ts` | The `corpus.list_for_record.requested` handler extends the cached row-store map from `row_id → record_uuid` to `row_id → { record_uuid, corpus_funder_slug }`, and passes the requested row's slug into `listForRecord`. |
| `services/workspace/src/capabilities.ts` | Add `'corpus.list_for_record': 15_000` (belt-and-suspenders — post-slug-join shouldn't need it, but the 5s default is too tight for any cold fan-out). |
| `scripts/backfill-corpus-record-uuid.mjs` | (built this session) — `--apply` later as one-time hygiene; **not on the critical path** of this fix. |

### Audit numbers from the backfill dry-run (2026-06-10)

| Category | Count |
|---|---|
| Total `.md` files in `clients/reach-edu/corpus/` | 301 |
| Already stamped with `record_uuid` | 36 (12%) |
| Would stamp on `--apply` (record_id resolves in row-store) | 201 |
| Stale-uuid conflicts (file disagrees with row-store) | 0 |
| Truly orphan: `record_id: null` (all in `inbox/`) | 64 |

The 64 inbox orphans intentionally stay outside the slug-join's scope — `inbox/` is a triage zone, not a per-record corpus.

### Verification target

After the patch, the chip for hewlett / howard-schultz / kellogg in the Sort & Filter Lens on `reach-edu` v10 should read `corpus 2` / `corpus 6` / `corpus 6` respectively, on first load, every time (no hard-refresh required).

---

## The symptom

In the Sort & Filter Lens on v10, four specific records show `corpus 0` in their chips despite per-funder corpus directories existing under `clients/reach-edu/corpus/` with markdown files inside them:

- `sobrato-philanthropies/` — 3 files
- `stand-together-trust/` — 13 files
- `steve-and-alexandra-cohen-fnd/` — 8 files
- `todd-fisher/` — 8 files

Operator framing 2026-06-10 (end-of-session): *"there a number of records that are still not connected to their source corpus documents. You were supposed to connect all the corpus into the records from v8 to v9, but you missed a number of them. I think best way is to allow me to connect them."*

The operator proposed an escape-hatch UI: a button per row that opens a filesystem picker so the operator can manually point a record at a corpus directory.

## What the diagnostic actually showed

A NATS probe directly against `corpus.list_for_record.requested` for each of the four v10 row_ids:

| Record | v10 row_id | record_uuid | Files on disk | `corpus.list_for_record` returned |
|---|---|---|---|---|
| Sobrato Philanthropies | `row_rs_mq7k9jaw_wsjkfl_25` | `rec_mphx9yt9_kk0ln1_25` | 3 | **3** |
| Stand Together Trust | `row_rs_mq7k9jaw_wsjkfl_27` | `rec_mphx9yt9_yxjhic_27` | 13 | **13** |
| Steve and Alexandra Cohen Fnd. | `row_rs_mq7k9jaw_wsjkfl_28` | `rec_mphx9yt9_ylcg42_28` | 8 | **8** |
| Todd Fisher | `row_rs_mq7k9jaw_wsjkfl_2e` | `rec_mphx9yt9_jui14c_2e` | 8 | **8** |

The backend is healthy. The lineage join (commit `3a97892`, this session) IS resolving the v10 row_id → record_uuid → matching files whose v9 `record_id` resolves to the same `record_uuid` — exactly as designed.

## Why the lens chips show 0 anyway (current best hypothesis)

The lens connected to the backend *before* the latest content-ingest rebuild that landed the lineage fix. The browser tab is holding a stale `corpus.list_for_record` result set in the `corpusEntriesByRowId` $state map. The chips render from that map; the new data is sitting on the server side waiting to be queried again.

A hard-refresh (`Cmd+Shift+R`) tears down the WebSocket + the in-memory state, reconnects, re-fires `corpus.list_for_record` for every visible row, repopulates the chips with the truthful counts. **This should be the first thing to try.**

## What might still be wrong even after a hard-refresh — the real design gap

The lineage join works ONLY when the corpus file's `record_id` is in row-store and resolves to a `record_uuid`. There are real-world cases where this isn't true:

- **Operator hand-copied files between directories** — record_id stays stamped with the SOURCE record set, which may not match the row the operator intended.
- **Files predate a record set that was fully deleted** — not just archived. row-store no longer knows the row_id at all.
- **Inbox-triaged files with no `record_id`** — captures that never had a record_id set (e.g. operator-direct inbox saves with no record context).
- **Files mislabeled with the wrong `record_id`** — paste-paste-paste on row A but the URL was actually about row B; the file lands under whichever funder slug the operator was pasting into but its `record_id` points at row A.
- **Pre-`addToCorpus` historical content** — files written before record_id was a thing, or by external tooling not using the canonical capability.

The lineage fix handles the v8→v9→v10 promotion case cleanly because row-store keeps every archived row with its record_uuid intact. It does NOT handle the cases above. The operator's escape-hatch ask is a real architectural need.

## Proposed fix — `corpus-overrides.yaml`  *(SUPERSEDED — see §"2026-06-10 follow-on" above)*

> Superseded because the operator pointed out (correctly) that the records sheet
> already has a `corpus_funder_slug` column per row. That column IS the override
> surface — operator edits the cell to repoint a row. The YAML file would be a
> second source of truth for the same fact. Kept here for history and because the
> trade-offs analysis under §"the real design gap" remains accurate for the
> orphan classes the slug-join can't cover (the 64 inbox files, files mislabeled
> with the wrong record_id, files predating addToCorpus). Those classes are now
> handled differently: inbox stays a triage zone; mislabeled files are corrected
> at the file level (operator moves them between funder dirs); pre-addToCorpus
> files are backfilled with `record_uuid` via `scripts/backfill-corpus-record-uuid.mjs`.



A per-client overrides file at `clients/<client_id>/corpus-overrides.yaml`. Operator-written, system-readable, human-legible. Shape:

```yaml
# clients/reach-edu/corpus-overrides.yaml
# Manual record_uuid → corpus-folder mappings. The system's auto-join
# (via record_id stamp + lineage) is the default; this file is the
# escape hatch for cases where the auto-join can't or shouldn't apply.
#
# Schema: one entry per record_uuid; each lists one or more folders
# (relative to clients/<client_id>/corpus/) whose files should be
# attributed to the record. Folders are UNIONED with whatever the
# auto-join already returns — overrides never SUBTRACT, only ADD.

overrides:
  - record_uuid: "rec_mphx9yt9_kk0ln1_25"
    record_label: "Sobrato Philanthropies"          # cached for diff legibility
    folders:
      - "sobrato-philanthropies"
    note: "Auto-join missed these — files came over from an external scrape"

  - record_uuid: "rec_mphx9yt9_yxjhic_27"
    record_label: "Stand Together Trust"
    folders:
      - "stand-together-trust"

  # ... etc
```

### Reader changes (`services/content-ingest/src/corpus.ts`)

`listForRecord` reads the overrides file at the start of the call (cached for ~60s like the row-store map). After running the lineage match, additionally walks the override-named folders (if any apply to the requested row's record_uuid) and unions the matching files in. De-dups by file path.

### Writer changes — none required initially

The lens writes the override directly. No new NATS capability needed.

### Lens UI affordance

Per-row, when `corpus_count === 0` AND the auto-join returned empty:

- A small "🔗 connect corpus folder" button next to the corpus chip.
- Click → modal with a text input ("paste a folder path relative to `clients/<client>/corpus/`") + a dropdown listing all the corpus subdirectories the system knows about (read via a new `corpus.list_funder_dirs` capability).
- Pick a folder → POST to a new `corpus.overrides.add` capability → server writes the YAML entry.
- Lens refreshes the chip.

**True macOS native file picker is not available** from the browser context — the closest browser-native is `window.showDirectoryPicker()` (Chromium only, gives content access but not path). For augment-it the path-relative dropdown of existing subdirectories is more useful anyway since the operator is choosing from a known set under `clients/<client>/corpus/`.

## Sequencing  *(REVISED 2026-06-10 follow-on session)*

1. ✓ **Hard-refresh the browser tab.** Resolved sobrato / stand-together / cohen / todd-fisher; exposed hewlett / schultz / kellogg as a separate symptom.
2. ✓ **Backend probe of the three remaining rows** via `corpus.list_for_record.requested` — returns 2 / 6 / 6. Backend healthy. The bug is on the workspace ↔ lens wire (5s default timeout + serial handler + per-request walk of all funder dirs).
3. ✓ **Backfill script built** (`scripts/backfill-corpus-record-uuid.mjs`) — dry-run found 201 stampable files, 0 stale conflicts, 64 inbox orphans.
4. → **Land the slug-join fix on a feature branch** per §"Scope of the fix" above. Verify against hewlett / schultz / kellogg in the lens (chips read 2 / 6 / 6 on first load, no refresh).
5. → **Apply the backfill** (`node scripts/backfill-corpus-record-uuid.mjs --apply`) as independent hygiene — stamps `record_uuid` into 201 files so future row-store churn never breaks strategy 2 again.

## Adjacent work that would compose well

- The `/promote-snapshot` reads-from-CSV bug flagged in commit `a17d07e`'s body. When fixed (promoter reads spine values from row-store, not the CSV), the operator's manual URL edits survive promotion automatically — eliminating one of the failure modes the overrides file is patching around.
- A `corpus.list_funder_dirs` capability is useful beyond overrides: a future "corpus health" lens could surface orphan directories (folders with no matching record), files with no `record_id`, dirs whose slug doesn't match any prospect name, etc.
- The augmentation-state register the [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]] plan deferred (v0.0.0.1 → 0.0.0.2 simplification) might come back here. An override is, in a sense, augmentation state that isn't derivable from the filesystem alone — exactly the case the deferred register was designed for.

## See also

- [[../specs/Records-Surface-Sort-Step-and-UI]] — the Sort & Filter Lens spec; the override UI lands inside this lens's per-row affordance area.
- [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]] — the snapshot-promotion plan. The reads-from-CSV bug (flagged but not fixed) is one cause of the override-needed cases.
- [[Funder-Corpus-First-Session-Failed-Most-Records-Unprocessable]] — the parent issue from 2026-06-05; the work in tonight's session moved coverage from 15/96 → 38/96. The overrides escape-hatch is the next move in that arc.
- commit `3a97892` — the lineage fix this session. The override mechanism is defense-in-depth on top of, not a replacement for.
- commit `a17d07e` body — flags the /promote-snapshot reads-from-CSV bug; fixing that closes one class of "override needed" cases.
- 2026-06-10 NATS diagnostic against `corpus.list_for_record.requested` — saved in shell history; reproducible via `docker compose exec content-ingest node` with the diag script in this issue's adjacent work area.
