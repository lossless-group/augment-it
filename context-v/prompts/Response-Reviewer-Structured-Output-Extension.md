---
title: "Response Reviewer — Structured-Output Extension (Packs-and-Bundles Foundation)"
lede: "Extend the shipped response-store schema and the shipped Response Reviewer remote to support pack-shaped responses — structured candidates with confidence-band pills, a five-value outcome enum, and a sibling-payload + archival-markdown shape — without breaking the free-form text responses that today's prompt-runs produce. Zero packs ship in this work. Zero bundles ship. The deliverable is the surface that every pack will land on, exercised by a small fixture of mock pack responses so the renderer can be felt in all three theme modes before any real pack exists."
date_created: 2026-05-25
date_modified: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Prompt
  - Augment-It
  - Packs-and-Bundles
  - Response-Reviewer
  - Response-Store
  - Structured-Output
  - Confidence-Pill
  - Theme-System
status: Draft
---

# Response Reviewer — Structured-Output Extension

## The work

The packs-and-bundles pattern from [[Packs-and-Bundles-Pattern]]
introduces a richer response shape than the response-store currently
stores or the Response Reviewer currently renders. Every pack
(starting with `linkedin-pack` in the next session) produces a typed
`Candidate` rather than a markdown blob. The renderer has to be ready
before the first pack arrives. This session is that readiness.

The blueprint is the spec; this prompt is the scoping directive.

## Why this is its own session

Two reasons:

