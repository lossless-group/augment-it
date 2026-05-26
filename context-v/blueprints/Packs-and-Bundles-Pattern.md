---
title: "Packs and Bundles — The Two-Tier Pattern for Entity-Profile Augmentation (and Beyond)"
lede: "When augment-it needs to fan out across many sources to find verified profiles for an entity (LinkedIn + X + BlueSky + YouTube for everyone, then Candid + ProPublica + IRS 990 + Charity Navigator for a nonprofit), the right abstraction is not a single capability and not a single big prompt. It is two tiers. A **pack** is the atomic unit — one source, one microfrontend, one MCP-server microservice, one prompt-snippet, one extraction-schema, one render-config. A **bundle** is the orchestration unit — a named composition of packs with single-pass or two-pass execution, data carry-forward between passes, agent-driven pre-flight dedup against existing `helpful_links`, and a single chat verb that fires the whole thing. This blueprint codifies both."
date_created: 2026-05-25
date_modified: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.3
revisions:
  - 2026-05-25 — Initial draft.
  - 2026-05-25 — **Design pivot from `profiles.<source>` columns to a single `socials` JSON column per row, mirroring `helpful_links`.** Triggered by smoke-run feedback: spawning N new columns per pack obscured the result (no row-level view of which platforms were filled in) and broke the dynamic-schema discipline that "row columns are CSV-derived." New shape: one row-level column `socials: SocialProfile[]` containing all accepted pack profiles. Acceptance of a pack response routes through `row.socials.add` (replace-by-pack_id semantics — one entity has one LinkedIn) instead of `row.update` against a per-pack output_column. See §Row write-back below for the schema + capabilities.
  - 2026-05-26 — Added §Triage Surface UX Requirements (emergent). Captures pattern-level requirements that the foundation-dataset smoke surfaced — discoveries the upfront draft didn't anticipate. Codified here so future pack/bundle implementations across the Lossless family inherit the discipline without re-hitting the same walls.
tags:
  - Blueprint
  - Augment-It
  - Packs-and-Bundles
  - MCP-Servers
  - Microfrontends
  - Microservices
  - Multi-Agent-Fan-Out
  - Profile-Augmentation
  - Response-Reviewer
  - Verification-Pattern
status: Draft
---

# Packs and Bundles — The Two-Tier Pattern

## Why this blueprint exists

Augment-it's existing architecture already had two well-formed verbs:
single-prompt-per-row enrichment (Prompt Template Manager → Request
Reviewer → Response Reviewer) and human-checkpointed promotion
(Enhanced-Records-List). Neither verb handles the multi-source fan-out
that "find every public profile for this entity" requires. The
[[Entity-Profile-Augmentation-Workflow]] exploration converged on a
two-tier abstraction that fits the existing discipline rather than
replacing it. This blueprint is the codified version of that pattern —
the institutional knowledge anyone implementing a new pack or bundle
needs to respect.

The pattern generalizes beyond profile augmentation. Any workflow where
a single user intent needs to fan out across N typed-and-versioned
sources, with verification and dedup, is a pack-and-bundle problem.

## The two tiers, defined precisely

### Pack

A **pack** is the atomic, source-bound unit of work. One pack ↔ one
source ↔ one MCP server ↔ one microfrontend. A pack is a *deployment
unit*: it ships as its own federated remote plus its own backing
microservice.

A pack carries four things:

1. **A prompt-snippet template.** Not a full prompt — a parameterizable
   fragment the orchestrating bundle composes with bundle-level context
   (entity-name, entity-type hint, carried-forward fields from prior
   passes).
2. **An MCP server interface.** Typed input/output for the source. The
   server is the implementation; the interface is the contract.
3. **An extraction schema.** The structured-output shape this source
   produces. The baseline is `{ url, display_name, confidence, snippet,
   source_metadata }`, but source-specific variations are allowed
   (e.g., Candid responses include `ein`; SEC EDGAR includes `cik`).
