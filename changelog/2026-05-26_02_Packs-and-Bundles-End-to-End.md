---
title: "Packs and Bundles, end-to-end — the extension pattern goes from exploration to a live microfrontend + microservice + triage cockpit in two days"
lede: "Ten commits between 2026-05-25 17:08 and 2026-05-26 02:53 carry augment-it through a complete arc: a tidy-and-status-sweep across the existing context-v tree, a new exploration (Entity-Profile-Augmentation-Workflow) that surfaced a two-tier abstraction, a forked blueprint (Packs-and-Bundles-Pattern) that locked the contracts, a new shared package (@augment-it/shared-ui with the first reusable component — ConfidencePill), a structured-output extension to the response-store schema, a new federated remote (pack-runner at :3009), a new backend microservice (social-search) with six (then seven) packs and Tavily as the v1 connector, a row-store write-back surface (row.fields.socials), a paired-authoring shell rewire that took pack-runner out of the rotation and made it a peer to prompt-template-manager, a complete by-record triage view in response-reviewer (:3005) with inline URL / display_name / entity-name editing, two design pivots that got documented honestly (the profiles.<source> column scrap, the Run-entity plan deferred to its own arc), and emergent-requirements promoted into the blueprint as a §Triage Surface UX Requirements section for the rest of the Lossless family. The system that exists at the end of these two days is recognizably the same shape as the system at the start and recognizably a different product."
publish: true
date_created: 2026-05-26
date_modified: 2026-05-26
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Packs-And-Bundles
  - Federation
  - Microservice
  - Structured-Output
  - Response-Reviewer
  - Pack-Runner
  - Social-Search
  - Tavily
  - Triage-Cockpit
  - Blueprint-To-Build
  - Two-Day-Arc
files_changed:
  - context-v/explorations/Entity-Profile-Augmentation-Workflow.md
  - context-v/blueprints/Packs-and-Bundles-Pattern.md
  - context-v/plans/Run-as-First-Class-Operation.md
  - context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md
  - context-v/prompts/Response-Reviewer-Structured-Output-Extension.md
  - context-v/prompts/Common-Six-Social-Packs.md
  - apps/response-reviewer/src/App.svelte
  - apps/response-reviewer/src/app.css
  - apps/response-reviewer/src/fixtures/mock-packs.ts
  - apps/pack-runner/src/App.svelte
  - apps/pack-runner/src/index.ts
  - apps/pack-runner/src/mount.ts
  - apps/pack-runner/rsbuild.config.ts
  - apps/prompt-template-manager/src/App.svelte
  - apps/record-collector/src/App.svelte
  - shell/src/App.svelte
  - shell/src/remotes.ts
  - shell/rsbuild.config.ts
  - services/social-search/src/packs.ts
  - services/social-search/src/tavily.ts
  - services/social-search/src/verification.ts
  - services/social-search/src/scoring.ts
  - services/social-search/src/search.ts
  - services/social-search/src/server.ts
  - services/social-search/scripts/scrap-pack-artifacts.ts
  - services/response-store/src/store.ts
  - services/response-store/src/handlers.ts
  - services/row-store/src/store.ts
  - services/workspace/src/capabilities.ts
  - packages/workspace/src/types.ts
  - packages/theme/theme.css
  - packages/shared-ui/src/ConfidencePill.svelte
  - docker-compose.yml
  - scripts/dev.sh
  - .env.example
---

## Why care?

Before this arc, augment-it could do exactly one thing per row: send a free-form custom prompt to an LLM and store the prose answer in a single column the user picked at fire time. That's a useful tool. It is not yet a product. To become a product it needs **other ways to enrich a row** — particularly source-bound lookups (LinkedIn, X, Bluesky, YouTube, Facebook, Wikipedia, then Instagram, then philanthropy databases, then SEC, then Crunchbase, then whatever the next vertical demands) that don't make sense as freeform prompts because they have a verified shape (profile URL + display name + confidence + source metadata) and a verified provenance (a connector hit, with a re-runnable query).