1. **No pack exists yet.** Building the surface alongside the first
   pack would conflate surface-correctness (does the candidate card
   render right?) with pack-correctness (does LinkedIn's scraper work?).
   Better to prove the surface against mock fixtures first.
2. **Backward compatibility is load-bearing.** Every existing response
   in `services/response-store/data/responses.json` must continue to
   render exactly as today. The migration is invisible. Doing it as a
   standalone session means the diff is small enough to verify visually.

## What's in scope

### 1. Schema extension in `services/response-store/src/store.ts`

The shipped `ResponseRecord` (response_id, run_id, prompt_id, row_id,
record_set_id, output_column, model, request_body, response_text,
edited_text, flag, accepted, created_at, reviewed_at, edited_at) gains
six new fields:

```typescript
type Outcome = 'found' | 'not_found' | 'error' | 'skipped' | 'pending';

type Candidate = {
  url: string;
  display_name: string;
  confidence: number;                       // 0-100
  snippet?: string;
  source_metadata?: Record<string, unknown>;
};

// Added to ResponseRecord:
outcome: Outcome;
structured: Candidate | null;
archival_markdown: string | null;
pack_id: string | null;
bundle_id: string | null;
pass: 1 | 2 | null;
```

The existing backfill discipline in `load()` (already used for
`edited_text` / `edited_at`) extends to coerce older records:

- `outcome` → `'found'` if `response_text` is non-empty, else `'pending'`
- `structured`, `archival_markdown`, `pack_id`, `bundle_id`, `pass`
  → `null`

No migration script. The load-time backfill is the migration.

### 2. Theme tokens in `packages/theme/theme.css`

Three new named tokens. Each defined in **all three mode blocks**
(light, dark, vibrant) per [[Impose-Theme-Modes-System]]:

```
--color-confidence-low    (red family)
--color-confidence-med    (amber family)
--color-confidence-high   (green family)
```

Pick reasonable initial hex values per mode; ergonomics are more
important than perfection — iterate on the named-token tier once the
pill is rendering somewhere visible.

### 3. Confidence-pill component in `packages/shared-ui/`

A small Svelte 5 component. Props:

```typescript
{
  confidence: number;   // 0-100, required
  tooltip?: string;     // optional hover reasoning
}
```

Behavior:

- Render the numeric value (e.g., `87`) inside a small pill
- Color band by range: 0-39 = `--color-confidence-low`,
  40-69 = `--color-confidence-med`, 70-100 = `--color-confidence-high`
- Colors via the theme tokens — **never** hardcoded hex
- On hover, show the `tooltip` if provided

Pick whatever pill shape feels native to the existing
`packages/shared-ui/` conventions. If `packages/shared-ui/` is sparse
today, this is its first real component — establish the shape (Svelte
5, exported via package entry, consumable from any remote).

### 4. Response Reviewer renderer extension in `apps/response-reviewer/`

The shipped renderer shows `response_text` as free-form prose with
edit/triage ergonomics. The extension branches on `outcome`:

| `outcome`     | Render                                                                              |
|---------------|-------------------------------------------------------------------------------------|
| `found`       | Candidate card above the prose (see below); triage controls unchanged               |
| `not_found`   | Informational thin row ("source ran, zero candidates"); **no triage controls**      |
| `error`       | Thin row with error text + a disabled retry button (tooltip: "retry coming later")  |
| `skipped`     | Thin row showing the carried-forward URL, pre-marked `good`                         |
| `pending`     | Spinner row, no controls                                                            |

Plus the legacy case: if `structured === null` AND `outcome === 'found'`
(i.e., a pre-pack response from the existing prompt-runner), render
**exactly as today** — same prose box, same triage controls. No visual
change for non-pack responses. This is the backward-compat path.

#### The candidate card (when `structured !== null`)

Renders above the existing prose. Contents:

- **Confidence pill** (the new component) immediately before the URL
- **URL** — clickable, opens in new tab
- **Display name** next to the URL
- **Snippet** — collapsible by default, single click to expand
- **Source badge** — for v1, just displays the raw `pack_id` as a
  small label. The per-pack render-config from the blueprint comes
  online with the first real pack; until then, the raw pack_id is the
  v1 affordance.

The prose (`response_text`) renders below the card with all existing
triage controls intact. The card adds context; it doesn't replace the
triage surface.

### 5. Mock fixture for end-to-end smoke

A small set of pack-shaped mock responses written into a fixture file
(somewhere appropriate — `services/response-store/data/fixtures/` if
the response-store has a fixtures convention, otherwise a sibling
JSON the response-reviewer can load on demand). Five mock records,
one per outcome:

- `found` (high confidence, ~87) — green pill, LinkedIn-shaped
- `found` (med confidence, ~55) — amber pill
- `found` (low confidence, ~22) — red pill
- `not_found` — informational thin row
- `error` — thin row with disabled retry
- `skipped` — thin row with pre-populated URL
- `pending` — spinner row

(Seven mock records, not five — three for the confidence-band
coverage on `found`, plus one each for the other outcomes.)

Mock `pack_id` values: `linkedin-pack-mock`, `candid-pack-mock` —
clearly fake so nobody mistakes them for real packs.

## What's explicitly out of scope

- `linkedin-pack` or any other pack. The first pack lands in the next
  session.
- The bundle runtime — roster, orchestration, carry-forward. Two
  sessions after this one.
- The `profiles.dedup.scan` capability. Lands with the first bundle.
- Two-pass orchestration + entity-typed bundles.
- The retry button's actual retry implementation. Wired in a later
  session.
- Per-pack render-config plumbing — for now the source badge displays
  the raw `pack_id`; the declarative render-config comes online with
  the first real pack.
- The `source_metadata` per-source display (format hints, etc.) —
  lands per-pack in the next session.
- The promote-to-canonical write-back of `profiles.<source>` clusters
  — extension of the existing promote handler, noted but lives in a
  later session.
- New external dependencies. No charting libs, no design-system
  imports — the pill is a small Svelte component.

## Constraints

- **Svelte 5** with `$state` runes; no React, no Tailwind
- **Backward compatible** — every existing response renders identically
  to today after the migration. No visual diff for non-pack responses.
- **Theme tokens only** for color — never hardcoded hex in the pill or
  card components
- **Three-mode contract** — every new token defined in all three mode
  blocks; the pill verified in all three modes during smoke
- **No data-migration script** — the load-time backfill is the migration
- **Type-driven rendering** — `outcome` drives the render branch; we
  do not key off `structured !== null` *first*. Outcome is the
  discriminator. Per the
  [[feedback_augment_it_dynamic_schema]] memory and the recent
  "all data continues" changelog entry, type-based dispatch beats
  presence-of-field dispatch.
- **No hardcoded field names** for the candidate card display — the
  card reads `structured.url`, `structured.display_name`,
  `structured.confidence`, etc., but anything from `source_metadata`
  stays generically rendered until per-pack render-configs exist.

## What "done" looks like

Manual smoke walkthrough:

1. Open Response Reviewer against the current
   `services/response-store/data/responses.json` (your actual data).
   Every response renders exactly as it did before this session. No
   visual diff. The migration is invisible.
2. Load the mock fixture. Response Reviewer now shows the seven mock
   responses alongside (or in place of) the real ones.
3. The three `found` mocks render with candidate cards:
   - Green pill for the 87-confidence one
   - Amber pill for the 55-confidence one
   - Red pill for the 22-confidence one
   All three with URL, display name, collapsible snippet, source badge,
   prose below, triage controls intact.
4. The `not_found` mock shows the informational thin row. No triage
   controls visible.
5. The `error` mock shows the thin row with error text + a disabled
   retry button. Hovering the button shows the tooltip.
6. The `skipped` mock shows the thin row with the pre-populated URL
   marked `good`.
7. The `pending` mock shows the spinner row.
8. Toggle theme modes (light / dark / vibrant). The pill re-tints
   correctly in all three — colors visibly different per mode but
   semantically consistent (low always feels "red", etc.).
9. Refresh the page. Schema persists; all responses still render
   correctly.

If all nine steps work, the surface is real and the next session
(linkedin-pack) has a foundation to land on.

## Suggested implementation order

1. Schema extension in `store.ts` — types first, then the backfill in
   `load()`. Run the server, confirm existing responses round-trip
   through the load + save cycle with the new nullable fields.
2. Theme tokens in `theme.css` — three tokens × three modes = nine
   color values. Pick initial hex; iterate later.
3. Confidence-pill component in `packages/shared-ui/`. Verify it
   renders standalone (a tiny test page or storybook-equivalent if one
   exists; otherwise mount it in a corner of Response Reviewer
   temporarily).
4. Renderer branch on `outcome` in `apps/response-reviewer/`. Start
   with the `found` + candidate-card path, then add the non-`found`
   outcome renders.
5. Mock fixture. Wire a way to view it (a query param? a debug
   button?). The mechanism is throwaway — it's for this session's
   smoke, not a permanent feature.
6. Walk through the nine smoke steps. Iterate on whatever feels off.

## Open calls the implementer makes

These are intentionally not pre-decided — the implementer picks based
on what fits the existing codebase:

- Exact path for the confidence-pill component within
  `packages/shared-ui/`
- The exact shape of the source badge label (just the pack_id, or
  pack_id rendered prettier — fine either way for v1)
- How the mock fixture is loaded (query param, debug button, environment
  flag — pick what's least intrusive)
- Whether the retry button's tooltip shape uses an existing tooltip
  primitive or a fresh `title=` — match the codebase

If any of these turn out to deserve a permanent decision, lift the
answer into the blueprint when this session lands.

## After this session lands

- Update the changelog entry for the ship
- If anything in the blueprint turned out wrong during implementation,
  edit the blueprint *first*, then re-implement (per
  [[Spec-Kit-and-Context-V-Coexistence]] — context-v is the source of
  truth)
- Next session opens with the linkedin-pack prompt — first concrete pack
  landing on this surface

## Related

- [[Packs-and-Bundles-Pattern]] — the blueprint this session
  operationalizes (the foundation layer)
- [[Entity-Profile-Augmentation-Workflow]] — the exploration with the
  resolved open questions
- [[Response-Reviewer-and-Response-Store]] — the shipped spec being
  extended (status: Shipped)
- [[Impose-Theme-Modes-System]] — the three-mode contract
- [[Run-Speckit-Specify-Response-Reviewer-Structured-Output]] — the
  deferred Spec-Kit version of this directive, kept for future
  reference
