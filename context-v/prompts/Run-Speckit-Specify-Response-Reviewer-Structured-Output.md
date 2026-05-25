---
title: "Run /speckit-specify — Response Reviewer Structured-Output Extension (Packs-and-Bundles Feature 1)"
lede: "The first Spec-Kit feature in the packs-and-bundles series. Extends the shipped response-store schema with sibling-payload structured output, the five-value outcome enum, archival markdown, and the pack/bundle correlation fields — and extends the shipped Response Reviewer remote to render the structured payload as a candidate card with a confidence pill. Zero packs are implemented in this feature. Zero bundles are implemented. The work is the surface that every pack will land on; the next three features (linkedin-pack, profile-builder.common bundle, then two-pass + entity-typed bundles) ride this foundation."
date_created: 2026-05-25
date_modified: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
tags:
  - Prompt
  - Spec-Kit
  - Specify
  - Augment-It
  - Packs-and-Bundles
  - Response-Reviewer
  - Structured-Output
status: Deferred
deferral_note: "Kept as a future reference. The team is using the homegrown context-v system (exploration + blueprint as system-of-record) for the packs-and-bundles work in this branch. The plan is to revisit Spec-Kit *after* the blueprint is built and linkedin-pack is working — at that point we'll have lived experience of the pattern to make Spec-Kit's spec/plan/tasks shape coherent. Active prompt for the next implementation session is [[Response-Reviewer-Structured-Output-Extension]]."
revisions:
  - 2026-05-25 — Initial draft.
  - 2026-05-25 — Deferred per user decision. System-of-record remains the homegrown context-v artifacts ([[Packs-and-Bundles-Pattern]] blueprint + [[Entity-Profile-Augmentation-Workflow]] exploration). To be revisited after linkedin-pack ships.
---

# Run /speckit-specify — Response Reviewer Structured-Output Extension

## Why narrow scope

`/speckit-specify` produces one feature spec per invocation. The
packs-and-bundles pattern from [[Packs-and-Bundles-Pattern]] decomposes
into four shippable features; this is feature 1. Going broad (specifying
the framework + the first pack + the first bundle in one feature) would
conflate surface-correctness with pack-correctness with orchestration-
correctness. Narrow gives us a real first feature: the surface every
pack lands on, demonstrable in isolation with mock pack responses.

The three subsequent features get their own `/speckit-specify` calls —
listed under "Future features" below.

## Prerequisite reading

`/speckit-specify` should read these before drafting:

- `.specify/memory/constitution.md` — the ratified principles
- `context-v/blueprints/Packs-and-Bundles-Pattern.md` — the pattern this
  feature operationalizes (the foundation layer)
- `context-v/explorations/Entity-Profile-Augmentation-Workflow.md` — the
  exploration that produced the blueprint (open questions resolved
  inline are load-bearing)
- `context-v/specs/Response-Reviewer-and-Response-Store.md` — the
  shipped spec for the surface being extended (status: Shipped)
- `context-v/plans/Impose-Theme-Modes-System.md` — the three-mode theme
  contract the new theme tokens must respect (status: Shipped)
- `services/response-store/src/store.ts` — the current `ResponseRecord`
  type that gets extended
- `apps/response-reviewer/` — the shipped remote whose renderer gets
  extended (locate the candidate card render path)
- `packages/shared-ui/` — likely home for the new confidence-pill
  component
- `packages/theme/theme.css` — where the three confidence color tokens
  land

## How to invoke

```
/speckit-specify Read context-v/prompts/Run-Speckit-Specify-Response-Reviewer-Structured-Output.md and follow its "Feature description" section. Scope is intentionally narrow — schema extension + renderer extension + confidence-pill component + theme tokens. No pack implementations. No bundle runtime. No dedup capability. Those land in features 2-4.
```

## Feature description

### What we're building

The surface every pack will land on. Four pieces:

1. **`ResponseRecord` schema extension** in
   `services/response-store/src/store.ts`. Today's shape (response_id,
   run_id, prompt_id, row_id, record_set_id, output_column, model,
   request_body, response_text, edited_text, flag, accepted,
   created_at, reviewed_at, edited_at) gains six new fields:

   - `outcome: 'found' | 'not_found' | 'error' | 'skipped' | 'pending'`
   - `structured: Candidate | null` — sibling payload, present iff
     `outcome === 'found'` for a pack response
   - `archival_markdown: string | null` — structured rendered down to
     human-readable markdown; nullable
   - `pack_id: string | null` — set iff this response was a pack fire
   - `bundle_id: string | null` — set iff fired from a bundle
   - `pass: 1 | 2 | null` — set iff bundle is two-pass

   With `Candidate` defined per the blueprint:

   ```typescript
   type Candidate = {
     url: string;
     display_name: string;
     confidence: number;        // 0-100
     snippet?: string;
     source_metadata?: Record<string, unknown>;
   };
   ```

