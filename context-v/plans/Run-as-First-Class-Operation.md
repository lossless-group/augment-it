---
title: "Run-as-First-Class-Operation — Pair Pack-Runner with Prompt-Template-Manager, Make Runs Legible Across the Pipeline"
lede: "Two coupled fixes that came out of the 2026-05-25 smoke against the foundation dataset. **First**, pair the Pack Runner remote with Prompt-Template-Manager in co-existence mode — they are the two ways to enrich a record set (custom LLM prompt vs source-bound pack), so they belong in one viewport with a draggable seam. **Second**, lift `Run` from a string id buried on each ResponseRecord into a first-class entity in response-store, so Response Reviewer (and Pack Runner, and every future surface) can see what batch of work produced the responses it's looking at — what prompt or packs fired, against which rows, with what aggregates, when. The pair is a one-line PAIRINGS entry. The Run lift is a small new service surface plus four UI touches; it pays for itself the moment a bundle wants live progress without inventing new infrastructure."
date_created: 2026-05-25
date_modified: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Plan
  - Augment-It
  - Packs-and-Bundles
  - Pack-Runner
  - Prompt-Template-Manager
  - Response-Reviewer
  - Run-Entity
  - Job-Manifest
  - Co-Existence-Pairing
  - Architecture
status: Draft
---

# Run-as-First-Class-Operation

## Why this plan

Two issues surfaced in the foundation-dataset smoke:

1. **Pack Runner is in the wrong place in the shell.** It sits as
   the 6th tile in the peek-deck rotation alongside Record Collector,
   Enhanced Records, Response Reviewer, etc. But conceptually,
   pack-runner is **the alternative to authoring a custom prompt** —
   you pick a record set and either author a free-text LLM prompt
   (prompt-template-manager) OR fire source-bound packs (pack-runner)
   against it. They're either/or for the same intent. They belong
   side-by-side, not on opposite ends of a rotation.

2. **Response Reviewer is response-centric — it has no notion of the
   parent operation.** Every ResponseRecord carries a `run_id`, but
   there's no first-class `Run` entity that says "these 96 responses
   came from your `Find Organisation URL` prompt run against record
   set X, started 11:42, completed 12:08, 83 good / 7 needs-human /
   6 partial." So when the user pivots between authoring methods,
   responses arrive as a flat stream with no frame. They have no way
   to see what batch produced what response, what field a response
   would write into on accept, or whether a run is still in flight.

Both fixes are small in scope. They're coupled because the Run entity
makes the *pairing* meaningful (the run that just fired narrates
itself in Response Reviewer regardless of which side of the pair
kicked it off) and because both came from the same hour of usage.

## What we're building

### Part 1 — Pair Pack Runner ⇄ Prompt Templates

A new `PAIRINGS` entry in `shell/src/remotes.ts`:

```ts
{
  key: 'packRunner+promptTemplateManager',  // alphabetical pair key
  left: 'promptTemplateManager',
  right: 'packRunner',
  defaultLeftPct: 50,                       // equal billing by default
}
```

Then either auto-open this pair when navigating to either remote, or
expose the pair in the shell's Split-mode picker. The Split button in
the header already cycles through `PAIRINGS`; adding our pair makes
it accessible.

User-facing surface: clicking "Split" in the header (after picking
either prompt-template-manager or pack-runner as focused) opens both
side-by-side. The user picks their flavor of enrichment without
switching tiles.

### Part 2 — `Run` entity in response-store

A new top-level entity in response-store. Persists alongside
`responses.json` as `runs.json`. The data model:

```ts
type RunType = 'prompt' | 'pack' | 'bundle';

type Run = {
  run_id: string;                       // unique; existing run_id strings stay valid
  type: RunType;

  // Type-discriminated fields
  prompt_id?: string;                   // type === 'prompt'
  pack_ids?: string[];                  // type === 'pack' | 'bundle'
  bundle_id?: string;                   // type === 'bundle'

  record_set_id: string;
  row_ids: string[];                    // scope at kick-off
  entity_name_field?: string;           // packs/bundles only

  initiated_by: 'prompt-template-manager' | 'pack-runner' | 'chat';
  started_at: string;                   // ISO
  ended_at: string | null;              // null while in flight

  // Maintained as responses land — incremented in the
  // response.create.requested handler.
  cells_total: number;
  cells_complete: number;
  found_count: number;                  // outcome === 'found'
  not_found_count: number;
  error_count: number;

  // Operational metadata — auditing without parsing response bodies.
  cancelled?: boolean;
  cancel_reason?: string;
};
```

**Storage**: same JSON-file pattern as response-store (load on boot,
backfill missing fields, persist on every write).

**New NATS subjects**:
- `run.create.requested` — a kicker (pack-runner, prompt-runner, chat)
  calls this *before* starting work; gets back the `run_id` + manifest;
  passes the `run_id` through to the per-cell publishes
- `run.list.requested` — Response Reviewer + Pack Runner read this
  for the run-bar
- `run.get.requested` — drill into one run
- `run.cancel.requested` — flips `cancelled: true` + `ended_at`; the
  worker service (prompt-runner / social-search-service) honors via
  the existing AbortController plumbing

**Broadcast**:
- `run.updated` — fires every time a Run's counters change. Subscribed
  to by any UI that wants live progress.

**Wiring into existing flows**:
- `response.create.requested` handler in response-store: after creating
  the ResponseRecord, increment the parent Run's counters and publish
  `run.updated`. The handler already has `run_id` on the payload — no
  shape change needed.
- prompt-runner's `runPromptAgainstRecordSet`: kicks off
  `run.create.requested` with `{ type: 'prompt', prompt_id, record_set_id,
  row_ids }` before the per-row loop; flips `ended_at` when done.
- social-search-service's `pack.fan_out.requested`: same pattern with
  `{ type: 'pack', pack_ids, record_set_id, row_ids,
  entity_name_field }`.

### Part 3 — Response Reviewer surfaces the run

Three UI touches to apps/response-reviewer/:

#### 3a. Run bar at the top of the response stream

```
RUN · pack-runner · linkedin/x/bluesky/youtube/facebook/wikipedia (6) × 96 rows
     576 cells · 487 ✓ found  ·  72 ∅ not_found  ·  17 ✕ error
     started 12:34 · still running                              [filter to this run ▾]
```

For a prompt run, the bar's first line reads:
```
RUN · prompt-template-manager · "Find Organisation URL" × 96 rows
```

#### 3b. Filter chip — run scope

Above the existing flag chips (`all / unflagged / good / partial / …`),
a new tier: **run filter**. Options: "this run" (the most recent for
the focused record set), "all runs", a dropdown of recent runs by
label + start time. When set, the response list narrows to that
`run_id`. Persists in localStorage so refresh doesn't reset.

#### 3c. Per-response acceptance-target line in the Context panel

A new line directly under "Output column":

| Response type | Line |
|---|---|
| Prompt response | `Writes to → row.fields.url` |
| Pack response | `Writes to → row.fields.socials[]  ·  pack_id=linkedin-pack  ·  replace-by-pack` |
| Bundle response | same as pack, plus `bundle: profile-builder.common` |

This makes the write-back contract from
[[Packs-and-Bundles-Pattern]] §Row write-back visible per response
before the user clicks accept. Critical for confidence when the
underlying target differs per response source.

### Part 4 — Pack Runner shows live run progress (no new infra)

Once the Run entity exists, Pack Runner subscribes to `run.updated`
broadcasts for the run it just kicked off. Replaces the current
`firing 576 cells…` placeholder with a live tally + per-pack split.
Plus an "Open Response Reviewer →" button that uses the existing
`augment-it:navigate` event (the cross-remote nav already used by
Enhanced Records).

