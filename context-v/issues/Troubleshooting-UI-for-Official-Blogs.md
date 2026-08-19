---
title: "Troubleshooting UI for Official Blogs — The Bundle Fire Path Doesn't Fit the Flow That Was Built for Prompt Templates"
lede: "Bundles fire end-to-end, but the Flow assumes every fire routes through a prompt template — so every step past 2 is wrong for a bundle."
date_created: 2026-06-02
date_modified: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Entity-Pulse
  - Official-Blog-Pack
  - Pack-Runner
  - Request-Reviewer
  - Response-Reviewer
  - Per-Record-Fire
  - Flow
  - Connector-Palette
  - UI-Mismatch
status: Open
site_uuid: 161bb0f1-d025-4b9a-aa57-5d7af2ad5079
hex_code: 0mxx9l
date_authored_initial_draft: 2026-06-02
date_authored_current_draft: 2026-06-02
publish: true
---

# Troubleshooting UI for Official Blogs

## Why this issue exists

After landing the Entity Pulse Phase-1 packs (`official-blog-pack`,
`official-pressrelease-pack`, `official-social-posts-pack`) and the
Connector Inventory registry on branch `feat/bundle-media-packs`, the
session that tried to actually USE them surfaced a stack of UX problems
that the existing context-v specs partially predicted but did not solve.

The packs work. The bundles fire. Real items land. The surface that
takes a user from "I want to add blog/news/press data to this record
set" to "here are the candidates I should triage" is not a coherent
path — it's a sequence of remotes that were each designed for a
different operation, and the seams between them assume a world where
the user is firing a *prompt template against a record set*, not a
*bundle of packs against a record set*.

This issue documents what was tried, what worked, what broke, what's
already fixed, and what needs to be redesigned. Captured at the end of
the 2026-06-02 session for the next-session pickup so the same ground
doesn't get re-walked.

## What was attempted in-session

Goal: select Entity Blog bundle from the Augment remote → fire it on
a filtered set of records (the ones with a website URL) → review the
returned blog-post candidates in Response Reviewer → triage.

Outcomes:

1. **Augment remote (step 2) — bundle picker.** Initially did NOT show
   Entity Blog / Entity Officials because the client-side
   `apps/pack-runner/src/bundles.ts` is hand-mirrored from the server-
   side `services/social-search/src/entity-pulse/bundles.ts` and the new
   bundles had only landed server-side. **Fixed in-session** by adding
   both to the client-side registry (commit pending on
   `feat/bundle-media-packs`).
2. **Fire dispatch — list-shaped output.** Entity Pulse packs return
   `EntityPulseListResponse<OfficialUpdateItem>` (N items per cell);
   the existing fan_out path assumes one ResponseRecord per cell.
   **Fixed in-session** with a dispatch shim
   (`services/social-search/src/entity-pulse/dispatch.ts`) that:
   - routes Entity Pulse pack ids inside `pack.search.requested` and
     `pack.fan_out.requested` to the right list-shaped handler;
   - publishes ONE `response.create.requested` per item so they show
     up in Response Reviewer's by-record view exactly like Profile
     Builder responses do.
3. **First fire crashed response-store.** The fan-out reported "Fired
   67 cells — all settled" but Response Reviewer showed 0 results. Root
   cause: NATS's default `max_payload` is 1MB; the response.list reply
   for the existing 800+ stored responses exceeded that and crashed
   response-store mid-call. **Fixed in-session** by pinning a
   `nats.conf` with `max_payload: 8MB` and mounting it into the NATS
   container. The 67 cells that fired during the crash window are
   lost — fire-and-forget publishes during downtime aren't queued.
4. **Logs visibility.** Backend container logs (where the crash
   surfaced) were not streaming alongside the frontend dev output
   under `pnpm stack up`, so the crash looked invisible from the UI
   operator's perspective. **Fixed in-session** by extending
   `scripts/dev.sh up` to background-tail `docker compose logs -f`
   with a `[backend] ` prefix into the same terminal.
5. **Per-record fire affordance missing in Augment.** The new chip
   palette pattern (per Connector-Inventory spec) was wired into
   Response Reviewer's by-record card, but Response Reviewer is
   downstream of the fire — the user can't get to it without first
   doing a bulk fan-out. The user wants the per-record fire surface
   in Augment, beside each row in the record picker. **In-progress in
   session, paused mid-edit when this issue doc was requested.**
   `ConnectorChip.svelte` + `ConnectorPalette.svelte` were copied
   into `apps/pack-runner/src/`, an `inventory` loader landed, and a
   `fireOneRow(row, pack_id, connector_id?)` handler was added, but
   the row markup integration is half-done.