Two days ago there was no abstraction in the codebase for "source-bound enrichment that returns a verified profile." The exploration that opened these two days argued there should be one, with a clear two-tier shape: **packs** as the atomic unit (one source, one microfrontend, one microservice, one prompt-snippet, one extraction schema, one render config) and **bundles** as the workflow composition (a named roster of packs with orchestration, carry-forward, and a single chat verb that fires the whole thing). The blueprint forked from the exploration locked the contracts; everything that followed was implementation. At the end of these two days **the abstraction is real on disk** — there's a shared-ui package with a ConfidencePill, a structured-output extension to the response schema, a federated remote at :3009 (Pack Runner) that pairs in the shell with Prompt Template Manager, a backend microservice (social-search) that fans out across six (now seven) packs with Tavily as the v1 connector, a row-store write-back surface (row.fields.socials), and a complete by-record triage cockpit in Response Reviewer where the researcher corrects URLs, supplies missing ones, edits display names, and cleans up entity names without leaving the surface.

This matters because the same shape will carry the next several quarters of work. Every vertical augment-it picks up — philanthropy DaaS (18 sources mapped in the exploration), SEC filings, Crunchbase, the rest — will land as packs and bundles on the same surface, riding the same store extensions, hitting the same triage cockpit. The blueprint codifies the contracts so the next pack the next person writes doesn't reinvent any of them.

## What's new — the ten-commit arc

In rough order:

### `a09efae` (5/25 17:08) — status sweep and the new exploration

Reconciled the context-v tree with the shipped reality of the 2026-05-21..23 build runs: eleven docs moved Draft/Proposed/Active → Shipped with date_completed pulled from each doc's matching changelog ship date. Twelve prior-art explorations archived (seven Bolt-*, three Tanuj-*, Federation-and-Bundler-Decision, Augment-It-Prior-Art-Survey) — frozen reference, not forward-pointing journey docs. New `date_archived` property added to each.

The new exploration — `context-v/explorations/Entity-Profile-Augmentation-Workflow.md` — captured the next workflow: verified-profile lookup across the common-five social platforms plus entity-type-specific vertical sources. The doc converged on the two-tier abstraction (packs + bundles) that the blueprint later forked from. Verification rides the existing Response Reviewer surface with a structured-output extension. Six of seven open questions resolved inline by the user.

### `2df57b3` (5/25 17:26) — Tier-2 philanthropy reconstructed

Reconstructed the missing philanthropy DaaS list since the row-store backups only contained the foundation entities being enriched, not the providers used to find them. Folded in the user's original three (Grantable, ProPublica Nonprofit Explorer, plus Candid / IRS-990 / FoundationDirectory / GrantStation) and reconstructed the rest from public-knowledge candidates. Tier-2 philanthropy ends at 18 sources, sub-divided into five groups (funder/990-derived, grant-search, ratings + watchdog, editorial / discovery, HNWI-overlap). The 18-source count surfaced a downstream design need: **per-bundle source-selection discipline** since 18 is more than any single bundle should fan out across by default. Q7 closed; the exploration is at the shape it needs to fork.

### `9adc786` (5/25 17:36) — Packs-and-Bundles-Pattern blueprint forked

The blueprint that will outlive this product if it survives extraction. Locks four pack sub-contracts (prompt-snippet template with carry-forward slots, typed MCP-or-HTTP server interface with mandatory provenance, baseline extraction schema with source-specific extras in source_metadata, declarative render config) and five bundle sub-contracts (pack roster with default-true flag, orchestration plan with carry-forward contract and checkpoint behavior, chat-verb registration, pre-flight dedup hook, bundle-level aggregate render strategy).

Pins several design decisions out of the exploration:

- **Response shape:** sibling-payload — prose AND structured Candidate live in the same response record, plus an optional `archival_markdown` for the deeper page-content case.
- **Confidence:** 0–100 numeric on the wire, pill rendered with three color bands (0–39 / 40–69 / 70–100) mapped to theme tokens.
- **Outcome enum:** `found | not_found | error | skipped | pending` — five values, no boolean, no string-and-pray.
- **Source-selection:** bundles default to 4–6 packs, not 18; rationale is operational (cost, triage load, source diversity).
- **Extraction discipline:** per-app v1, promote to a shared `@lossless/profile-packs` only after a second consumer exists.