4. **A render configuration.** How this source's structured output
   renders in Response Reviewer — confidence pill placement, URL
   styling, source badge, snippet collapse behavior, source-specific
   affordances.

### Bundle

A **bundle** is the workflow-shaped composition of packs. A bundle is
*not* a deployment unit — it's a config artifact that lives alongside
prompt templates. One bundle ↔ one user-facing chat verb.

A bundle carries five things:

1. **A pack roster.** Which packs participate. Each entry includes a
   `default: bool` flag (see Source-selection discipline below) and a
   `pass: 1 | 2` for two-pass bundles.
2. **An orchestration plan.** Single-pass or two-pass. If two-pass,
   the carry-forward contract — which fields from pass-1 triaged-good
   responses get spliced into pass-2 prompt context.
3. **A chat verb registration.** The user-facing handle the chat
   invokes. Follows the per-app verb-namespace convention
   (`profile-builder.<entity-type>`).
4. **A pre-flight dedup hook.** Invocation of `profiles.dedup.scan`
   before the roster fires. Returns a per-row, per-source skip-list
   plus pre-populated `good` responses for already-known URLs.
5. **A render strategy at the bundle level** — how the per-pack
   responses aggregate into the per-row Response Reviewer view.
   Typically: grouped by pass, sorted within group by confidence.

## Pack anatomy — the four sub-contracts

### 1. The prompt-snippet template

A prompt-snippet is not a complete prompt. It is a fragment that
expects bundle-level context to land in known parameter slots. Example
shape for `linkedin-pack`:

```handlebars
Find the verified LinkedIn profile for "{{entity_name}}"
{{#if entity_type}}who is a {{entity_type}}{{/if}}
{{#if carry_forward.display_name}}also known as "{{carry_forward.display_name}}"{{/if}}
{{#if carry_forward.organization}}affiliated with {{carry_forward.organization}}{{/if}}.

Return only verified, public LinkedIn URLs.
```

Slot conventions:
- `{{entity_name}}` — required, supplied by the bundle from the row
- `{{entity_type}}` — optional, the bundle's entity-type parameter
- `{{carry_forward.<field>}}` — optional, populated only in pass 2 of
  two-pass bundles, sourced from pass-1 triaged-good responses

The bundle assembles the snippet into the full prompt at fire time. The
pack does not own the surrounding "you are a research assistant"
framing — that lives at the bundle level for consistency across packs.

### 2. The MCP server interface

Each pack's backing service exposes a single MCP tool with a typed
shape:

```typescript
// Input
{
  entity_name: string;
  entity_type?: EntityType;          // 'public-company' | 'hnwi' | 'philanthropic-org' | 'vc-firm' | 'startup'
  disambiguators?: Record<string, string>;  // carry-forward fields, free-form
}

// Output
{
  outcome: 'found' | 'not_found' | 'error';
  candidates?: Candidate[];          // present iff outcome === 'found'
  error_message?: string;            // present iff outcome === 'error'
  source_name: string;               // pack identifier
  source_version: string;            // pack version that produced this
  retrieved_at: ISO8601String;
}

type Candidate = {
  url: string;
  display_name: string;
  confidence: number;                // 0-100, see Confidence pill below
  snippet?: string;                  // short prose excerpt from the source
  source_metadata?: Record<string, unknown>;  // pack-specific extras
}
```

Provenance discipline: every response carries `source_name`,
`source_version`, and `retrieved_at` — these are not optional. They
land in response-store unchanged and ride through accept into the
row's single `socials` JSON column (see §Row write-back).

### 3. The extraction schema

The schema lives in code alongside the pack, exported for the Response
Reviewer renderer and the response-store validator. Baseline:

```typescript
{
  url: string;
  display_name: string;
  confidence: number;
  snippet?: string;
  source_metadata?: Record<string, unknown>;
}
```

Source-specific extensions go in `source_metadata` (never as top-level
fields). Examples:

- Candid: `source_metadata: { ein, ntee_code, gross_receipts }`
- SEC EDGAR: `source_metadata: { cik, ticker, filings_count }`
- LinkedIn: `source_metadata: { headline, location, connection_count_band }`

This keeps the top-level schema stable across packs, which keeps the
Response Reviewer base renderer simple and lets per-source enrichment
live behind a `render` config that knows the pack's `source_metadata`
shape.

### 4. The render configuration

The render config is a small declarative object the Response Reviewer
reads to lay out a candidate card. Baseline fields:

```typescript
{
  source_badge: { label: string; color_token: string };  // theme-system tokens
  url_pill_position: 'before' | 'after';                 // confidence pill placement
  snippet_default: 'expanded' | 'collapsed';
  metadata_fields_to_display: string[];                  // keys from source_metadata
  per_field_format?: Record<string, FormatHint>;         // e.g., format ein as XX-XXXXXXX
}
```

Render config lives next to the pack code — every pack ships its own
config alongside its schema and snippet.

## Bundle anatomy — the five sub-contracts

### 1. The pack roster

A roster is an ordered list. Each entry:

```typescript
{
  pack_id: string;           // e.g., 'linkedin-pack'
  pass: 1 | 2;               // for two-pass bundles; always 1 for single-pass
  default: boolean;          // true = fires by default; false = opt-in per run
  required: boolean;         // true = bundle reports failure if this pack errors
}
```

Default discipline: a bundle should have **4-6 default-true packs**
across its roster. The rest are opt-in per dataset (set at bundle-
invocation time in chat) or per row (set during pre-flight review).
This is why Tier-2 philanthropy's 18 sources don't all become a single
bundle — a bundle picks the 4-6 most reliable for its entity type and
exposes the others as opt-in.

### 2. The orchestration plan

Single-pass: every roster entry fires in parallel against the row.

Two-pass: pass-1 entries fire in parallel, then a checkpoint, then
pass-2 entries fire with carry-forward context from pass-1's
triaged-good responses.

Checkpoint behavior between passes:
- Default: wait for human triage of pass-1 responses in Response
  Reviewer; pass-2 fires when user confirms "ready to proceed" (a new
  chat affordance).
- Time-boxed: pass-1 has a configurable timeout (default 5 min); if
  the user hasn't triaged by then, pass-2 fires with whatever pass-1
  produced (treating untriaged `found` responses as candidate
  carry-forward data, with reduced confidence).
- Skip: bundles can declare `skip_human_checkpoint: true` for runs
  where the user explicitly waived it (rare; needs `requires_user_
  confirmation` gating from the chat).

Carry-forward contract:
```typescript
{
  from_pack: string;           // 'linkedin-pack'
  field: string;               // 'display_name' or 'source_metadata.headline'
  to_slot: string;             // 'carry_forward.display_name' in pass-2 snippets
  min_confidence?: number;     // skip if pass-1 confidence below this
}
```

### 3. The chat verb registration

A bundle registers exactly one verb in the per-app verb namespace.
Convention: `profile-builder` for the common-five-only bundle;
`profile-builder.<entity-type>` for entity-typed bundles. Examples:

- `profile-builder.common`
- `profile-builder.philanthropic-org`
- `profile-builder.public-company`
- `profile-builder.venture-capital-firm`
- `profile-builder.startup`
- `profile-builder.hnwi`

The verb registers with the chat the same way other verbs do (per
[[In-App-Chat-v0-0-1-for-Augment-It]]'s patterns). The bundle file
declares the verb; the chat picks it up from the per-app capability
registry.

### 4. The pre-flight dedup hook

Every bundle invokes `profiles.dedup.scan` before its roster fires.
The scan:

1. Reads the target row's `helpful_links` array.
2. Reads the target row's `socials` array from prior runs (see
   §Row write-back below).