## What's broken about the flow (the deeper problem)

The shell at `:3100` enforces a 1→2→3→4→5 numbered Flow:

| Step | Remote | Designed for | Bundle-fire reality |
|---|---|---|---|
| 1 | Record Collector | Pick a record set | Works fine |
| 2 | Augment (Pack Runner) | Pick records + prompt OR bundle, fire | Works for bulk fan-out; no per-record fire surface |
| 3 | Request Reviewer | Preview the prompt with row variables filled in before firing the model | **Empty for bundle fires** — has no Bundle preview |
| 4 | Response Reviewer | Triage the model's responses | Works once responses exist (after firing past step 3) |
| 5 | Promote / Canonical | Promote the curated set | Out of scope here |

Two structural mismatches:

1. **Step 3 (Request Reviewer) is prompt-only.** It shows "choose a
   prompt + choose a record set + pick a model" — meaningless when the
   user just fired a bundle of packs in step 2. The spec
   [[../specs/Shell-and-Micro-Frontend-UX-Coherence]] Decision §10
   names the **Adaptive Request Reviewer** as the answer: a composite
   slot whose active member is chosen by the incoming request type.
   That decision is locked in spec but unimplemented in code. Without
   it, a bundle-fire user looking at step 3 sees a dead screen and
   has no way to forward-navigate to Response Reviewer through the
   Flow.
2. **Per-record fire belongs in step 2, not step 4.** The per-record
   chip palette pattern (per
   [[../specs/Connector-Inventory-and-Per-Record-Palette]]) currently
   lives only in Response Reviewer's by-record card. For prompt-
   template fires that's where it makes sense (triage after the LLM
   answered). For bundle fires it makes more sense in Augment, where
   the user is already looking at the rows they want to fire on
   *before* the bulk fan-out. The current layout forces a bulk-then-
   triage shape even when the user's real intent is "fire on this
   one row first, see what comes back, then decide whether to fan
   out."

The user phrased it pointedly during the session: *"the request
reviewer makes no sense without showing the request that is going out.
It does this for a prompt that is populated with variables. We
discussed this several times over in the context-v files."*

That's correct. The Adaptive Request Reviewer spec exists; the
implementation does not.

## Specific UI artifacts that don't make sense for bundle fires

From the screenshots captured in-session:

- **Augment step 2** shows the bundle picker, the row filter (has-url /
  no-url), and a single "Fire Bundle on N rows" button. It does NOT
  show, per row, what's about to fire on THAT row (the candidate URL
  for the find-index stage, the wire-service queries for the press-
  release pack, the social-account URLs that will be walked). All of
  that information would fit naturally inline per row and would let
  the user pick "fire just this one" before the bulk run.
- **Request Reviewer step 3** lands the user on a "choose a prompt"
  surface with no record-set pre-selected. Even reading the Fire
  Bundle message *"Fired 67 cells — all settled. Open Response
  Reviewer to triage."* doesn't help: there's no link, no advance
  button, no breadcrumb. The Flow's step-numbered chrome implies
  forward progression but provides no path.
- **Response Reviewer step 4** correctly renders the by-record view
  with the new chip palette (the work IS landing; the screenshot
  shows `in x bs yt f wp ig` chips per row group). But until the user
  knows to skip step 3 to get here, that whole surface is invisible.
- **Filter UI** at the top of Response Reviewer (Recent Set v4 / v5)
  fragments responses across record sets in a way that's not visible
  to the operator until they're in step 4 looking for what they just
  fired.

## What's already been fixed in-session (commit pending)