Implementation order proposed: linkedin-pack first (Tier 1, natural shape, the search-then-confirm scraper other Tier-1 packs will reuse), then `profile-builder.common` with just LinkedIn + X to prove bundle orchestration end-to-end, then Response Reviewer structured-output extension, then `profiles.dedup.scan`, then iterate.

### `288ecec` (5/25 18:39) — structured-output extension, the renderer foundation

The schema and renderer foundation. No packs yet. The deliverable is what the next session lands on.

- **Schema additivity.** `services/response-store/src/store.ts` and `packages/workspace/src/types.ts` gain `Outcome`, `Candidate`, and six new ResponseRecord fields: `outcome`, `structured`, `archival_markdown`, `pack_id`, `bundle_id`, `pass`. The load-time backfill that already existed for `edited_text` / `edited_at` extends to coerce older records — outcome defaults to `'found'` when response_text is non-empty, `'pending'` otherwise; the four other new fields default to null. No data migration. `createResponse()` accepts the new optional pack fields so the existing prompt-runner continues to fire unchanged.
- **Theme tokens + ConfidencePill.** `packages/theme/theme.css` gains a Tier-1 amber family (deep/bright/wash/ink/neon/void) to complete the green/red/amber set, plus three Tier-2 tokens `--color-confidence-low/med/high` defined in all three modes (dark → *-bright, light → *-ink, vibrant → *-neon). The new `@augment-it/shared-ui` package gets bootstrapped (was empty README) with `ConfidencePill.svelte` — Svelte 5 with `$props` runes, clamps 0–100, derives a band, mixes its background via `color-mix(token, transparent)` so the same token drives both ink and tint.
- **Renderer extension in response-reviewer.** The `App.svelte` branches on outcome — `found` renders the candidate card (confidence pill, URL, display name, source badge, collapsible snippet) above the existing prose; `not_found` / `error` / `skipped` / `pending` render distinct thin-row treatments in place of the editor. Legacy free-form responses with no structured payload render exactly as today — backward compatible.
- **A fixture path.** `apps/response-reviewer/src/fixtures/mock-packs.ts` — seven synthetic responses covering all five outcomes and all three confidence bands, activated via `?fixture=mock-packs`. Prepended to the in-memory responses array, never persisted. Made the renderer testable before the real packs landed.

### `38751d3` (5/25 18:55) — common-six packs land, new backend service ships

The first real packs ride on the renderer extension. **A whole new microservice arrives in the stack** — `services/social-search/` — alongside the first new federated remote in days — `apps/pack-runner/` at port 3009.

- **`services/social-search/` — stateless TS/NATS service.** `packs.ts` holds six PackConfigs (domain-whitelist regex + Tavily query template + include-domains list); `tavily.ts` is the REST client (POST /search, max_results: 3); `verification.ts` checks URL hostnames against the per-pack whitelist and normalizes URLs (strip query + trailing slash); `scoring.ts` is pure-function with documented weights — Tier-1 URL-shape +60, name exact-match +30, fuzzy-token-overlap +15 at 0.5 ratio threshold, recency-within-12mo +10, multi-domain ambiguity caps at 60, final clamp 0–100. `search.ts` orchestrates one cell (resolve entity_name, call Tavily, pick the top whitelist-matching result, score it, publish `response.create.requested` with the full pack-aware schema). `server.ts` subscribes to `pack.search.requested` (one cell) and `pack.fan_out.requested` (M rows × N packs); fan-out runs cells concurrency-bounded (default 4, configurable via `SOCIAL_SEARCH_CONCURRENCY`). Per-cell failures don't abort the run — they log and continue.
- **Six packs registered.** linkedin-pack, x-pack, bluesky-pack, youtube-pack, facebook-pack, wikipedia-pack — five "common" + Wikipedia, added because the user's foundation dataset has high signal there. The deployment unit is shared per the blueprint's "one pack per source OR small cluster" clause; no separate microservice per pack at this scale.
- **`apps/pack-runner/` — new federated remote at :3009.** Single Svelte 5 component, same shape as the other remotes (`mount.ts` for federation, `index.ts` standalone, `app.css` with `.pr-app` namespace, theme tokens only). Four numbered cards walk the user: pick a record set, pick the entity-name column (auto-defaults to name/organization/org/company/foundation/entity), multi-select rows with all/none chips, six pack checkboxes (all default-on). Fire button shows N cells (P packs × R rows) and disables when nothing's selectable. Result line points back to Response Reviewer. **No results render in pack-runner — it's a control surface only;** every response flows through response-store and the existing triage path.
- **Workspace router + stack-up wiring.** `services/workspace/src/capabilities.ts` adds `pack.search` → `pack.search.requested` and `pack.fan_out` → `pack.fan_out.requested` with a 600s timeout. `shell/rsbuild.config.ts` adds `packRunner@http://localhost:3009/...`; `shell/src/remotes.ts` gains the roster entry. `docker-compose.yml` adds the social-search service (depends_on: nats; reads TAVILY_API_KEY from .env). `scripts/dev.sh` prints :3009 alongside other remote URLs. `.env.example` documents the new key. **Stack-up compatibility:** social-search starts unconditionally and warns at boot if the key is missing; pack.search and pack.fan_out handlers reply with a clean error rather than crashing — different discipline from prompt-runner (which fast-exits without ANTHROPIC_API_KEY) because pack search is opt-in and we don't want one missing key to break the whole stack-up flow.

