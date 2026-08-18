---
title: "Augmentation-state preservation and snapshot promotion — the operator's CSV is the system of record, the filesystem is the truth, and `/promote-snapshot` is the verb that walks the corpus and emits the next CSV with system columns appended so flow-switches don't erase the prior cycle's work"
lede: >-
  One verb: `/promote-snapshot` joins the corpus filesystem into a fresh CSV version with system columns. No register, no write-hooks.
date_created: 2026-06-09
date_modified: 2026-06-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.2
revisions:
  - 2026-06-09 — Initial draft. Three-tier framing (Records Surface chip, augmentation-state register, snapshot promotion). Four phases.
  - 2026-06-09 — Simplified to flat shape per operator pushback (*"I thought the endgame is that when promotion to next version of records we have columns with values that describe the corpus state?"*). The Tier 2 augmentation-state register was scaffolding for *future* augmentations explicitly out of scope (pack state, connector state, prompt state); removing it cuts the plan from four phases to two and lets the promoter be a stateless filesystem-walk + CSV-join. The register can return as a focused follow-on if/when a *second* augmentation flow needs to write state that isn't derivable from a markdown file on disk. Added the **re-derive rule** as an explicit section to handle the Google-Sheets-re-export round-trip case the operator surfaced (*"the working version and the promoted version need to be the system of record"*).
tags:
  - Plan
  - Augment-It
  - Records-Augmentation
  - State-Preservation
  - Snapshot-Promotion
  - Pipeline-Tracker
  - Corpus
  - Records-Surface
status: Draft
site_uuid: f8be3583-c694-4431-a844-1debe1cea575
hex_code: mwqjp3
date_authored_initial_draft: 2026-06-09
date_authored_current_draft: 2026-06-09
---

# Augmentation-state preservation and snapshot promotion

## Why this plan exists

The operator works *from* `clients/reach-edu/inputs/2026-06-05_Master-Pipeline-Tracker--Active-Pipeline_v8.csv`. It is the spine — 105 lines, 96 distinct prospects, last touched on 2026-06-05 22:44 (single commit `b41d92f`, zero further edits).

In the four days since v8 landed, this happened against those rows:

- **+22 committed corpus files** across **17 funder directories** (15 → 17, with new content for Alabama State, Schusterman Family Philanthropies, Arthur Blank)
- **+12 inbox captures** via the new `/inbox <url>` chat verb (committed plus uncommitted, including the verified Hanover PDF + sibling)
- **Two new system surfaces shipped** — `/inbox` chat verb (2026-06-08), Commands popover (2026-06-09)
- **Zero edits** to v8. Coverage of v8's 96 prospects sits at 17 (17.7%).

The CSV the operator reads tomorrow morning to decide what to work on does not know that Arthur Blank now has 15 markdown files in its corpus. It does not know that Charles Koch has 12. It does not know that 79 prospects have never been touched. The augmentation work happened; the artifact the operator hands to themselves a week from now contains no trace of it.

The fix is one new verb. `/promote-snapshot` reads the latest CSV in `inputs/`, walks the corpus filesystem indexing every markdown file by its `record_id` frontmatter, and emits a new CSV at `<date>_<basename>_v<N+1>.csv` with the spine columns passed through untouched plus four system columns appended. v8 stays exactly as it is on 2026-06-05; v9 supersedes it as the system of record going forward.

Operator framing 2026-06-09: *"I will want to promote v8 to v9 with status of corpus as part of the record. I need to do another cycle and build another bundle or pack(s)."* This plan exists so the cycle-switch is safe — the corpus work is captured in v9 before bundle/pack work begins.

## Scope of this plan

In scope:

- A **derived `corpus_count` chip on Records Surface** — surface the existing `corpus.list_for_record` capability everywhere a record is rendered, not just in Content Reader. The 17/96 coverage gap becomes visible *in the view*, not just in a Python audit.
- A **`pipeline.promote_snapshot` capability** + matching chat verb `/promote-snapshot`. Reads the latest `inputs/*_v<N>.csv`, walks `clients/<client>/corpus/` (excluding `inbox/`), joins by `record_uuid`, writes `<date>_<basename>_v<N+1>.csv` with system columns appended.
- A **conventional list of system-written columns** — see §"The columns promotion writes" below. Spine columns from vN pass through untouched.
- A **re-derive rule**: system columns are *always* derived from filesystem truth at promotion time; never preserved from the prior CSV. This handles the Google-Sheets-re-export round-trip cleanly. See §"The re-derive rule" below.