| Fix | File(s) | Status |
|---|---|---|
| Entity Pulse bundles selectable | `apps/pack-runner/src/bundles.ts` | Landed |
| List-shaped pack dispatch | `services/social-search/src/entity-pulse/dispatch.ts` (NEW) + `server.ts` | Landed |
| `pack.search.requested` routes to entity-pulse handler when pack_id matches | `server.ts` | Landed |
| `pack.fan_out.requested` routes to entity-pulse handler when pack_id matches | `server.ts` | Landed |
| NATS max_payload bumped 1MB → 8MB | `nats.conf` (NEW) + `docker-compose.yml` | Landed |
| Backend logs stream into `pnpm stack up` terminal | `scripts/dev.sh` | Landed |
| Pack-palette metadata moved out of App.svelte into bundles.ts | `apps/pack-runner/src/bundles.ts` | Landed |
| `connectors.inventory` capability mapping | `services/workspace/src/capabilities.ts` | Landed earlier |
| `pack.entity_pulse` capability mapping | same | Landed earlier |
| `ConnectorPalette.svelte` + `ConnectorChip.svelte` copied to pack-runner | `apps/pack-runner/src/` | Landed |
| `inventory` loader + `fireOneRow` handler in Pack Runner | `apps/pack-runner/src/App.svelte` | Landed |
| Per-row palette rendered inline in row list | `App.svelte` | Landed (typechecks; needs visual smoke test) |

## What's still broken / unresolved

1. **Adaptive Request Reviewer (step 3) is not implemented for bundle
   fires.** This is the biggest single blocker. Until step 3 can
   render a bundle-fire preview, the Flow's step numbering misleads.
   The user-facing minimum: when the user arrives at step 3 after a
   bundle fire, show:
   - Bundle name + selected packs
   - For a sample of 2–3 rows: the actual fan-out payload (find-index
     query strings, wire-service site-restricted queries, candidate
     URLs, social-account URLs being walked)
   - The fan-out arithmetic (N rows × M packs × ~K provider calls)
   - Estimated cost (LLM calls, paid-connector calls)
   - A "Continue to Response Reviewer →" forward link
2. **Flow navigation is one-way and gated.** Even when step 2 has
   fired a bundle, advancing to step 4 (Response Reviewer) requires
   passing through step 3. Step 3 should auto-advance for bundle
   fires once the fan-out has settled, OR the step-2 "Fire Bundle"
   button should land the user directly on step 4.
3. **Per-row fire confirmation feedback is shallow.** The chip turns
   "found" but the user has no visible confirmation that the
   candidate items are in response-store and will show up in
   Response Reviewer. A toast / inline-count / "see results →" link
   would close the loop.
4. **The chip "fired" state is in-memory only.** Refreshing the page
   loses which packs the user has already fired on which rows. The
   real source of truth is response-store; the Augment UI should
   query it (filtered by row_id + pack_id) to render the "already
   fired" state durably.
5. **Bulk-fire of an Entity Pulse bundle is expensive.** Each
   official-blog-pack cell does up to 3 Firecrawl index scrapes + up
   to 20 Firecrawl post scrapes. On 67 rows that's potentially 67 ×
   23 = 1,541 Firecrawl calls per fire. The fan-out surface needs to
   surface this estimate pre-fire (Decision §10 territory).
6. **No way to see the request payload that fired.** When a fan-out
   produces unexpected results (no items, errors), the user can't
   inspect what queries actually ran. The Adaptive Request Reviewer
   would solve this for pre-fire; a "request inspector" affordance
   on the response record would solve it for post-fire.
7. **The single-pack mini-bundle `entity-blog` and the 3-pack bundle
   `entity-officials` are both visible in the dropdown.** Their
   display names don't make it obvious that one is a smoke-test
   bundle and the other is the production roster. Naming or grouping
   needs to disambiguate.
8. **`official-pressrelease-pack` returns false positives.** Spec
   step 2 deliberately skipped LLM byline verification — the URL
   pattern is the filter. Smoke against Reach University showed
   2 / 6 false positives (other "University"-name matches). Real
   triage needs the byline check (deferred to spec step 3+) OR a
   user-facing affordance to mark "wrong entity" so the rollup
   doesn't count it.

## Design questions raised but not resolved

- **Should the per-row palette in Augment step 2 trigger a normal
  `pack.search` fan-out (one cell) or a special "single-row fire"
  subject?** Today it uses the same `pack.search.requested` path the
  legacy two-row provider grid in Response Reviewer used. That works
  but couples the row-picker UI to the same response-store write path.
  A separate path could let the row-picker show results inline
  without round-tripping through Response Reviewer. (Lean: same path
  for now — coupling is fine until the inline-results case actually
  ships.)
- **Should Entity Pulse items become first-class
  `PulseCategoryState<Rollup>` writes, or stay as flat
  ResponseRecord-per-item until the curation layer ships?** Per
  [[../specs/Pulse-Curation-Layer-and-UI]] migration step 4 the
  rollup wrapper is the eventual home; for now the dispatch shim
  flattens to ResponseRecord so the existing triage UI works
  unchanged. This is a known interim shape.