### `18dbf94` (5/25 20:13) — design pivot, two scraps, one new plan

The 2026-05-25 foundation-dataset smoke produced **576 unwanted pack responses across 96 rows × 6 packs**, none of which fit the design we actually want. Rather than band-aid the output, this commit honestly redirected the design and wrote down the next plan.

- **Socials column pivot.** The blueprint's "promote-to-canonical write-back into a `profiles.<source>` cluster" turned out wrong in two ways: it spawned six per-pack columns on the row table (Record Collector's generic renderer pushed real data off-screen) and it violated the dynamic-schema discipline that CSV-derived columns are the only system-introduced row columns. **Pivot:** one row-level column `socials` containing `SocialProfile[]`, mirroring helpful_links shape-for-shape, replace-by-pack_id semantics (one row has one LinkedIn). Blueprint bumped 0.0.0.1 → 0.0.0.2 with a new `§Row write-back` section. Exploration bumped to 0.0.0.5 with a matching revisions entry. `services/social-search/src/search.ts` flipped `output_column` to `'socials'`.
- **Cleanup script.** `services/social-search/scripts/scrap-pack-artifacts.ts` — idempotent, `--dry-run` flag, backs both files up to `.backups/` with a timestamped suffix before mutating. Ran live against the foundation-dataset volumes: 576 pack responses removed, 96 prompt responses kept, 0 row writes to revert (the 83 accepted responses had gone into `row.fields.url` via the prompt path, never into `profiles.*`).
- **Run-as-First-Class-Operation plan.** A new plan at `context-v/plans/Run-as-First-Class-Operation.md` covering six parts: pair Pack Runner ⇄ Prompt Template Manager in co-existence mode (they are the two ways to enrich a record set — custom LLM prompt vs source-bound pack — so they belong in one viewport); lift Run from a string id buried on each ResponseRecord into a first-class entity with type-discriminated fields (`prompt | pack | bundle`), scope at kickoff, started_at / ended_at, maintained counters (cells_total, cells_complete, found_count, not_found_count, error_count); render a Run-context bar at the top of Response Reviewer plus a run-scope filter chip tier; subscribe Pack Runner to `run.updated` broadcasts so the live tally ticks; load-time backfill of existing 96 responses into synthetic Runs grouped by their current run_id.
- **Clarification gate promoted into plan scope.** Initially framed as a deferred limitation but bumped to Part 5 of the plan after the user named the cost-scaling math: 6 packs × 1000 rows × 3 re-runs = 18,000 Tavily calls + 18,000 low-confidence response cards. New reserved key on `Row.fields`: `needs_clarification: null | { reason, flagged_at, flagged_by }`. **Distinct from `archived`:** needs_clarification rows ARE carried through every promotion (the entity is real) but operations SKIP them (parked, not removed; enrichment columns stay empty in the canonical CSV so the client immediately sees them as conscious gaps).

### `12546ba` (5/25 23:47) — row-grouped triage, paired authoring, write-back live