Out of scope:

- **The augmentation-state register** (was Tier 2 in v0.0.0.1). Future augmentations (pack state, connector fires, prompt runs) that need to track state *not* derivable from a markdown file on disk will need this. When that need is real, the register lands as its own focused plan with one clear motivating use case. Until then, YAGNI — the filesystem is the truth.
- **Round-tripping the promoted CSV back to Google Sheets.** The operator may choose to re-import v9 into their sheet; that's an operator decision the system doesn't automate. The re-derive rule (below) makes the next promotion idempotent regardless of which way the CSV got into `inputs/` — fresh export from the sheet or hand-edited copy of a prior vN+1.
- **The inbox triage layer.** Inbox files don't carry a `record_id` today (they're pre-triage) and are excluded from promotion. When [[../specs/Corpus-Inbox-Capture-and-Triage]] §triage ships and triage writes `record_id` onto a triaged-out-of-inbox file, that file is promoted like any other corpus file with zero changes here.
- **Editing system columns through the UI.** System columns reflect filesystem truth. The operator influences them by running augmentations (`corpus.add`, `corpus.inbox.add`, future verbs), not by hand-editing the CSV.
- **Multi-client behavior.** Promotion is per-client. Cross-client aggregation is a separate concern.

## Architecture

```
                  ┌─────────────────────────────────────┐
                  │  Operator edits Google Sheet         │
                  │   exports CSV →                      │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌─────────────────────────────────────┐
                  │  inputs/YYYY-MM-DD_..._vN.csv        │  ← system of record
                  │   spine cols (operator) +           │     (read-only to system)
                  │   system cols (from prior promote)  │
                  └────────────────┬─────────────────────┘
                                   │
                                   │  ingested into row-store at boot
                                   │   (existing path — unchanged)
                                   │
                                   ▼
                  ┌─────────────────────────────────────┐
                  │  row-store (records in memory/disk)  │
                  │   keyed by row_id == record_uuid     │
                  └────────────────┬─────────────────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                     ▼
       ┌─────────────┐     ┌─────────────────┐    ┌──────────────────┐
       │ corpus.add  │     │ corpus.inbox.add│    │ (future bundles, │
       │ (per-funder)│     │ (inbox)         │    │  packs, etc.)    │
       └──────┬──────┘     └────────┬────────┘    └──────────────────┘
              │                     │
              ▼                     ▼
       writes markdown       writes markdown
       with record_id        with record_id: null
       in frontmatter        (pre-triage)
              │                     │
              ▼                     ▼
       ┌─────────────────────────────────────┐
       │  clients/<client>/corpus/             │  ← the truth
       │   <funder-slug>/<date>_<slug>.md     │     (system columns derive
       │   inbox/<date>_<slug>.md             │      from here at promote
       │                                       │      time, every time)
       └────────────────┬─────────────────────┘
                        │
                        │  /promote-snapshot reads:
                        │   - latest inputs/*_vN.csv
                        │   - every corpus/*/.md (skip inbox/)
                        │
                        ▼
       ┌─────────────────────────────────────┐
       │ pipeline.promote_snapshot handler    │
       │                                       │
       │  1. find latest vN.csv               │
       │  2. walk corpus/*/.md → record_id    │
       │     groups → corpus_count etc.       │
       │  3. join by record_uuid              │
       │  4. emit vN+1.csv                    │
       └────────────────┬─────────────────────┘
                        │
                        ▼
       ┌─────────────────────────────────────┐
       │  inputs/<today>_..._v(N+1).csv       │  ← new system of record
       │   spine cols (pass-through) +       │     supersedes vN
       │   system cols (re-derived)          │
       └─────────────────────────────────────┘
```

The key invariants:

- **The system never writes to the spine CSV in place.** Promotion always writes a *new* file. v8 is immutable.
- **System columns are derived, not stored.** Every promotion re-walks the filesystem and re-emits the columns. A CSV with stale system columns gets refreshed on the next promote; a CSV with no system columns (fresh Google-Sheets export) gets them added.
- **Inbox files are excluded from promotion.** They lack a `record_id` (pre-triage). They light up in promotion automatically once the triage layer writes `record_id` onto them.

