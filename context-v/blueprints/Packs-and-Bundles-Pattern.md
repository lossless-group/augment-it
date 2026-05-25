---
title: "Packs and Bundles — The Two-Tier Pattern for Entity-Profile Augmentation (and Beyond)"
lede: "When augment-it needs to fan out across many sources to find verified profiles for an entity (LinkedIn + X + BlueSky + YouTube for everyone, then Candid + ProPublica + IRS 990 + Charity Navigator for a nonprofit), the right abstraction is not a single capability and not a single big prompt. It is two tiers. A **pack** is the atomic unit — one source, one microfrontend, one MCP-server microservice, one prompt-snippet, one extraction-schema, one render-config. A **bundle** is the orchestration unit — a named composition of packs with single-pass or two-pass execution, data carry-forward between passes, agent-driven pre-flight dedup against existing `helpful_links`, and a single chat verb that fires the whole thing. This blueprint codifies both."
date_created: 2026-05-25
date_modified: 2026-05-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
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
land in response-store unchanged and ride through the promote-to-
canonical flow into the row's `profiles.<source>` cluster.

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
2. Reads any existing `profiles.<source>` clusters from prior runs.
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

For Spec-Kit when ready:

1. **One pack** — `linkedin-pack` is the natural first. Tier 1, known
   URL shape, most-needed across entity types, exposes the search-
   then-confirm scraping shape that other Tier-1 social packs will
   reuse.
2. **One bundle** — `profile-builder.common` with just two packs
   (LinkedIn + X) to prove the bundle orchestration end-to-end
   without the full common-five.
3. **Response Reviewer structured-output extension** — sibling-
   payload, confidence pill, outcome enum rendering.
4. **Pre-flight dedup capability** — `profiles.dedup.scan`.
5. **Then iterate**: add packs to the roster, add entity-typed
   bundles, add two-pass orchestration.

## References

- [[Entity-Profile-Augmentation-Workflow]] — the exploration this
  blueprint forks from
- [[Response-Reviewer-and-Response-Store]] — the surface the
  structured-output extension lands in (status: Shipped)
- [[Original-and-Enhanced-Record-Instances]] — the record-instance
  model the verified responses get promoted into
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — the promote-to-
  canonical mechanic that writes verified profiles into the row's
  `profiles.<source>` cluster
- [[In-App-Chat-v0-0-1-for-Augment-It]] — the chat surface that
  registers bundle verbs (McpCapability + SkillCapability adapter work
  is the v0.0.2 prerequisite for bundles to fire)
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the still-forward
  exploration this blueprint operationalizes
- [[Impose-Theme-Modes-System]] — the theme-token home for the
  confidence-pill color bands
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — top-level vision the
  pattern serves