The first iteration where the pack-and-bundle pattern reaches end-to-end ergonomics. **Every layer of the stack moves.** Seven coherent threads landed:

1. **Row write-back to `socials`.** `services/row-store/src/store.ts` gains `addSocial(params)` + `removeSocial(row_id, socials_id)` with replace-by-pack_id semantics. The reserved-key list on `Row.fields` grows to five (record_uuid, helpful_links, archived, triage_states, socials). NATS handlers `row.socials.add.requested` + `row.socials.remove.requested` mirror the helpful_links pair shape. `@augment-it/workspace` exports a new `SocialProfile` type.
2. **Accept handler forks on `pack_id`.** `services/response-store/src/handlers.ts`'s `response.accept.requested` handler now forks: if the accepted response has `pack_id !== null` and `structured !== null`, the handler issues `row.socials.add.requested` instead of `row.update.requested`. Pack acceptance writes to `row.fields.socials[]`; legacy prompt acceptance keeps its single-column write.
3. **Shell rewired — pack-runner out of the rotation.** `shell/src/remotes.ts` removes packRunner from REMOTES (the peek-deck rotation) and adds it to a new `PACK_RUNNER_REMOTE` constant, following the `CHAT_REMOTE` precedent. A new private `EXTRA_REMOTES` aggregates both pair-only remotes; `remoteById()` falls back through it so PAIRINGS lookups still resolve. The `augment-it:navigate` handler in `shell/src/App.svelte` falls back to opening a PAIRING when the target remoteId is not in the rotation — **the load-bearing change** that makes pair-only remotes reachable from siblings via the navigate event.
4. **Paired authoring modes — prompt-template-manager ⇄ pack-runner.** Both remotes gain a "Custom Prompt / Pre-built Pack" pill tab pair at the top. Shared selection via the `augment-it:enrichment-mode` window event + localStorage so clicking "Pre-built Pack →" in PTM toggles the active state in BOTH panels in co-existence mode. Click dispatches `augment-it:navigate` to the other remote; the shell catches it, finds the packRunner+promptTemplateManager pairing, opens the pair at 50/50.
5. **Pack-runner UX overhaul.** Persists last record set + entity-name column to localStorage; if there's exactly one non-archived record set, auto-selects it (zero-click default). Auto-selects all rows on record-set load. Fire button operates on `effectiveSelection (selectedRowIds ∩ visibleRows)` so filter naturally constrains what fires; button copy reads `Fire on N rows` with subline `P packs × N rows · N×P fetches total`. New row-filter chip tier — all / has url / no url — with per-chip counts and per-row ✓/○ status badges using the existing confidence theme tokens.
6. **Record-collector renders socials.** Adds a socials chip row above the CSV fields grid when `row.fields.socials` is non-empty. Each chip shows pack name + a small color-banded confidence pill; clicking opens the URL in a new tab.
7. **Response-reviewer by-record view — the killer ergonomic improvement.** A new view-mode tab pair at the top — "By Response" (original single-card stepper) vs "By Record" — persisted to localStorage. By-record groups all filtered responses by row_id, resolves each row's entity name via a `NAME_COLUMNS` heuristic (Prospect / Organization / name / organization / org / company / foundation / entity), sorts alphabetically, renders one card per organization with a row per response inside. Each response row shows source badge, outcome badge for non-`found`, confidence pill + URL + display_name for structured pack responses, prose for prompt responses, and inline good / wrong / partial / accept buttons. Whole-row tint reflects current flag.

### `4a94f77` (5/26 00:50) — inline URL editing in by-record view

Two new flows ride the same `response.set_structured` subject:

- **Correction path** — for pack responses that returned `found` but with the wrong URL (Wikipedia disambiguation pages, deep-linked posts instead of canonical profile URLs). The user clicks into the editable URL input next to the confidence pill, types the right URL, the patch saves on blur. The structured Candidate's other fields (display_name, confidence, snippet, source_metadata) are preserved; only the field(s) in the patch mutate. `edited_at` bumps; `source_metadata` still carries `tavily_raw_url` so the human override is distinguishable from the algorithmic result.
- **Human-supply path** — for pack responses that came back `not_found` / `error` / `pending` / `skipped` with no structured payload. Previously those rows had nothing to click; now they render a dashed-border empty input with an outcome-aware placeholder ("no result — type a URL to supply one"). On save, the backend mints a new Candidate (`confidence: 100` for human-verified, display_name derived from URL hostname, `source_metadata.human_entered: true`) AND flips the outcome to `found`.

