---
title: "Common-Six Social Packs — First Real Packs on the Structured-Output Surface"
lede: "Six pack identities (linkedin, x, bluesky, youtube, facebook, wikipedia) registered against one consolidated backend service that routes by pack_id, with Tavily as the underlying search and URL-shape verification driving the confidence score. No new microfrontend per pack — Response Reviewer's generic candidate card already renders every pack response. A small new Pack Runner remote provides the per-row × per-pack fan-out affordance so the foundation dataset can be augmented and reviewed today, before the bundle abstraction lands in a later session."
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
  - Social-Packs
  - MCP-Servers
  - Tavily
  - Pack-Runner
  - Confidence-Verification
status: Draft
---

# Common-Six Social Packs

## The work

The structured-output surface from
[[Response-Reviewer-Structured-Output-Extension]] shipped. Now we land
the first real packs on it — the common-five social platforms plus
Wikipedia (high signal for foundations and their founders, which matches
the user's current dataset). The deliverable is end-to-end enough to run
against the foundation pipeline this week: select rows, fire packs, see
results land in Response Reviewer with confidence pills and triage.

Bundles come in a later session. Multi-pass orchestration comes after
that. This session is direct pack invocation only.

## Why "common-six" not "common-five"

Adding **Wikipedia** because for the foundation dataset specifically,
Wikipedia returns high-signal verified pages for the medium and large
foundations and their founders. It also doubles as an HNWI source when
the row is an individual. Free, easy to query, no auth.

GitHub considered and dropped — foundations rarely have GitHub orgs;
the cost of including it (extra response card per row) outweighs the
yield. Add later if a non-foundation dataset wants it.

## What's in scope

### 1. One backend service — `services/social-search/`

A Node/Fastify service (same shape as `services/prompt-runner/`) that
exposes one capability: `pack.search`. Internal routing by `pack_id`.
Six pack identities — `linkedin-pack`, `x-pack`, `bluesky-pack`,
`youtube-pack`, `facebook-pack`, `wikipedia-pack` — share the service.

Per [[Packs-and-Bundles-Pattern]]'s "one pack per source OR small
cluster" clause: this is the small-cluster shape. Each pack identity
stays distinct in the response-store (every `ResponseRecord` carries
its own `pack_id`); the deployment unit is shared.

#### Per-pack registration (in source)

For each pack identity, the service holds a small config:

```typescript
type PackConfig = {
  pack_id: string;                  // e.g., 'linkedin-pack'
  display_name: string;             // 'LinkedIn'
  domain_whitelist: RegExp;         // verification regex
  tavily_query_template: string;    // pack-specific search refinement
  tavily_include_domains?: string[]; // restrict the search to these
};
```

Six configs hard-coded for v1. Later sessions can move them to a
config file or database.

#### `pack.search` shape

Input:
```typescript
{
  pack_id: string;
  entity_name: string;
  row_id: string;
  record_set_id: string;
  prompt_id?: string;       // optional — for response-store correlation
}
```

Output (creates a `ResponseRecord` via response-store NATS event):
```typescript
{
  response_id: string;
  outcome: 'found' | 'not_found' | 'error';
}
```

The new ResponseRecord carries `pack_id`, `outcome`, `structured`,
`response_text` (the snippet or the error message), and (for now)
`bundle_id: null`, `pass: null` since bundles aren't here yet.

### 2. Confidence scoring

A scoring function per source. The baseline:

- **Tier-1 URL-shape match** (URL is on the pack's whitelist domain
  with the expected path pattern) → +60 points
- **Display-name exact-match against entity_name** (case-insensitive,
  whitespace-normalized) → +30
- **Display-name fuzzy-match** (substring or token-overlap) → +15
- **Recent activity indicator** (when Tavily returns published_date
  within last 12 months) → +10
- **Multiple distinct candidates from same domain** → cap at 60 (we
  picked one, but ambiguity reduces certainty)

Clamp to 0-100. Bands map to the pills already shipped (low/med/high).
The scoring discipline lives in `services/social-search/src/scoring.ts`
so it's testable in isolation.

### 3. Tavily as the search substrate

Add `TAVILY_API_KEY` to `.env.example`. The service reads it on boot.

For each pack, build a Tavily query like:
- LinkedIn: `"{entity_name}" site:linkedin.com/in OR site:linkedin.com/company`
- X: `"{entity_name}" site:x.com OR site:twitter.com`
- BlueSky: `"{entity_name}" site:bsky.app`
- YouTube: `"{entity_name}" site:youtube.com/@ OR site:youtube.com/channel`
- Facebook: `"{entity_name}" site:facebook.com`
- Wikipedia: `"{entity_name}" site:en.wikipedia.org`

Use Tavily's `search` endpoint with `include_raw_content: false`,
`max_results: 3`. The top result becomes the candidate; the others
inform the confidence score (multiple distinct candidates from the
same domain reduces certainty).

If Tavily returns zero results: `outcome: 'not_found'`. If Tavily errors
(timeout, rate-limit, key invalid): `outcome: 'error'` with the error
message in `response_text`.

### 4. Workspace capability — `pack.fan_out`

A new capability for firing N packs against M rows. Lives in the
`workspace-service` (per the existing handler discipline). Implementation:

```typescript
async function fanOut(args: {
  pack_ids: string[];     // which packs to fire
  row_ids: string[];      // against which rows
  record_set_id: string;
}): Promise<{ jobs_started: number }>
```

Internally: emits one `pack.search` NATS message per (pack, row)
combination. The social-search-service is the consumer. Per-row × per-pack
concurrency is bounded (the existing prompt-runner pattern caps at 4
concurrent fires; same here).

This is the primitive bundles will eventually wrap. For v1 the user
invokes it directly from the Pack Runner UI.

### 5. Pack Runner — small new federated remote

`apps/pack-runner/` — a single Svelte component, rsbuild config matching
the other remotes, port 3009 (next free port after the existing
:3005–:3008). Federation-mounted in the shell with the existing remotes.

What it renders:
- A record-set picker (reads from `record_set.list`)
- A row selector (multi-select; "all rows in the set" + per-row
  checkboxes)
- A pack picker (six checkboxes — all checked by default)
- A "Fire packs against selected rows" button
- A small in-flight indicator using the existing `job.event` stream

When the user fires: invoke `pack.fan_out({ pack_ids, row_ids,
record_set_id })`. Responses land in Response Reviewer as they arrive.
The Pack Runner UI itself does not render results — it's a control
surface only; results go through the existing triage path.

### 6. URL-shape verification

A small module — `services/social-search/src/verification.ts` — that:
- For each pack, compiles the domain whitelist into a regex
- For a Tavily result URL: returns `tier_1_match` boolean + optional
  `normalized_url` (e.g., strip query strings, trailing slashes)
- Used by the scoring function for the +60 contribution

## What's explicitly out of scope

- Bundles. The `pack.fan_out` capability is the bundle-shaped primitive,
  but no bundle abstraction (no entity-type roster, no two-pass, no
  data carry-forward, no default vs opt-in source-selection). Pack
  Runner is a flat per-pack fire-all UI for v1.
- Two-pass orchestration. Future session.
- `profiles.dedup.scan` against existing helpful_links. Will be added
  to `pack.fan_out` as a pre-flight in the bundle session — for now,
  if a LinkedIn URL is already in `helpful_links`, the pack fires anyway
  (duplicates surfaced for the user to triage).
- Per-pack microfrontends. Response Reviewer's generic candidate card
  renders every pack response correctly. Per-pack UI only if a real
  pack has a source-specific need that the generic card can't express.
- Tier-2 vertical sources (Candid, ProPublica-NPO, IRS-990, etc.).
  Their own session; they need real APIs not Tavily.
- Promote-to-canonical write-back of the verified results into a
  `profiles.<source>` column cluster on the row. Extension of the
  existing promote handler — separate session.
- Real LinkedIn / X API integration (LinkedIn has no public search API;
  X's is paid-tier). Tavily + URL-shape is our v1 verification path.

## Constraints

- **Node/TypeScript** for the new service (match existing `services/`
  shape — Fastify, NATS, tsx watch)
- **Svelte 5** with `$state` runes for Pack Runner
- **No new external dependencies** beyond Tavily SDK / fetch. No
  search-result-ranking libraries, no fuzzy-string libs — implement
  fuzzy-match inline (token-overlap is enough for v1)
- **Theme tokens** for any Pack Runner UI color — no hex
- **Per-pack rate-limit** at the service level (Tavily's free tier is
  rate-bounded). Bound concurrent Tavily calls to 4 total across all
  packs.
- **All response-store writes** go through the existing response-store
  service (NATS-mediated). The social-search-service does not write
  to response-store's JSON file directly.
- **Provenance discipline** — every response carries `pack_id`,
  retrieval timestamp (`created_at` already does this), and the original
  Tavily URL in `structured.source_metadata.tavily_raw_url`

## What "done" looks like

End-to-end smoke against the real foundation dataset:

1. Boot the new social-search service alongside the existing ones
2. Pick one of the user's existing record sets in Pack Runner
3. Select all six packs, select 3-5 rows (foundations the user knows
   well)
4. Fire packs
5. In Response Reviewer: 18-30 new response records appear (6 packs ×
   3-5 rows). Each has its pack_id badge, its outcome, and for `found`
   outcomes a candidate card with the confidence pill and URL
6. Confidence pills span the bands realistically — Wikipedia for well-
   known foundations should be green-high, X/BlueSky for niche
   foundations should be lower or `not_found`
7. Triage a few. They flow through the existing good/partial/wrong path
8. Theme toggle works as before (the new Pack Runner UI plus all card
   rendering across all three modes)

If smoke is good, the foundation pipeline is augmentable end-to-end
this week.

## Suggested implementation order

1. **`services/social-search/` skeleton** — package.json, Fastify, NATS
   wiring, the six PackConfigs, env-var loading
2. **Tavily client + per-pack query construction** — one source at a
   time, smoke each before moving on (LinkedIn first since it's the
   most-used)
3. **Verification + scoring** — `verification.ts` + `scoring.ts` as
   pure functions, unit-testable
4. **`pack.search` handler** — wires Tavily, verification, scoring,
   response-store creation
5. **`pack.fan_out` capability in workspace-service** — emits N
   pack.search messages
6. **`apps/pack-runner/` skeleton** — package.json, rsbuild config,
   federation entry, single Svelte component
7. **Pack Runner UI** — pickers, fire button, in-flight indicator
8. **Shell roster** — add pack-runner remote to the shell's federation
   config
9. **Smoke walk** — the eight-step walkthrough above

## Open calls the implementer makes

- Whether to bundle the six PackConfigs into one file or split per-pack
  files in `services/social-search/src/packs/` (six tiny files vs one
  with six exports). Pick whichever feels less ceremonial.
- The exact `data-tip` / aria-label strings on Pack Runner controls —
  match the prose tone of the other remotes (Request Reviewer, Response
  Reviewer)
- Whether Pack Runner's row picker also surfaces a "fields preview" so
  the user can sanity-check `entity_name` resolution before firing. Add
  if cheap, skip if it pulls in significant UI work
- Whether the in-flight indicator shows per-(pack × row) progress or
  just aggregate "N of M complete." Aggregate is fine for v1; per-cell
  if the existing prompt-runner pattern makes it easy
- How LinkedIn's URL pattern handles `/company/` vs `/in/` — both are
  valid. Either accept both (one pack covers companies AND individuals)
  or split into linkedin-company-pack + linkedin-person-pack. v1
  recommendation: accept both, single pack — split if the confidence
  scoring gets noisy

## After this session lands

- Update changelog
- If anything in the blueprint turned out wrong during implementation,
  edit the blueprint first, then re-implement
- Next session: `profiles.dedup.scan` pre-flight + the bundle
  abstraction (`profile-builder.common` wrapping these six packs) +
  promote-to-canonical write-back to `profiles.*` row columns

## Related

- [[Response-Reviewer-Structured-Output-Extension]] — the surface this
  session's packs land on (status: ready to smoke)
- [[Packs-and-Bundles-Pattern]] — the blueprint
- [[Entity-Profile-Augmentation-Workflow]] — the exploration
- [[Original-and-Enhanced-Record-Instances]] — the record-instance model
  the verified results will eventually promote into
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — promote-to-
  canonical mechanic (extension for `profiles.*` is a later session)