- **Should "Fire on this row" advance the Flow to step 4 (Response
  Reviewer) on completion?** Today the user has to manually
  navigate. Auto-advance reduces clicks but may surprise users
  mid-iteration.
- **Should step 3 (Request Reviewer) be hidden for bundle fires
  rather than rendered as an empty surface?** Hiding it preserves
  the Flow numbering's promise that every numbered step is reachable
  with meaningful content. Rendering empty (today) is the
  worst-of-both.

## Concrete next steps (proposed order)

1. **Complete the per-row palette in Augment step 2** (in-flight, has
   compile errors at session end — `activeBundle` naming was
   resolved, palette markup is in place, needs visual smoke).
2. **Land the Adaptive Request Reviewer minimum** for bundle fires:
   render bundle + packs + sample-row fan-out preview when a bundle-
   fire is incoming. Even a static "what's about to fire on row Y"
   block is huge.
3. **Wire forward navigation** from step 2 → step 4 when a bundle
   fan-out completes, bypassing step 3 OR landing on step 3 with a
   meaningful preview.
4. **Persist per-(row × pack) fire state** by querying response-store
   for the row_id + pack_id intersection on Augment mount, so chip
   "fired" / "found" badges survive refresh.
5. **Surface the fan-out cost estimate** in step 2 before firing —
   especially for Entity Pulse bundles where Firecrawl calls can
   pile up fast. (Aligns with the per-bundle cost-budget open
   question in [[../specs/Entity-Pulse-Bundle]].)
6. **Defer the rollup-agent and curation layer.** Step 4 (Response
   Reviewer with flat per-item ResponseRecords) is sufficient for
   the testing arc; the rollup framing can land alongside the
   Adaptive Request Reviewer when scope allows.

## Lessons captured for the next session

- **Add a context-v issue document at the moment a UX path becomes
  illegible** — not when the implementer thinks it's done. The
  in-session screenshots and the user's "this makes no sense"
  feedback are the load-bearing evidence; capture them while the
  receipts are fresh.
- **Bundles ≠ prompts.** The Flow chrome was built around the prompt-
  template fire path. Every time a bundle-shaped fire is added it
  rediscovers that the Flow is one operation away from making sense.
  The Adaptive Request Reviewer spec is the answer; until it ships,
  the gap will keep being felt.
- **Container restarts during fan-out cost the fan-out.** The
  response-store crash that lost the first 67 cells was avoidable
  with NATS JetStream queueing of `response.create.requested`.
  Current setup is fire-and-forget; consider switching to
  request/reply with persistence so a crashed consumer doesn't
  drop work.
- **Backend logs must be visible to the operator at all times.**
  Without the `pnpm stack up` log integration the response-store
  crash was completely silent to the UI operator. Default to logs-
  on for every dev surface that mounts a remote.

## Related

- [[../specs/Connector-Inventory-and-Per-Record-Palette]] — the
  registry + chip palette pattern this issue references; correct on
  the pattern, silent on the cross-Flow mismatch
- [[../specs/Entity-Pulse-Bundle]] — the bundle whose Phase-1 packs
  this issue troubleshoots; the migration plan correctly stages
  packs first / curation later, but doesn't address the Flow's
  bundle-vs-prompt assumption
- [[../specs/Shell-and-Micro-Frontend-UX-Coherence]] §Decision §10
  — the Adaptive Request Reviewer; locked in spec, unimplemented in
  code, named here as the load-bearing missing piece
- [[../specs/Pulse-Curation-Layer-and-UI]] — the eventual home for
  list-shaped pack output; the dispatch shim in this session is the
  interim flatten-to-ResponseRecord shape
- [[../specs/Request-Reviewer-Pre-Flight-Surface]] — the original
  Request Reviewer pre-flight pattern that Decision §10 evolves
- [[../plans/In-App-Chat-v0-0-1-for-Augment-It]] §"Industry context"
  — the 2026-06-03 addendum on command/skill registration; informs
  the MCP-shaped exposure of bundle fires as a v0.0.2 candidate
- [[../reminders/Pickup-2026-06-02]] — the session map this work
  picked up from
- [[Search-Providers-as-First-Class-SearXNG-Default]] — the
  provider-plurality precedent; the iteration-loop framing in there
  is directly what the per-row palette is meant to surface