### Part 5 — Row-level clarification gate

**Promoted into scope 2026-05-25 — the scaling cost makes this
no-longer-deferrable.** A small additive feature alongside the
Run entity work:

A new reserved key on `Row.fields`:

```ts
row.fields.needs_clarification:
  | null
  | { reason: string; flagged_at: string; flagged_by: 'auto' | 'user' };
```

Joins the four existing reserved keys (`record_uuid`, `helpful_links`,
`archived`, `triage_states`). Promote carries it forward unchanged.

Two row-store capabilities — `row.needs_clarification.set` and
`row.needs_clarification.clear` — mirror the
`row.helpful_links.add / .remove` pair shape.

Three UI touches:

- **Pack Runner row picker** — checkbox: "include rows pending
  clarification" (default OFF). Rows with `needs_clarification` set
  are visually muted in the list, count visibly excluded from
  `cellsToFire`.
- **Prompt Templates Apply path** — same default-exclude discipline.
  The `prompt.run.requested` args grow an optional `include_pending:
  boolean` field (default false); rows with `needs_clarification` set
  get skipped from the loop unless include_pending is true.
- **Response Reviewer per-response action** — a small "flag row needs
  clarification" affordance on each response card, especially useful
  when the user notices the confidence pattern across packs is
  uniformly low. Pre-fills `reason: 'all packs <30 confidence'` (or
  whatever the actual pattern is).

The Run entity benefits directly: a Run's `row_ids` scope at kick-off
excludes clarification-flagged rows by default; cost stays bounded.
The Run manifest can record whether `include_pending` was true to
preserve provenance.

### Part 6 — Backfill the existing 96 responses

A load-time backfill in response-store:
1. Group all loaded responses by `run_id`
2. For each unique `run_id` with no matching Run entity, mint a
   synthetic Run with type inferred (presence of `pack_id` on any
   response → `'pack'`; otherwise `'prompt'`), `started_at = min(created_at)`,
   `ended_at = max(created_at)`, scope reconstructed from the responses'
   `record_set_id` + distinct `row_ids`, counters tallied from
   `outcome` values
3. Existing future-bound subscribers see Runs immediately

Same backfill discipline that handled `edited_text` and the
pack-aware fields.

## Existing related infrastructure (don't reinvent)

A few useful hooks already exist; the Run entity layers on top, doesn't
replace them:

- **`response.coverage.requested`** in response-store — already computes
  per-prompt-per-record-set coverage (`covered_row_ids` vs
  `needs_rerun_row_ids`). The Run aggregates are the same data,
  pre-tallied + persistent + cheap to read. Coverage remains the
  authoritative computed view; Run.cells_complete is a cached count
  for snappy UI.
- **`CementedTriage` on `row.fields.triage_states`** (defined in
  row-store/src/store.ts:61, currently unused — promote does not yet
  cement). When promote-cementation lands, the cemented state per row
  per prompt_id stays the source of truth for "what flag did this row
  end with"; Run is the operation-level frame on top.
- **`row.fields.archived`** boolean — drops a row out of promotion.
  Orthogonal to Run; a row can be archived independently of which
  Runs covered it.
- **`Row.status?: string`** — declared in the Row type but never set
  anywhere in handlers. **Don't use this for run-related state.** It's
  reserved-but-unused; if we end up needing it, it should be a typed
  enum, not a free-form string.

## Out of scope for this plan

- **Bundle abstraction** — Runs of `type: 'bundle'` are accepted in
  the schema, but no bundle runtime is implemented in this plan.
  Bundles come in their own session per [[Packs-and-Bundles-Pattern]]
  §Implementation order step 6.
- **`row.socials.add` / `row.socials.remove`** capabilities — the
  pack-response write-back path. Tracked separately (precedes this
  plan; without it the pack accept fails). Listed as a hard
  dependency below.