**Plus a real Svelte 5 effect-cycle fix:** the by-record load-rows `$effect` was infinite-looping because `loadRowsForByRecord` synchronously read `rowsByRowId` (via the spread initializer) AND wrote it at the end. Sync reads inside the effect's callback (including inside a synchronously-invoked async function up to the first `await`) register as dependencies; writes invalidate them; effect re-fires. The fix is mechanical: move the spread + assign past the first `await` so they execute as microtasks outside the effect's sync-tracking window. The bug surfaced via rsbuild's runtime-error overlay on the **standalone-remote-port** (`:3005`) — Module Federation across ports scrubs cross-origin runtime errors to `'Script error.'` in the shell console; the actual stack lives on the standalone port. **This federation-time debuggability lesson got promoted into the blueprint** as one of the §Triage Surface UX Requirements.

### `21a520a` (5/26 01:32) — stale-companion-field discipline + display_name editing + emergent-requirements capture

Three coherent changes plus two context-v sections that document the work:

- **Stale-companion-field discipline in the store.** `services/response-store/src/store.ts`'s `setResponseStructured` now detects "URL changed but display_name + snippet weren't also set in the same patch" and auto-derives sensible defaults: display_name → new URL hostname (stripped of www.), snippet → cleared (it described the old page), `source_metadata.url_human_edited: true` marker fires. Original Tavily fields (`tavily_raw_url`, etc.) are preserved additively. Surfaced by the foundation-dataset smoke: user changed `bsky.app/profile/<wrong>` to `bsky.app/profile/bridgespan` and the display_name still read "Post by @womenmovingmillions — Bluesky," obviously wrong. The UI doesn't have to remember to clear; the store enforces the invariant.
- **Inline display_name editing.** Borderless-by-default input alongside the URL, same save mechanism. Tracked via `nameDrafts` $state record so URL edits and name edits save independently.
- **Emergent-requirements promoted into the blueprint.** `context-v/blueprints/Packs-and-Bundles-Pattern.md` bumped 0.0.0.2 → 0.0.0.3 with a new **§Triage Surface UX Requirements (emergent)**. Eleven pattern-level codifications future pack/bundle implementations across the Lossless family must honor: authoring vs invocation as peers; default to ready-to-fire; filter constrains scope; records-not-cells framing; per-record triage discipline; inline correction + human-supply on one surface; stale-companion-field handling on edit; provenance markers (`human_entered` / `url_human_edited` / `tavily_raw_url` preserved); live progress on long fan-outs; cross-pair state sync via localStorage + window event; federation-time debuggability (standalone-remote-port fallback + CORS un-scrubbing as the proper follow-up); the Svelte 5 effect-cycle pattern.
- **Plan parallel.** `context-v/plans/Run-as-First-Class-Operation.md` bumped 0.0.0.1 → 0.0.0.2 with a parallel **§Surfaced from smoke (2026-05-25/26)** section — same items in journey form, each tagged ✅ shipped / 🔧 partial / ⏳ pending with the commit hash that landed it. Why both: blueprint is the durable institutional pattern; plan is the audit trail. Two different future-readers, two different shapes.

### `7cf8f70` (5/26 02:53) — editable entity-name + Instagram pack + SearXNG issue filed

The session-closing commit. Three threads:

