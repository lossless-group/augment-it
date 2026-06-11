---
title: "Some records show empty corpus in the Sort & Filter Lens despite per-funder directories existing on disk — backend diagnostic says the lineage join IS finding them, suggesting stale browser-side state OR a real gap that hard-refresh will reveal; either way the right durable fix is a per-client corpus-overrides.yaml that lets the operator manually connect a corpus directory to a record_uuid as defense-in-depth against any future join failure"
lede: "End of 2026-06-09 session. The operator built corpus content for ~21 new records (warm count went 17 → 38 between v9 and v10 — the /promote-snapshot ship captured this). On v10 the operator noticed several rows still showing `corpus 0` despite per-funder directories existing on disk — specifically sobrato-philanthropies (3 files), stand-together-trust (13), steve-and-alexandra-cohen-fnd (8), todd-fisher (8). Backend diagnostic against the actual NATS subject (`corpus.list_for_record.requested`) confirmed the lineage join IS returning the correct counts for these v10 row_ids end-to-end, so the visible-chip-says-zero state is most likely a stale-browser-tab artifact (lens connected to the prior version of corpus.list_for_record before the lineage rebuild + the v10 promotion). A hard-refresh should repopulate every chip with truth. BUT — the operator's framing surfaced a real design gap that the lineage fix doesn't solve: when corpus files have a record_id NOT in row-store (operator hand-copies, deleted record sets, inbox-triaged files, paste-paste-paste on the wrong row), the auto-join has no way to recover. The proposed durable fix is a per-client `corpus-overrides.yaml` mapping `record_uuid → [funder_slug, …]` that listForRecord unions with the lineage match, plus a lens UI affordance for the operator to wire up an override against a row. About 90 minutes of careful work."
date_created: 2026-06-10
date_modified: 2026-06-10
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-10 — Initial draft, written end-of-session at operator's explicit request before context-overflow forced a new session. Captures the diagnostic that confirmed the backend is healthy, the four specific records that surfaced the symptom, and the proposed corpus-overrides.yaml mechanism that defends against future join gaps regardless of cause.
tags:
  - Issue
  - Augment-It
  - Corpus
  - Lens
  - Sort-Filter-Lens
  - Lineage-Join
  - Defense-In-Depth
  - Tomorrow-Work
status: Open · Backend Diagnostic Confirms Healthy · User-Visible Stale State Suspected · Override Escape-Hatch Proposed
---

# Some records show empty corpus despite directories on disk

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

## Proposed fix — `corpus-overrides.yaml`

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

### Cost

About 90 minutes:

- 15 min — `corpus-overrides.yaml` schema + load/cache module in `corpus.ts`
- 15 min — `listForRecord` integration: read overrides, union folders into the match set
- 15 min — new capability `corpus.overrides.add` (workspace + content-ingest handler)
- 15 min — new capability `corpus.list_funder_dirs` (cheap directory walk)
- 20 min — Lens UI: the modal + dropdown + POST
- 10 min — type-check + rebuild + verify against Sobrato

## Sequencing

1. **Hard-refresh the browser tab first thing tomorrow.** If Sobrato / Stand Together / Cohen / Todd Fisher all show their correct counts (3 / 13 / 8 / 8), the urgent issue is resolved; the overrides feature becomes a clean follow-on.
2. **If any are still wrong after the hard-refresh**, that's a real auto-join bug — capture which specifically + their row_ids, then dig into `corpus.list_for_record` against those exact row_ids to identify what the lineage logic is missing.
3. **Either way, ship the overrides escape-hatch** because:
   - The operator's proposal is sound and the cases listed in §"the real design gap" above are real.
   - Defense-in-depth keeps the chip-says-zero-but-files-exist UX problem from recurring as the corpus grows past where auto-join can handle.
   - The YAML is a human-legible artifact that travels with the per-client repo's git history — useful documentation of operator-curated knowledge.

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