3. For each pack in the roster: checks if a matching URL is already
   present (URL-shape match per the pack's source domain).
4. Returns a per-row, per-pack object: `{ skip: bool, prepopulate?:
   Candidate }`.

The bundle honors the scan: packs flagged `skip: true` don't fire;
their slot in Response Reviewer is pre-populated with the existing URL
marked `good`. Surfaced in the chat narration ("3 of 8 sources already
have URLs in helpful_links; firing the remaining 5").

### 5. The bundle-level render strategy

Response Reviewer's existing one-response-at-a-time view becomes a
*per-row, per-bundle aggregate view* when a bundle fires. The default
aggregate strategy:

- Group by pass (pass-1 above pass-2)
- Within group, sort by per-pack confidence (high → low)
- Skipped packs render as a thin row showing the carried-forward URL
- `not_found` packs render as an informational thin row, not a
  triage-required card
- `error` packs render with retry affordance

## Response shape — sibling payload + archival markdown

Response Reviewer's existing single-text-box response shape extends to
support packs:

```typescript
// Response-store row
{
  // existing fields
  request_id, model, fired_at, run_id, row_id, prompt_id,
  
  // new pack-aware fields
  pack_id?: string;                  // set iff this response was a pack fire
  bundle_id?: string;                // set iff fired from a bundle
  pass?: 1 | 2;                      // set iff bundle is two-pass
  
  // structured output (new sibling-payload shape)
  prose: string;                     // the model's free-form output (always present)
  structured?: Candidate;            // present iff pack returned a candidate
  outcome: 'found' | 'not_found' | 'error' | 'skipped' | 'pending';
  
  // archival concern
  archival_markdown?: string;        // structured rendered down to markdown; nullable
  
  // existing triage fields
  triage_state, edited_text, needs_human, ...
}
```

Why sibling-payload + archival-markdown:
- Sibling-payload is the **wire shape** — typed, validated, machine-
  readable, easy to render.
- Archival-markdown is **for humans skimming the response-store later**
  — the structured payload rendered to a stable markdown shape. Saved
  alongside, not derived from, the structured field. Nullable because
  not every response benefits (free-form prose responses leave it
  null).

## Confidence pill — the rendering contract

Confidence is stored numeric 0-100 on the wire. Rendered as a small
pill immediately before the URL value. Color bands (theme tokens):

| Band | Range | Token |
|---|---|---|
| Low | 0-39 | `--color-confidence-low` (red family) |
| Medium | 40-69 | `--color-confidence-med` (amber family) |
| High | 70-100 | `--color-confidence-high` (green family) |

The tokens live in `packages/theme/theme.css` per the three-mode
contract from [[Impose-Theme-Modes-System]]. The pill component lives
in a shared `@augment-it/ui` package so every pack's render config
references the same component.

The pill displays the numeric value (e.g., `87`); the color band is
the visual cue. Tooltip on hover shows the source-specific reasoning
("exact name match + verified employer match" or "fuzzy match only").

## Response-store outcome enum

```
'found'      — one or more candidates returned
'not_found'  — source ran cleanly, zero candidates
'error'      — source failed (timeout, rate-limit, parse error, etc.)
'skipped'    — pre-flight dedup pre-populated this slot
'pending'    — in-flight; not yet completed
```

Each maps to a distinct render:
- `found`: candidate card(s), triage required
- `not_found`: informational thin row, no triage
- `error`: thin row with retry button
- `skipped`: thin row showing the carried-forward URL (already triaged
  as `good`)
- `pending`: spinner row

## Row write-back — one `socials` column, JSON-shaped

**Revised 2026-05-25 — supersedes the earlier `profiles.<source>` cluster.**
Accepting a pack response writes the chosen candidate into a single
row-level column called `socials`, mirroring the shape `helpful_links`
already follows. Rationale:

- **Visibility.** Record Collector's generic renderer surfaces every
  `row.fields` key. One `socials` column shows up as one cell the user
  can see; six `profiles.linkedin`, `profiles.x`, `profiles.bluesky`,
  …columns push real data off-screen and obscure which platforms have
  been filled in.
- **Dynamic-schema discipline.** [[feedback_augment_it_dynamic_schema]]:
  row columns derive from CSV headers, never get user/system-predefined.
  Spawning N system columns per pack run violates that; one `socials`
  field (added at first accept) keeps the discipline intact.
- **Familiarity.** `helpful_links` already proved this pattern for
  per-row arrays of structured items. `socials` matches it shape-for-
  shape so the rendering + edit affordances compose.

### Shape

```typescript
type SocialProfile = {
  socials_id: string;                    // mirrors helpful_links.link_id
  pack_id: string;                       // 'linkedin-pack', etc.
  url: string;
  display_name: string;
  confidence: number;
  snippet?: string;
  source_metadata?: Record<string, unknown>;
  response_id: string;                   // provenance — which response was accepted
  accepted_at: string;                   // ISO timestamp
};

// On the row:
row.fields.socials: SocialProfile[]
```

### Capabilities (mirror helpful_links)

- `row.socials.add` — accept handler routes here for any response whose
  `pack_id !== null`. **Replace-by-pack_id semantics** — one row has
  exactly one entry per pack_id (a row's "LinkedIn" is one URL, not
  many). Accepting a second LinkedIn candidate for the same row
  replaces the first; the previous response remains in response-store
  for audit (its `accepted` flag stays true historically but the row
  fields no longer reference it).
- `row.socials.remove` — drop one entry by `socials_id`.

### Accept routing

The existing `response.accept.requested` handler in response-store
forks at acceptance time:

- `response.pack_id === null` → existing path: `row.update` against
  `response.output_column`. Pre-pack prompt-runner responses keep
  working unchanged.
- `response.pack_id !== null` → new path: `row.socials.add`. The
  `output_column` field becomes informational only for pack responses
  (still stored on the response for provenance, but not used as a
  cell target).

### What pack responses set as `output_column`

For pack responses, set `output_column: 'socials'`. It's not used to
key the cell write (the new accept path writes to the array), but
keeping it consistent makes the response shape uniform — every
response has an output_column, and pack responses point at the same
visible row column the renderer surfaces.

## Naming conventions

- Packs: `<source>-pack` (lowercase, hyphenated). Examples:
  `linkedin-pack`, `candid-pack`, `propublica-npo-pack`,
  `sec-edgar-pack`. Pluralize the source only if the source itself is
  plural (`grant-platforms-pack` no; one platform = one pack).
- Bundles: `<verb>.<entity-type>` or just `<verb>` for the common case.
  Verb is the user-facing intent (`profile-builder`); entity-type uses
  the canonical taxonomy (`philanthropic-org`, `public-company`, etc.).
- MCP servers: same name as the pack, since one pack = one server.
- Microfrontends (remotes): same name as the pack, ported in the
  shell's roster.

## Per-app vs shared packs

For v1, packs and bundles live per-app inside augment-it. The chat's
verb-registration discipline is already per-app. Promotion to a shared
`@lossless/profile-packs` package happens when the second app
(memopop, dididecks) wants the same pack — *not before*. Don't
abstract before two real consumers exist.

The same applies to bundles: shared after the second user, not before.

## Source-selection discipline — why bundles aren't kitchen-sinks

A bundle should fan out across **4-6 default packs**. The discipline is
operational, not aesthetic:

1. Every fire costs an API call (or scrape). Defaulting 18 packs means
   18× the cost per row per bundle run.
2. Every response creates triage load. Eighteen responses per row in
   Response Reviewer is unreviewable.
3. Most rows don't need most sources. A bundle's default packs cover
   the high-yield sources for its entity type; the rest exist as
   opt-in for cases where the defaults didn't find what was needed.

How to choose the 4-6 defaults per bundle:
- Highest recall × lowest cost first
- Highest URL-shape verifiability first (Tier 1 sources outrank Tier 3)
- Diverse confirmation surface — don't pick four sources that all
  echo LinkedIn

Example: `profile-builder.philanthropic-org` defaults probably are
LinkedIn, X, Candid, ProPublica Nonprofit Explorer, IRS 990, Charity
Navigator (six). The other 14 Tier-2 sources are opt-in per dataset.

## Implementation order — the smallest end-to-end slice

Revised 2026-05-25 to reflect the design pivot to `socials` JSON column.
Status: Response Reviewer extension + common-six social packs have
landed; the `socials` write-back is next.

1. ✅ Response Reviewer structured-output extension (commit 288ecec).
2. ✅ Common-six social packs end-to-end (commit 38751d3) — produces
   pack responses with structured payloads. Accept currently writes to
   `profiles.<source>` columns; superseded by step 3.
3. **`row.socials.add` + `row.socials.remove` capabilities** (next) —
   row-store gains the pair; response-store's accept handler forks on
   `pack_id` and routes pack responses to `row.socials.add` instead of
   `row.update`. Cleanup script (`scrap-pack-artifacts.ts`) removes the
   in-progress `profiles.<source>` writes from the 2026-05-25 smoke run.
4. **Render `row.fields.socials` in Record Collector** — generic-
   renderer extension; ideally a chip-row showing one badge per
   pack_id with the URL on click. Helpful-links pattern is the model.
5. **Pre-flight dedup capability** — `profiles.dedup.scan` reads
   `row.fields.socials` + `row.fields.helpful_links` and pre-populates
   the bundle roster.
6. **`profile-builder.common` bundle** — first bundle abstraction
   wrapping the existing six packs with orchestration + dedup.
7. **Then iterate**: entity-typed bundles, two-pass orchestration with
   carry-forward.

## Triage Surface UX Requirements (emergent)

**Codified 2026-05-26 from the foundation-dataset smoke.** These are
pattern-level requirements the surfaces that *present* pack/bundle outputs
must honor. They surfaced by hitting them in the wild rather than from
upfront thinking — listed here so future implementations across the Lossless
family inherit the discipline without re-discovering the same walls.

### Authoring vs invocation are peers, not siblings

For any record set, the user has **two paths to enrichment**: author a custom
LLM prompt (free-form, expensive, exact), or invoke a pre-built pack/bundle
(source-bound, cheap, structured). These are *peer alternatives*, not sibling
tiles in a rotation. The UI must surface them as one binary choice — a tab
pair at the top of the authoring surface, **shared state across the pair so
both panels reflect the same active mode**. In augment-it this is the
prompt-template-manager ⇄ pack-runner pairing with the
`augment-it:enrichment-mode` window event + localStorage shared key.

Anti-pattern: making pack-runner a sibling tile in the peek-deck rotation.
The user has no semantic anchor for "where do I find the pack feature?"
without that pairing.

### Default to "ready to fire"

The invocation surface must land the user one click away from firing.
Concretely:

- Auto-restore the last-used record set from localStorage. Re-entry should
  never require re-picking what the user just looked at.
- If exactly one non-archived record set exists, auto-pick it. (Zero-click
  default for the common case of one active dataset.)
- Auto-restore the entity-name column choice (or pick a best-guess from a
  small candidate list — `name`, `organization`, etc.) so column-mapping is
  one less click.
- **Auto-select all rows on record-set load.** The user's natural intent on
  landing is "fire against this set." Narrowing happens later via filter or
  per-row deselect; the default state should never be "everything visible
  but Fire is disabled."
- Persist all of the above across reloads. Refresh should never undo a
  user's prior selection.

### Filter constrains effective scope

When the row picker has filter chips, **the fire button operates on
`selectedRowIds ∩ visibleRows`**, not on raw selection. Filter narrows what
fires; deselection refines within filter. Rows in `selectedRowIds` but
outside `visibleRows` are preserved (silently waiting for the filter to
surface them again) so swapping filters doesn't lose user state.

Bulk select-all / deselect-all buttons operate on the *visible* set, not
the universe. Their labels should say so ("all visible" / "deselect visible"
or equivalent).

### Filter chips for "last-run status"

The picker needs row-status chips that key off "what happened in the
*previous* enrichment run" — `has url` / `no url` / `needs-clarification` /
etc. Sub-pattern:

- **v1 heuristic** — inspect a known output column (e.g. `url` non-empty +
  not 'unknown'). Cheap, gets ~80% of the value, ships first.
- **v2 cemented** — read the `triage_states` field cemented at promote
  time per the Enhanced-Records-List spec. Authoritative once the
  cementation work lands.

Both versions are presented behind the same filter-chip API so the
implementation flip is a one-function change, no UI rework.

### Records, not cells, are the unit of intent

Fire-button copy and progress reporting must frame around **records**
(the user's domain unit), not cells (the engine's unit):

- ✅ "Fire on 67 rows" with a subline "6 packs × 67 rows · 402 fetches total"
- ❌ "Fire 402 cells (6 packs × 67 rows)"

The record is what the user thinks about; the cell count is internal
arithmetic.

### Triage must be per-record, not per-response

At pack scale, a single fan-out produces hundreds of responses (N rows ×
M packs). Stepping through them one-at-a-time is untenable past ~50.
The triage surface must offer a **per-record view** that groups all
responses for an entity into a single card with inline triage controls
per response. Per-record collapse is what makes the triage queue
workable at pack scale.

Concretely:

- One card per row, sorted by the entity's display name (alphabetical).
- Card header carries the entity name (resolved from
  `Prospect / Organization` / `name` / `organization` / etc. — a small
  candidate list with case-insensitive fallback).
- One mini-row per response inside the card, showing source badge +
  outcome badge + structured payload (confidence pill + URL + display
  name) + **inline `✓ / ✗ / ~ / → accept` buttons**.
- Whole-row tinting reflects current flag so visual scan reveals
  unfinished platforms without clicking through.

The single-response stepper view stays available as a peer view-mode
(for prompt responses where each row produces one verbose answer
worth reading in full); the user picks the mode that fits the
current work.

### Inline correction + human supply on the same surface

Source-returned URLs are wrong often enough that the triage surface
must let the human **edit URL and display name inline** without
leaving the card. Two distinct flows on one input:

- **Correction** — response already has a `structured` payload (the
  pack returned `found`); the user fixes the URL (e.g. Wikipedia
  disambiguation page → entity page). Edit autosaves on blur.
- **Human supply** — response has no `structured` payload (`not_found`
  / `error` / `pending` / `skipped`); the user types a URL they
  already knew. Backend mints a new Candidate with sensible defaults
  + flips outcome to `found`.

Visual distinction: solid input for correction-path; dashed-border
input with outcome-aware placeholder for human-supply-path. Both
save through the same single backend subject (`response.set_structured`
in augment-it) so the surface code stays uniform.

### Stale-companion-field discipline on edit

When the user edits one field of a structured payload, **adjacent
fields may go stale**. Specifically:

- URL changes → display_name was the Tavily-returned page title;
  it no longer describes the new page.
- URL changes → snippet was the Tavily-returned excerpt; it no
  longer describes the new page.
- display_name changes manually → no stale fanout (it's the
  display field).
- confidence changes manually → no stale fanout.

The backend should **auto-derive a sensible default** for stale
companion fields when they aren't explicitly set in the patch
(hostname-based display_name; cleared snippet). The user can
override via the inline editor if the derived default isn't right.

### Provenance markers preserve audit through human overrides

Every human override leaves a marker in `source_metadata` so future
tools can distinguish algorithmic from human-supplied data without
parsing edit history:

- `human_entered: true` — Candidate minted from a human-typed URL
  (no source returned anything).
- `url_human_edited: true` — Candidate's URL was corrected by a
  human (source returned a different URL).
- Original source data is **never overwritten** — `tavily_raw_url`
  and other source-specific metadata fields persist alongside the
  human values. Provenance is additive.

### Live-progress feedback on long-running fan-outs

A fan-out across hundreds of cells takes minutes. The invocation
surface must show **live progress per cell as responses land**, not
just a single "firing N rows…" placeholder. Subscribe to the
broadcast that response-store fires per cell-create; tally per
outcome (`found` / `not_found` / `error`); show a small progress
bar plus the running counters.

The Run entity (per [[Run-as-First-Class-Operation]]) is the
natural place these counters live — pre-aggregated, broadcast as
`run.updated`. Until the Run entity ships, the invocation surface
can tally locally by filtering `response.created` events by
`record_set_id`.

### Cross-pair state synchronization

When two related panels are visible side-by-side (the pair), state
that's meaningful to both must sync across them. Examples from
augment-it:

- Enrichment mode (`prompt` vs `pack`) — clicking "Pre-built Pack"
  in PTM should reflect in pack-runner's mode indicator and vice
  versa.
- Future: focused record-set selection — picking a set in one panel
  should propagate to the other so they target the same data.

Mechanism: shared `localStorage` key + `window` event combo. Both
panels read the localStorage value on mount + subscribe to the
event for live updates; either panel writes both when it changes.
Lightweight, transport-free, lossless across reloads.

### Federation-time debuggability

Module Federation across ports scrubs cross-origin runtime errors
to the browser's generic `Script error.` message. This makes
shell-level debugging useless. Two mitigations:

1. **Standalone-remote-port URLs** are the working debug path. Each
   remote runs on its own port (`:3005`, `:3009`, etc.); opening
   that URL directly renders the remote in isolation, same-origin,
   with full error stacks in DevTools. The host-surface error
   reveals nothing; the standalone surface reveals everything.
2. **CORS un-scrubbing** (worthwhile follow-up): set
   `crossorigin="anonymous"` on the federation script tags and add
   `Access-Control-Allow-Origin: *` to remoteEntry.js responses.
   Surfaces real errors in the host's console too.

The standalone-port fallback should be documented per-remote so
anyone debugging knows where to look.

### Svelte 5 effect-cycle discipline

`$effect` callbacks track **synchronous reads** during their
execution (including reads inside synchronously-invoked async
functions, up to the first `await`). A read of state X followed
by a write to X — even when the write is at the end of the async
function — re-fires the effect and creates an infinite loop
(`effect_update_depth_exceeded`).

Pattern to follow:

```ts
async function loadX() {
  // Sync portion — reads here register as effect deps.
  const someInput = readSomeReactiveInput();
  if (someInput.size === 0) return;

  // Async portion — reads/writes here are microtasks,
  // outside the effect's sync-tracking window.
  const fresh = await fetchSomething();
  reactiveOutputState = { ...reactiveOutputState, ...fresh };
}
```

Reads of state that the function will later write must happen
after the first `await`. The pattern is general: applies to any
$effect-invoked async function that does merge-then-assign.

## References

- [[Entity-Profile-Augmentation-Workflow]] — the exploration this
  blueprint forks from
- [[Response-Reviewer-and-Response-Store]] — the surface the
  structured-output extension lands in (status: Shipped)
- [[Original-and-Enhanced-Record-Instances]] — the record-instance
  model the verified responses get promoted into
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — the promote-to-
  canonical mechanic. With the 2026-05-25 pivot, promote no longer
  needs to fold `profiles.<source>` clusters; the row-level `socials`
  array rides through promote untouched like every other row field.
- [[In-App-Chat-v0-0-1-for-Augment-It]] — the chat surface that
  registers bundle verbs (McpCapability + SkillCapability adapter work
  is the v0.0.2 prerequisite for bundles to fire)
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the still-forward
  exploration this blueprint operationalizes
- [[Impose-Theme-Modes-System]] — the theme-token home for the
  confidence-pill color bands
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — top-level vision the
  pattern serves