- **Editable entity-name inline in the by-record header.** When the researcher needs to clean up a row's name to make subsequent searches work ("Accelerate the Future (ACH, GW Match)" → "Accelerate the Future"), they edit it without leaving the surface. `entityFieldFor()` returns both the resolved column name and the value so the header knows which `row.fields` key to write back to; `saveRowNameEdit` fires `row.update` on blur and re-pulls rows so the canonical value re-sorts the alphabetical group order. Read-only fallback to `<h3>` when no candidate name column matches the row.
- **Instagram pack.** Common-six → common-seven. Domain whitelist matches `instagram.com` hostnames (both `instagram.com/<handle>/` profile pages and `instagram.com/p/<id>/` post URLs — the URL-shape verifier alone can't distinguish them, so the user corrects via the inline URL edit when Tavily returns the wrong shape). Pack Runner UI gets the matching Instagram checkbox.
- **`context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md` — the next architectural decision filed but not executed.** Documents the symptom (Tavily missing obvious social profiles that manual googling finds in seconds), the three-issue diagnosis (thin RAG index for social pages, over-constrained query construction, hardcoded coupling to one connector), the decision (SearXNG primary for social, Tavily stays as peer connector for future content-RAG packs like deep-research), and the architectural goal: **separate pack concerns from connector concerns**. Today packs hardcode a Tavily-shaped query schema; the proposed shape pulls connectors into a `connectors/` directory with a common interface and a discriminated-union `PackConfig` that names which connector each pack uses. Eight-step proposed work, acceptance criterion (≥60% of previously-not_found social rows resolve on re-fire), explicit out-of-scopes (don't tear out Tavily, defer per-pack quality scorecards).

## The system that exists now

```
┌─────────────────────────── augment-it ──────────────────────────────┐
│                                                                     │
│  shell  (:3000) ──── window manager, peek-deck, pair-only fallback  │
│   │                                                                 │
│   ├── record-collector     (:3001) — CSV ingest, socials chip row   │
│   ├── enhanced-records     (:3002) — generic cell rendering         │
│   ├── prompt-template-mgr  (:3003) — custom prompts (paired)        │
│   ├── request-reviewer     (:3004) — pre-flight                     │
│   ├── response-reviewer    (:3005) — by-record triage cockpit       │
│   ├── chat                 (:3006) — v0.0.1                         │
│   └── pack-runner          (:3009) — source-bound enrich (paired)   │
│                                                                     │
│  services/                                                          │
│   ├── workspace        — capabilities router                        │
│   ├── row-store        — row.fields + socials write-back            │
│   ├── response-store   — sibling payload (prose + structured)       │
│   ├── prompt-runner    — Anthropic, free-form prose                 │
│   └── social-search ★  — Tavily, six (seven) packs, fan-out         │
│                                                                     │
│  packages/                                                          │
│   ├── workspace        — shared types (SocialProfile, Candidate)    │
│   ├── theme            — confidence tokens, amber family            │
│   └── shared-ui ★      — ConfidencePill (first component)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          ★ = new in this arc
```

The two new boxes — `services/social-search` and `packages/shared-ui` — are the structural arrivals. The new remote `apps/pack-runner` at :3009 is the user-visible arrival. The store extensions (response-store + row-store) are the schema arrivals. The blueprint + exploration + plan + issue are the durable-discipline arrivals.

## What's still loose

- **Run entity not yet a first-class operation.** `Run-as-First-Class-Operation.md` Parts 2–6 are sequenced but unbuilt. Part 1 (pair Pack Runner ⇄ Prompt Template Manager) shipped in `12546ba`. The rest is the next deliberate arc.
- **SearXNG substrate not wired.** The issue doc names eight proposed steps; none have shipped. Today's packs still hardcode a Tavily-shaped query schema. Defer until the next deliberate session.
- **By-record view shows responses from every record set, not just the focused one.** After a v4 promote, the parent set's old prompt responses still appear with row_ids the user doesn't recognize. Fix belongs in the by-record grouping path — record-set scope filter chip + only show responses whose row_id resolves through `rowsByRowId` for the focused set.
- **No live progress bar on long pack-fan-out runs.** Named in the blueprint as a UX requirement; the user fires common-seven against 50 prospects and the only feedback is responses arriving.
- **`needs_clarification` as a first-class row state.** Plan Part 5; reserved key declared in the design but not yet implemented.
- **Proper page-title fetch for URL edits.** Today the auto-derived display_name is just the hostname; an HTTP fetch + `<title>` parse on URL edit would do better. Defer until the SearXNG migration makes it free or a user explicitly asks.
- **No bundle yet.** Common-seven is a roster of packs; `profile-builder.common` (the first bundle abstraction with orchestration + carry-forward + a chat verb) is sequenced for after the Run-entity work lands.
- **CORS un-scrubbing on the federation script tags** so future runtime errors show real stack traces in the shell's DevTools console — small dev-experience win, worth doing once the immediate work settles.

## How it works — three load-bearing pieces

### The structured-output extension on the response surface

```ts
// services/response-store/src/store.ts (excerpt — schema additivity)
type Outcome = 'found' | 'not_found' | 'error' | 'skipped' | 'pending';

interface Candidate {
  url: string;
  display_name: string;
  confidence: number;          // 0-100, ConfidencePill drives the band
  snippet: string | null;
  source_metadata: Record<string, unknown>;
}

interface ResponseRecord {
  // ...existing fields (prose, edited_text, edited_at, flag, …)
  outcome: Outcome;
  structured: Candidate | null;
  archival_markdown: string | null;
  pack_id: string | null;       // null = legacy prompt response
  bundle_id: string | null;
  pass: number | null;
}
```

The legacy prompt-runner path doesn't see any of the new fields — it never sets them, the load-time backfill defaults them to null / 'found', the renderer falls through to the old prose-only branch. The pack path uses them and the renderer branches on `outcome` for the new treatments.

### The stale-companion-field invariant in the store

```ts
// services/response-store/src/store.ts — setResponseStructured (excerpt)
const urlChanged = patch.url !== undefined && patch.url !== existing.structured?.url;
const nameAlsoSet = patch.display_name !== undefined;
const snippetAlsoSet = patch.snippet !== undefined;

if (urlChanged && !nameAlsoSet) {
  next.display_name = new URL(patch.url).hostname.replace(/^www\./, '');
}
if (urlChanged && !snippetAlsoSet) {
  next.snippet = null;
}
if (urlChanged) {
  next.source_metadata = { ...existing.structured?.source_metadata, url_human_edited: true };
}
```

Three checks. The UI doesn't have to remember to clear; the store enforces it. The blueprint elevates this to a pattern requirement for future packs: **whenever a primary field is human-edited, its companion auto-derived fields stale and the store cleans them.**

### The shell's pair-only-remote fallback

```ts
// shell/src/App.svelte — navigate handler (excerpt)
window.addEventListener('augment-it:navigate', (e) => {
  const target = e.detail.remoteId;
  // First: is it in the rotation?
  const idx = REMOTES.findIndex(r => r.id === target);
  if (idx !== -1) {
    activateRotationIndex(idx);
    return;
  }
  // Fallback: is it part of a pair?
  const pair = PAIRINGS.find(p => p.includes(target));
  if (pair) {
    openPair(pair);
  }
});
```

The load-bearing seven lines. They let pack-runner (pair-only) and chat (pair-only) participate in cross-remote navigation without being in the peek-deck rotation. Sibling remotes never need to know which pair-key a target belongs to — the shell resolves it.

## Related — going deeper

- **The narrower companion entry (already shipped):** [2026-05-26_01.md](./2026-05-26_01.md) — focuses specifically on response-reviewer's :3005 triage cockpit; this entry is the broader arc that triage cockpit sits inside.
- **The exploration that opened the arc:** [Entity-Profile-Augmentation-Workflow.md](../context-v/explorations/Entity-Profile-Augmentation-Workflow.md).
- **The blueprint that locked the contracts:** [Packs-and-Bundles-Pattern.md](../context-v/blueprints/Packs-and-Bundles-Pattern.md) — the durable pattern for every pack/bundle across the Lossless family.
- **The plan for the next deliberate arc:** [Run-as-First-Class-Operation.md](../context-v/plans/Run-as-First-Class-Operation.md) — six parts, Part 1 shipped, the rest sequenced.
- **The next architectural decision filed:** [Search-Providers-as-First-Class-SearXNG-Default.md](../context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md).
- **The previous changelog this entry picks up from:** [2026-05-23_03_All-Data-Continues-Generic-Rendering.md](./2026-05-23_03_All-Data-Continues-Generic-Rendering.md) — the multi-tenant rule the structured-output extension respects (type-driven, not name-driven).
- **The federation-host lessons that this arc depended on:** [2026-05-21_03_Shell-Federation-Three-Lessons.md](./2026-05-21_03_Shell-Federation-Three-Lessons.md) — what made adding `pack-runner` at :3009 a small change rather than a big one.