## The re-derive rule

System columns are **always derived from filesystem truth at promotion time**. They are never preserved-from-the-prior-CSV.

This handles the operator's round-trip cleanly:

1. v8 emitted from Google Sheets → corpus work happens → `/promote-snapshot` → **v9** has `corpus_count` etc.
2. Operator opens the sheet, edits Stage / Next Step on three rows, re-exports → drops `2026-06-15_..._v10.csv` into `inputs/`. **That fresh export has no system columns** — Google Sheets doesn't know about them.
3. Operator runs `/promote-snapshot` again.
4. Handler reads v10 (latest by vN), takes spine columns from it (operator's edits preserved), walks the filesystem for current corpus state, emits **v11** with system columns re-added.

What this protects against: the operator never has to remember to import v9 back into their sheet just to keep system columns alive. They can keep editing in Google Sheets, re-exporting freely, and `/promote-snapshot` is always idempotent — it derives.

What this means in practice: **the latest CSV in `inputs/` is the system of record at any moment** for both spine and system columns. "Working version" and "promoted version" are the same artifact; the verb just advances which CSV holds the title.

What this means for column drift: if the columns the promoter writes change (e.g., v0.0.0.3 adds an `inbox_count` column), the operator gets the new columns the next time they `/promote-snapshot`. No migration ritual.

## Phases

Two phases. Each independently shippable.

### Phase A — `corpus_count` chip on Records Surface

Touch: `apps/response-reviewer/src/App.svelte` (Records Surface is rendered there alongside Content Reader); `apps/response-reviewer/src/app.css`.

- Records Surface row renderer queries `corpus.list_for_record` for each visible record (capability already exists in `services/content-ingest/src/handlers.ts` and `corpus.ts`).
- Share `corpusEntriesByRowId` with Content Reader so the same record loaded in both views only hits the backend once.
- Render a small `corpus_count` chip next to each record's pipeline-status indicators. Click → expand inline to list the files (mirrors the "In corpus" affordance Content Reader already has).
- Zero new infrastructure. No NATS handlers added. No filesystem writes.

Ships value: the operator can scroll v8 in Records Surface and see *which 17 of 96 prospects have been worked* without leaving the surface. The 79 cold prospects become visually obvious.

### Phase B — `pipeline.promote_snapshot` capability + `/promote-snapshot` chat verb

Touch: NEW handler in `services/content-ingest/src/handlers.ts` (content-ingest already owns filesystem I/O against `clients/<client>/corpus/`); `services/workspace/src/capabilities.ts` (register capability + 120s timeout); `services/workspace/src/chat.ts` (recognize `/promote-snapshot` verb in `V001_CHAT_VERBS`); `apps/chat/src/ChatSurface.svelte` (add to COMMANDS popover); `apps/chat/src/ResponseModeRenderer.svelte` (result bubble branch for the new capability).

Handler logic:

1. Find the **latest input CSV** at `clients/<client>/inputs/*_v<N>.csv` — pick the file with the highest `vN` in its name; tie-break by the date prefix.
2. Parse the CSV. Keep the header order; remember which columns are spine vs system (system column names are reserved — see next §).
3. **Walk `clients/<client>/corpus/`** — every subdirectory except `inbox/`. For each `.md` file, parse the frontmatter, grab `record_id`, `pack_id`, `fetched_at`. Build an in-memory index: `record_id → { count, funder_slugs (set), last_updated, by_pack (map) }`.
4. **Join by record_uuid.** For each row in the CSV, look up its `record_uuid` in the corpus index. Fill the system columns; blank when no corpus content exists for that record.
5. Emit `clients/<client>/inputs/<today>_<basename>_v<N+1>.csv`. Header carries spine columns first (preserving operator's column order) then system columns appended in the documented order.
6. Return `{ snapshot_path, written_at, rows_with_corpus, rows_without_corpus, total_corpus_files_indexed }`.
7. **Never modify the source vN.** Promoter is read-only against `inputs/*_vN.csv`.

Chat verb wiring:

- `/promote-snapshot` → dispatch `pipeline.promote_snapshot` with `client_id` pulled from the chat context slab (same as `/inbox`).
- COMMANDS popover row: verb `/promote-snapshot`, summary `Emit a snapshot CSV — v(N+1) with corpus columns appended`, no example (no args).
- Result bubble shows: `✓ Promoted to v<N+1>` + the snapshot path + a one-line `X of Y records have corpus content (Z files indexed).`

Ships value: the verb the operator named. v8 → v9 with corpus state preserved. Before they switch to bundle/pack work, the corpus cycle is captured in a CSV that will still be true a week from now.

## The columns promotion writes

The v0.0.0.2 column set, appended to vN+1 after the spine columns:

| Column | Source | Example |
|---|---|---|
| `corpus_count` | total `.md` files across all funder dirs whose frontmatter `record_id == this row's record_uuid` | `15` |
| `corpus_funder_slug` | the funder dir containing the most files for this record; tie-break by name | `"arthur-blank-foundation"` |
| `corpus_last_updated` | max `fetched_at` across this record's corpus files (ISO 8601) | `"2026-06-08T14:04:18Z"` |
| `corpus_by_pack` | flattened `pack=N;pack=N` from each file's `pack_id` | `"official-blog-pack=12;manual=3"` |
| `augmentation_snapshot_at` | promotion handler's wall-clock at emission | `"2026-06-09T19:30:00Z"` |
| `augmentation_snapshot_version` | the vN+1 itself, for self-reference | `"v9"` |

Reserved column names (not emitted in v0.0.0.2; the promoter will start emitting them when the augmentations that write them ship — at which point they appear in the next promotion the operator runs):

- `inbox_count`, `inbox_last_triaged_at` — light up when triage runs and writes `record_id` onto inbox files
- `last_pack_fire_id`, `last_pack_run_at`, with per-pack subscripts if needed
- `connector_fire_count`, `last_connector_fire_at`
- `last_prompt_run_at`

Column ORDER is deterministic and documented so a colleague handed v9 sees the same columns in the same order every time. New columns append; existing columns never shift.

## Files changed

| File | Phase | Change |
|---|---|---|
| `apps/response-reviewer/src/App.svelte` | A | Records Surface row renderer surfaces a `corpus_count` chip; `$effect` block fans out `corpus.list_for_record` for visible rows; shares state map with Content Reader |
| `apps/response-reviewer/src/app.css` | A | `.cr-corpus-count-chip` styles (reuse existing chip family where it fits) |
| `services/content-ingest/src/handlers.ts` | B | NEW `pipeline.promote_snapshot.requested` handler — finds latest vN.csv, walks corpus/, emits vN+1.csv |
| `services/content-ingest/src/promote.ts` | B | NEW module — CSV parse/emit, corpus filesystem walk, join logic (keep handlers.ts thin) |
| `services/workspace/src/capabilities.ts` | B | Register `pipeline.promote_snapshot` with a 120s timeout |
| `services/workspace/src/chat.ts` | B | `V001_CHAT_VERBS` gains `/promote-snapshot` + recognition shortcuts (`snapshot this`, `advance the tracker`, `emit v9`) |
| `apps/chat/src/ChatSurface.svelte` | B | COMMANDS popover registry gains `/promote-snapshot` |
| `apps/chat/src/ResponseModeRenderer.svelte` | B | Result bubble branch for `pipeline.promote_snapshot` showing snapshot path + rows-with-corpus count |
| `apps/chat/src/app.css` | B | Result-bubble styles for the new branch (likely reuse `.bubble.result.inbox` pattern) |
| `context-v/specs/Funder-Content-Corpus-Workflow.md` | B | Add "Snapshot promotion" section documenting the verb, the columns, and the re-derive rule; revision entry |

## Open questions

- **CSV parser choice.** The handler needs to parse vN and emit vN+1 in a way that survives quoted fields with embedded commas, newlines, and unicode (the existing v8 has multi-line JSON-shaped values in `socials` and `helpful_links`). Lean: use a real CSV library (`papaparse` already available, or `csv-parse`/`csv-stringify` for Node-native), not a hand-rolled `split(',')`. The cost of getting this wrong is silent corruption of the spine — worth a dependency.
- **What if the corpus indexes >1 file with the same URL on the same record?** Re-fetch produces a second `.md` with the same `exact_url` but a different timestamp. Lean: count both — operators reading `corpus_count` want "how many corpus artifacts exist for this funder," and a re-fetch is a legitimate artifact. If we later need a distinct-URL count, add it as `corpus_distinct_urls` rather than redefining `corpus_count`.
- **Frontmatter parsing.** The corpus markdown frontmatter is YAML-shaped and `services/content-ingest/src/corpus.ts` already has a minimal `parseFrontmatter` that handles the existing field set. Reuse it; if the corpus file's frontmatter shape grows beyond what that parser handles, swap to a YAML library. Don't pre-emptively swap.
- **What if a `record_id` in a corpus file doesn't exist in vN?** Happens if the operator removes a row from the sheet between captures. Lean: emit a row in vN+1 anyway with all spine columns blank except `record_uuid` and a `removed_from_spine: true` flag column. The corpus state isn't lost; the operator sees the orphan and decides.
- **What if vN has a `record_uuid` no corpus file references?** Common case (79 of 96 today). Row passes through with system columns blank. No special handling.
- **`/promote-snapshot` against a dirty working tree.** The per-client repo is a submodule and uncommitted captures often sit in the working tree. Lean: **always allowed.** The promoter reads CSV + filesystem; git state doesn't gate it. Operator commits whenever.
- **What if the operator runs `/promote-snapshot` twice in the same minute?** The second emission would collide on the filename if both pick the same date prefix. Lean: collision-suffix the filename (`<date>_<basename>_v<N+1>_<2>.csv`) the same way `addToCorpus` does today. Better than silently overwriting.
- **Inbox files with `record_id: null`.** Today's inbox captures don't carry a record_id (pre-triage). They're excluded from the corpus walk (the handler skips `corpus/inbox/`). When triage moves a file from `inbox/<slug>.md` to `<funder-slug>/<slug>.md` and writes `record_id` into its frontmatter, the next `/promote-snapshot` picks it up automatically. **No code change needed here when triage ships** — the join is purely on filesystem frontmatter, and the triage layer's only job is to write a correct `record_id`.
- **Do we need a `/show-snapshot-diff <v9> <v10>` verb?** Tempting. Out of scope for v0.0.0.2. Operator can `diff` two CSVs themselves; revisit if the request becomes recurring.
- **Performance.** Walking 97 markdown files takes <50ms on the existing reach-edu setup. At 10K files we'd reconsider (index by `record_id` at write time, cache the index, watch for filesystem changes). For now, walk-on-every-promote is the right shape — single source of truth, no cache invalidation to get wrong.

## Migration / sequencing

Per the [[branch-cadence]] feedback memory:

- **Phase A** is a trunk-shaped commit. Single Svelte file + small CSS additions. Direct commit + push.
- **Phase B** is named-branch territory — new capability, new module, new chat verb, popover wiring, result-bubble rendering. Branch + PR.

Suggested order: **A → B.** A ships visibility this session (the operator gets the chip immediately and can see today's 17/96 coverage *in the view*). B follows close behind; it's the verb the operator actually asked for.

Once B ships, the immediate next move is **`/promote-snapshot` against v8 → emit v9** before the operator opens the bundle/pack cycle. v9 captures the corpus cycle's work before bundle/pack work begins overwriting attention.

## See also

- [[Download-PDFs-into-Corpus-Inbox]] — the prior plan in this directory. Same instinct (preserve work that would otherwise be lost — there, the binary upstream; here, the augmentation state) at a different layer of the stack.
- [[../specs/Funder-Content-Corpus-Workflow]] — the spec that frames per-funder corpus work. Rule 5 (operator authority per item) is the principle that makes promotion an explicit verb rather than a continuous side-effect.
- [[../specs/Corpus-Inbox-Capture-and-Triage]] — the inbox capture spec. Inbox files become promotion-eligible the moment triage writes a `record_id`; no change here.
- [[../specs/Chat-Context-Awareness-Architecture]] — the v0.0.2 cleanup that turns the chat verb registry into a derived thing. `/promote-snapshot` lands as a new verb under whichever registry shape is live when Phase B ships.
- [[../specs/Response-Reviewer-Shell-and-Content-Reader-Mode]] — Records Surface and Content Reader both render through this app; Phase A ships in there.
- 2026-06-09 audit (in-session, this conversation) — the diff between v8-at-rest and v8-as-the-operator-actually-experiences-it; the 17/96 coverage number is the load-bearing piece of evidence that motivated this plan.
- [[../../changelog/2026-06-09_01_Inbox-PDFs-Land-as-Binaries-Plus-Chat-Commands-Popover]] — today's ship. The Commands popover Phase B adds `/promote-snapshot` to.