- **Cementation of `triage_states` on promote** — separate session
  (the original Enhanced Records list deferred this).
- **Cancellation UX** — the schema accepts `cancelled` + `cancel_reason`
  and the NATS subject exists, but a "cancel this run" button is a
  follow-up.

## Hard dependencies

Must land **before or alongside** this plan for the pack-runner half
to be usable end-to-end:

- `row.socials.add` + `row.socials.remove` capabilities in row-store
  (per the 2026-05-25 design pivot in
  [[Packs-and-Bundles-Pattern]] §Row write-back). Without these, the
  Run bar shows pack runs producing 576 responses but no accepted
  cell writes land — fine for triage smoke, broken for end-to-end.

## Implementation order

1. **Pair pack-runner ⇄ prompt-template-manager** (Part 1) —
   one-line PAIRINGS entry. Smallest change; lands first to fix the
   navigation problem immediately.
2. **`Run` entity + storage in response-store** (Part 2a) —
   `runs.json`, type definitions, load + backfill, persist.
3. **Run-creation NATS subjects** (Part 2b) — `run.create.requested`,
   `run.list.requested`, `run.get.requested`, `run.cancel.requested`,
   `run.updated` broadcast. Plus the counter-increment hook inside the
   `response.create.requested` handler.
4. **Workspace router** — add `run.create`, `run.list`, `run.get`,
   `run.cancel` capabilities to
   `services/workspace/src/capabilities.ts`.
5. **prompt-runner kicks off Runs** — `runPromptAgainstRecordSet`
   creates the Run before the loop, flips ended_at after.
6. **social-search-service kicks off Runs** — `pack.fan_out.requested`
   creates the Run before fanning out; passes `run_id` into per-cell
   `response.create.requested` publishes (already wires `run_id`;
   sourcing from the real Run now).
7. **Response Reviewer renders Run bar + filter + write-target line**
   (Parts 3a, 3b, 3c).
8. **Pack Runner subscribes to `run.updated`** and renders live
   progress + "Open Response Reviewer →" button (Part 4).
9. **Row-level clarification gate** (Part 5) — new reserved key on
   `Row.fields`, two row-store capabilities, Pack Runner + Prompt
   Apply default-exclude, Response Reviewer per-response flag
   affordance. The Run entity's `row_ids` scope at kick-off filters
   out clarification-flagged rows by default.
10. **Load-time backfill of existing responses → synthetic Runs**
    (Part 6).
11. **Smoke** — kick off a pack run against the foundation dataset
    (same shape as 2026-05-25 but smaller — 6 packs × 5 rows = 30
    cells), watch the live counters tick in Pack Runner, switch to
    Response Reviewer via the new button, see the run bar match
    Pack Runner's tally, triage a few cells, observe the
    write-target line accurately reflect the socials write.

## Constraints

- **No new external dependencies** — NATS + Fastify + JSON files is
  the existing pattern; honor it
- **Backward compatible** — every existing ResponseRecord renders
  unchanged; the new Run entity is purely additive (and backfilled
  for older data)
- **Theme tokens only** for any new UI color
- **All response-store writes go through the existing NATS surface**
  — no new direct file writers

## What "done" looks like

A 30-cell smoke against the foundation dataset:

1. User picks the foundation record set in **either** Pack Runner or
   Prompt Templates — clicking "Split" opens both side-by-side.
2. User fires `pack.fan_out` from Pack Runner. Pack Runner
   immediately shows a live tally that ticks up as cells land.
3. User clicks "Open Response Reviewer →". Switches to Response
   Reviewer with the run filter pre-set to *this run*.
4. The new Run bar at the top reads the live aggregates that match
   Pack Runner.
5. Each response card shows `Writes to → row.fields.socials[] ·
   pack_id=… · replace-by-pack` in the Context panel.
6. Accepting a candidate writes into `row.fields.socials[]` (assuming
   the dependency `row.socials.add` has landed).