2. **Backfill discipline** in `store.ts`'s `load()` — the existing
   load-time backfill pattern (already used for `edited_text` /
   `edited_at`) extends to coerce older records:
   - `outcome` → `'found'` if `response_text` is non-empty, else
     `'pending'`
   - `structured`, `archival_markdown`, `pack_id`, `bundle_id`, `pass`
     all → `null`

   No data migration script. The load-time backfill is the migration
   (same approach the shipped codebase already uses).

3. **Response Reviewer renderer extension** in
   `apps/response-reviewer/` (the shipped remote). The renderer
   today shows `response_text` as free-form prose with edit/triage
   ergonomics. The extension:

   - If `structured === null`: render exactly as today (backward
     compatible, no visual change for non-pack responses).
   - If `structured !== null`: render a **candidate card** above the
     prose. The card displays:
     - The confidence pill (new component, see #4) immediately before
       the URL
     - The URL (clickable, opens in new tab)
     - The `display_name` next to the URL
     - The `snippet` (collapsible by default — read it without
       leaving the card)
     - A small source badge (the `pack_id`, until a per-pack render
       config exists; this is a v1 affordance, not the final shape
       from the blueprint)
   - The prose (`response_text`) renders below the card as today.
     The triage controls (good/partial/wrong/needs-rerun/needs-human)
     stay where they are.

4. **The confidence pill component** at
   `packages/shared-ui/confidence-pill.svelte` (or similar — the plan
   phase picks the exact path; `packages/shared-ui/` is the natural
   home). The component:

   - Accepts `confidence: number` (0-100) as its sole required prop
   - Renders the numeric value inside a small pill
   - Color band by range: 0-39 = low (red family), 40-69 = med (amber
     family), 70-100 = high (green family)
   - Colors come from new theme tokens (see #5) — never hardcoded
   - Optional `tooltip?: string` prop for the hover reasoning text

5. **Theme tokens** in `packages/theme/theme.css`. Three new named
   tokens, each defined in the light, dark, and vibrant mode blocks
   per the three-mode contract from [[Impose-Theme-Modes-System]]:

   - `--color-confidence-low` — red family
   - `--color-confidence-med` — amber family
   - `--color-confidence-high` — green family

   The exact hex values are a design call the spec doesn't pin —
   `/speckit-plan` can propose values; the user signs off. The
   discipline is: defined in all three modes, semantically named, no
   raw hex in the pill component.

6. **Outcome-driven renders for non-`found` outcomes.** The renderer
   handles each outcome value distinctly:

   - `found`: candidate card + prose (above)
   - `not_found`: informational thin row ("source ran, zero
     candidates"), **no triage controls** (this is not a triage state)
   - `error`: thin row with the error message + a retry button stub
     (retry implementation is out of scope; button can be disabled
     with a tooltip "retry coming in a later feature")
   - `skipped`: thin row showing the carried-forward URL marked
     `good` (this is the dedup pre-population case from the
     blueprint; the stored response shows what would have fired)
   - `pending`: spinner row, no controls

### Constraints (per constitution + blueprint)

- **Svelte 5** with `$state` runes throughout
- **Backward compatible** — every existing `ResponseRecord` in
  `services/response-store/data/responses.json` must continue to render
  exactly as today after the migration. No visual diff for non-pack
  responses.
- **No new external dependencies** — the pill is a small Svelte
  component, no charting libs, no design-system imports
- **Theme tokens only** for color — never hardcoded hex in the pill or
  card components
- **Three-mode contract** — every new token defined in all three mode
  blocks; the pill verified in all three modes
- **Mock-driven tests** — feature ships with a small fixture of
  pack-shaped responses (mock LinkedIn, mock Candid) so the renderer
  is exercised without any actual pack existing
- **No pack implementations** — repeatedly: this feature ends where the
  first pack begins

### What's explicitly out of scope

- `linkedin-pack` or any other pack (feature 2)
- The bundle runtime — roster, orchestration, carry-forward (feature 3)
- The `profiles.dedup.scan` capability (feature 3)
- Two-pass orchestration + entity-typed bundles (feature 4)
- The retry button's actual retry implementation (later)
- Per-pack render-config plumbing (the blueprint's "render config" on
  each pack — comes online with the first real pack; for now the source
  badge displays the raw `pack_id`)
- The `source_metadata` per-source display (the blueprint mentions
  per-pack format hints; those land per-pack in feature 2+)
- The promote-to-canonical write-back of `profiles.<source>` clusters
  — that's part of the existing promote handler; extension scope is
  noted but lives in a later feature

### What "done" looks like

Manual smoke test:

1. Existing responses render exactly as today in Response Reviewer —
   the schema migration is invisible to the user.
2. A test fixture with three mock pack responses (one `found`, one
   `not_found`, one `error`) lands in `responses.json`; opening Response
   Reviewer shows:
   - The `found` response: candidate card with confidence pill (green
     for 87, amber for 55, red for 22 in the same fixture) above the
     prose; clickable URL; collapsible snippet
   - The `not_found` response: thin row with the informational message,
     no triage controls
   - The `error` response: thin row with error text and a disabled
     retry button
3. Toggling theme mode (light / dark / vibrant) re-tints the pill
   correctly in all three — colors visibly different per mode but
   semantically consistent (low always feels "red," etc.).
4. A `pending` mock response shows the spinner row.
5. A `skipped` mock response shows the carried-forward URL marked
   `good`.

If all five steps work, the surface is real and the next feature
(`linkedin-pack`) has a foundation to land on.

### Implementation order suggestions (for `/speckit-plan` later)

1. Schema extension in `store.ts` (types + backfill in `load()`)
2. Theme tokens in `theme.css` (all three modes, all three tokens)
3. Confidence-pill component in `packages/shared-ui/`
4. Renderer extension in `apps/response-reviewer/` — candidate card,
   then non-`found` outcomes
5. Test fixture (five mock responses covering all five outcomes)
6. Manual smoke walkthrough across the three modes

## Future features (each its own `/speckit-specify` later)

- **Feature 2 — `linkedin-pack` end-to-end.** First concrete pack. Own
  MCP server, own federated microfrontend (thin — most rendering is
  Response Reviewer), search-then-confirm scraper, extraction-schema
  + render-config exports. Fires directly from a prompt template
  (no bundle layer yet) so pack-correctness isn't conflated with
  orchestration-correctness.
- **Feature 3 — `profile-builder.common` bundle (LinkedIn + X).** First
  concrete bundle. Bundle runtime — pack roster, single-pass
  orchestration (no two-pass yet), chat verb registration, the
  `profiles.dedup.scan` pre-flight hook. Adds `x-pack` since two packs
  is the minimum to prove orchestration without burying it.
- **Feature 4 — Two-pass orchestration + first entity-typed bundle.**
  Adds carry-forward between passes, the human checkpoint, and
  `profile-builder.philanthropic-org` (or another entity-typed bundle)
  exercising the default-4-to-6 source-selection discipline against the
  18-source Tier-2 philanthropy list.

This ordering is a recommendation, not a contract — adjust as reality
contacts the code.

## After this feature spec lands

1. Review `.specify/memory/specs/NNN-*/spec.md` (the file
   `/speckit-specify` creates).
2. `/speckit-clarify` — there are likely 3-5 ambiguities worth
   surfacing (the exact hex values, whether the source badge stays
   raw-pack_id in v1, the not_found row's affordance shape, etc.).
3. `/speckit-plan` to draft the implementation plan.
4. `/speckit-checklist` to generate quality gates.
5. `/speckit-tasks` to break the plan into actionable tasks.
6. `/speckit-analyze` to cross-check consistency.
7. Review gate.
8. `/speckit-implement` — execute.

## Related

- `.specify/memory/constitution.md` — the ratified principles
- `context-v/blueprints/Packs-and-Bundles-Pattern.md` — the pattern
- `context-v/explorations/Entity-Profile-Augmentation-Workflow.md` —
  the exploration with the resolved open questions
- `context-v/specs/Response-Reviewer-and-Response-Store.md` — the
  shipped spec being extended
- `context-v/plans/Impose-Theme-Modes-System.md` — the three-mode
  contract the new tokens respect
- `context-v/blueprints/Spec-Kit-and-Context-V-Coexistence.md` —
  workflow framework