7. Switching the run filter to "all runs" surfaces the 96 prompt
   responses backfilled into a synthetic Prompt Run; same bar,
   different counts, accurate counts.

## Reference — the cementation discipline the user asked about

The user asked how the v4 canonical CSV got per-row status differences
between completed and incomplete rows. The answer:

- **Per-response `flag`** (`good` / `partial` / `wrong` / `needs-human`
  / `needs-rerun` / `null`) lives in response-store. Each response
  carries its triage state.
- **`response.coverage`** capability computes, per `(prompt_id,
  record_set_id)` pair, two row id sets: `covered_row_ids` (≥ 1
  non-rerun response exists) and `needs_rerun_row_ids` (every response
  for the row is needs-rerun). The Enhanced Records list uses this
  to color which rows finished vs needed re-firing.
- **`CementedTriage` on `row.fields.triage_states`** (declared in
  row-store/src/store.ts:61) — the destination for triage state to
  *travel with the row through promotion*. **Not yet implemented:**
  the promote handler does not yet cement; the `triage_states` field
  on rows in v4 stays unset. This is the next-promote-session work.
- **`Row.status?`** — declared but unused. Don't repurpose it here.

So in v4 specifically, the per-row "different status" you saw was
either (a) the response-coverage classification rendered in Enhanced
Records (which only persists derived from response-store, not on
the row itself), or (b) a row.fields.archived flag if you manually
archived some rows pre-promote. Neither makes it into the canonical
CSV column structure; both inform the UI's row decoration. The
Run entity proposed here is orthogonal — it describes the operation,
not the row outcome — and complements rather than replaces this
cementation pattern.

## Why the clarification gate is in-scope, not deferred

The reason Part 5 (row-level clarification gate) sits inside this plan
rather than being deferred: the cost scales badly across re-runs on a
bigger dataset. **6 packs × 1000 rows × 3 re-runs = 18,000 Tavily
calls** plus 18,000 low-confidence response cards in the triage queue.
Even at Tavily-paid-tier costs that's real money, but the dominant
cost is human — a triage queue at that size is unworkable. The
clarification gate keeps the bounded-cost story honest as the dataset
grows.

The example shape we keep referring back to: *"Citadel/Ken Griffin"*
in the foundation dataset. That string could resolve to Citadel (the
hedge fund), Ken Griffin (the individual), or the Griffin Catalyst
foundation. The previous prompt run produced an "unknown" — the agent
correctly declined. Six packs would produce six low-confidence
candidates per row, each wrong-but-plausible, none resolvable without
the client clarifying. The clarification gate parks the row visibly
in the canonical record set with no enrichment columns populated;
after a client meeting the user clears the flag and the row comes
back into scope for the next run.

The triple-discipline that keeps `archived` distinct from
`needs_clarification` distinct from "normal row" is the discipline:

| State | Promote carries it forward? | Operations skip it? |
|---|---|---|
| (none — normal row) | ✅ | ❌ |
| `needs_clarification` set | **✅** | **✅** |
| `archived: true` | ❌ | (n/a — already gone) |

That middle row is the new state — *parked, not removed*. The CSV
downstream of every future promotion keeps the row with its
CSV-original columns intact and the enrichment columns empty. The
client looks at the final canonical and immediately sees these
rows as conscious gaps, not missing data.

## Related

- [[Packs-and-Bundles-Pattern]] — the blueprint this plan operationalizes
- [[Entity-Profile-Augmentation-Workflow]] — the exploration
- [[Response-Reviewer-and-Response-Store]] — the shipped spec being
  extended (status: Shipped)
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — promote-mechanic
  spec; the cementation discipline mentioned in §Reference
- [[Original-and-Enhanced-Record-Instances]] — the record-instance model
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — top-level vision
- [[In-App-Chat-v0-0-1-for-Augment-It]] — the chat is a future Run
  initiator (`initiated_by: 'chat'`)
