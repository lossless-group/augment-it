---
title: "Agent-Chat Skills and Commands — Candidates List"
lede: "The chat's verb roster is four prompt-focused capabilities. A running list of shell scripts that should graduate into chat-callable verbs."
date_created: 2026-05-26
date_modified: 2026-05-26
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-05-26 — Initial draft. Seeded with `backup-stores.sh` (the nominating commit), the cleanup script `scrap-pack-artifacts.ts` (already exists as a ScriptCapability candidate), and a broader brainstorm across five categories — data safety, inspection, enrichment flow, record-set lifecycle, triage assist. Categories are scaffolding; promote individual items out as specs land.
tags:
  - Exploration
  - Augment-It
  - Agent-Chat
  - Capabilities
  - Verb-Surface
  - Skills
  - Commands
  - Living-Roster
status: Active
site_uuid: cbe77c9c-3d1f-4447-9e3e-79d95f0553ac
hex_code: ygf6qe
date_authored_initial_draft: 2026-05-26
date_authored_current_draft: 2026-05-26
---

# Agent-Chat Skills and Commands — Candidates List

## Why this list

The chat surface in `apps/chat/` is augment-it's **verb-routing layer**. A user says "draft a prompt that pulls each foundation's mission statement" and the chat resolves that to `prompts.draft`, runs the handler, returns the result in a render-hint-shaped response. The current verb roster — four capabilities — is enough to demonstrate the gated-enhancement triad but nowhere near enough to be the user's primary surface for the product.

There are also **already-existing operations** that today live as shell scripts and one-off TS files (`scripts/backup-stores.sh`, `services/social-search/scripts/scrap-pack-artifacts.ts`, the smoke-* scripts, the prompt-runner CLI flags), all of which are *the kind of thing a user should be able to ask the chat to do in prose* — but none of which the chat can currently invoke because no one has wrapped them as capabilities.

This doc keeps a running list of candidates: things the chat *should* be able to do, what shape the wrapper needs to take, and what gating concerns apply (destructive ops need explicit confirmation; scope-aware ops need a record-set parameter; etc.). It is **not** a spec for any one candidate — when a candidate is ready to build, fork a spec out of it and mark the entry here as "promoted out."

## How to read this doc

Each candidate has the same skeleton:

```
### <verb name>
- **What it does:** one-liner intent in user-prose
- **Today's shape:** where this lives currently (script path, code path, or "doesn't exist")
- **Proposed adapter:** TS handler | ScriptCapability | McpCapability | SkillCapability
- **Gating concerns:** destructive? scope-required? rate-limited? confirmation-required?
- **Suggested chat phrasing:** what the user would naturally say
- **Hand-off:** how the chat would surface the result (display_hint mount target, render mode)
- **Status:** Candidate | Scoping | Spec exists → <path> | Shipped
```

Adapter shapes are the four named in [[In-App-Chat-v0-0-1-for-Augment-It]]:

- **TS handler** — capability function lives in `packages/workspace/src/capabilities/<verb>.ts`, runs in-process. Good for fast, deterministic ops that read shared types.
- **ScriptCapability** — invokes a shell or node script via a templated command line. Good for ops that already exist as scripts (backup-stores, scrap-pack-artifacts) and would be unnecessarily expensive to reimplement.
- **McpCapability** — calls out to an MCP server (Chroma, future SearXNG, etc.). Good for ops backed by an external substrate with its own protocol.
- **SkillCapability** — invokes a packaged Lossless skill (the `lossless-skills` family). Good for ops that should also be runnable from outside augment-it.

## Category 1 — Data safety

The triage cockpit accumulates a lot of carefully-edited data in `responses.json` / `rows.json` / `prompts.json` / `sessions.json`. Losing them by accident (a stack-down + volume prune, a malformed docker compose change, a regretted scrap script) wipes hours of human triage. Every destructive op in this category needs a confirmation gate.

### data.backup

- **What it does:** Snapshot every JSON-file store into `.backups/<timestamp>/` with a manifest (branch, head, commit msg).
- **Today's shape:** `scripts/backup-stores.sh` (Bash, reads files via `docker cp` from running containers).
- **Proposed adapter:** ScriptCapability — `bash scripts/backup-stores.sh`, captures stdout for the manifest summary.
- **Gating concerns:** None on the way in (additive only). Should warn if any store container isn't running.
- **Suggested chat phrasing:** *"back up the stores"*, *"snapshot everything before the v4 promote"*, *"save what we have"*
- **Hand-off:** Inline render-hint with the snapshot path + per-file byte counts + the "restore later with…" line.
- **Status:** Candidate. **Nominated 2026-05-26 — the first concrete entry on this list.**

### data.restore

- **What it does:** Restore a named snapshot back into the running containers and restart them so re-reads happen cleanly.
- **Today's shape:** `scripts/backup-stores.sh restore <stamp>`.
- **Proposed adapter:** ScriptCapability — `bash scripts/backup-stores.sh restore {{stamp}}`.
- **Gating concerns:** **Destructive — overwrites live data.** Must require an explicit confirmation turn ("yes, restore from 2026-05-26_014233"). Should refuse if no snapshot matches the stamp. Should ideally `data.backup` first (snapshot-before-restore safety net) and announce that in the chat.
- **Suggested chat phrasing:** *"restore from the snapshot before the cleanup"*, *"roll back the stores to 2026-05-26 morning"*
- **Hand-off:** Inline render-hint with the snapshot manifest preview *before* confirming, then a "restored — restart these containers" line.
- **Status:** Candidate (pair with `data.backup`).

### data.list_snapshots

- **What it does:** List every snapshot under `.backups/` with its manifest summary (timestamp, branch, head, commit msg).
- **Today's shape:** Doesn't exist as a single op (the user `ls .backups/` and `cat MANIFEST.txt`s individually).
- **Proposed adapter:** TS handler — read `.backups/*/MANIFEST.txt`, return a list.
- **Gating concerns:** None (read-only).
- **Suggested chat phrasing:** *"what backups do we have?"*, *"show me the snapshots from yesterday"*
- **Hand-off:** Tabular render mode.
- **Status:** Candidate.

### data.scrap_pack_artifacts

- **What it does:** Remove every pack response (`pack_id !== null`) from `responses.json` and strip every `profiles.*` key from `row.fields` in `rows.json`. Used to clean up after a bad fan-out before the design pivoted to a single `socials` column.
- **Today's shape:** `services/social-search/scripts/scrap-pack-artifacts.ts` — idempotent, `--dry-run` flag, backs up first.
- **Proposed adapter:** ScriptCapability — `tsx services/social-search/scripts/scrap-pack-artifacts.ts {{--dry-run?}}`.
- **Gating concerns:** **Destructive.** Should default to `--dry-run` from chat and require an explicit "now actually do it" turn. Internal backup already happens; chat should announce the backup path.
- **Suggested chat phrasing:** *"clean up the bad pack artifacts"*, *"do a dry-run scrap of the v3 pack responses"*
- **Hand-off:** Inline render-hint showing the dry-run counts (N responses to remove, M row writes to revert) before the confirm turn.
- **Status:** Candidate.

## Category 2 — Inspection / status

Read-only verbs the user reaches for when orienting. None of these need gating; all should default to terse output that fits in a single chat reply.

### records.list

- **What it does:** List record sets in the workspace (id, name, row count, created_at).
- **Today's shape:** **Shipped.** TS handler at `packages/workspace/src/capabilities/records.list.ts`.
- **Status:** Shipped — Reference implementation for other inspection verbs.

### records.show

- **What it does:** Show a single row's full `row.fields` map (every key, every value, scalar OR JSON).
- **Today's shape:** Doesn't exist as a capability; Record Collector renders this UI-side.
- **Proposed adapter:** TS handler — fetch row by id, return full fields map.
- **Gating concerns:** None.
- **Suggested chat phrasing:** *"show me Bridgespan's row"*, *"what do we have for row 42?"*
- **Hand-off:** Inline render-hint pointing the user at Record Collector for inline editing.
- **Status:** Candidate.

### responses.count_by_outcome

- **What it does:** Counts responses grouped by `outcome` (found / not_found / error / skipped / pending), optionally scoped to a record set OR a pack OR a run.
- **Today's shape:** Doesn't exist.
- **Proposed adapter:** TS handler — reads response-store via a new aggregation method.
- **Gating concerns:** None.
- **Suggested chat phrasing:** *"how did common-seven do on the foundation set?"*, *"how many not_found from the bluesky pack?"*
- **Hand-off:** Tabular render mode + a deep-link to Response Reviewer pre-filtered to the scope.
- **Status:** Candidate.

### packs.list

- **What it does:** List every registered pack with its source, domain whitelist, and current connector.
- **Today's shape:** Hardcoded in `services/social-search/src/packs.ts`.
- **Proposed adapter:** TS handler — re-export the PackConfig roster as a read-only view.
- **Gating concerns:** None.
- **Suggested chat phrasing:** *"what packs do we have?"*, *"what's the linkedin pack configured for?"*
- **Hand-off:** Tabular render mode.
- **Status:** Candidate.

### stack.status

- **What it does:** Report which services are running (docker compose ps mapped to friendly names + which API keys are present in .env).
- **Today's shape:** `docker compose ps` + manual `.env` inspection.
- **Proposed adapter:** ScriptCapability + small parse step → TS-shaped output.
- **Gating concerns:** None.
- **Suggested chat phrasing:** *"is the stack up?"*, *"is social-search running?"*
- **Hand-off:** Inline render-hint with one row per service.
- **Status:** Candidate.

## Category 3 — Enrichment flow

The verbs that actually do work against rows. The four shipped today fall here; the cluster needs to grow as packs and bundles mature.

### prompts.draft / prompts.improve / prompts.apply

- **Status:** Shipped (the v0.0.1 gated-enhancement triad).

### packs.fire

- **What it does:** Fan out one or more packs across a row scope. The single-cell verb behind Pack Runner's "Fire" button.
- **Today's shape:** Wired as `pack.fan_out.requested` NATS subject; reached from Pack Runner UI but not from chat.
- **Proposed adapter:** TS handler that wraps the existing NATS publish.
- **Gating concerns:** **Expensive** (cost-scales as `P packs × N rows`). Chat should always preview the cell count before firing and require confirmation if total > some threshold (50? 100?).
- **Suggested chat phrasing:** *"fire common-seven against the foundation set"*, *"run linkedin + x for the rows missing LinkedIn"*
- **Hand-off:** Inline render-hint with the cell-count preview, then once confirmed a deep-link to Pack Runner showing the live tally.
- **Status:** Candidate.

### bundles.fire

- **What it does:** Fan out a bundle (a named roster of packs with orchestration + carry-forward + a chat verb). The blueprint's `profile-builder.<entity-type>` shape.
- **Today's shape:** Bundles don't exist yet — the blueprint's bundle sub-contracts are locked but no implementation has landed.
- **Proposed adapter:** TS handler that orchestrates pack.fan_out across passes per the bundle config.
- **Gating concerns:** Same as `packs.fire`, but cell counts are higher because bundles include orchestration passes.
- **Suggested chat phrasing:** *"build profiles for these foundations"*, *"fire profile-builder.philanthropy against the v4 set"*
- **Hand-off:** Pack Runner + Response Reviewer paired open.
- **Status:** Candidate — **blocked on the first bundle existing**.

### pack.dedup_against_helpful_links

- **What it does:** Pre-flight agent-scan that checks existing `row.fields.helpful_links` for URLs that already cover what a pack would search for, and marks those rows as `skipped` before fan-out. Saves Tavily cost.
- **Today's shape:** Doesn't exist; sequenced in the [[Packs-and-Bundles-Pattern]] blueprint as the pre-flight dedup hook.
- **Proposed adapter:** TS handler invoked before `packs.fire` (or wired as a `dedup: true` flag on the fan-out request).
- **Gating concerns:** None on its own; integrates into the gating model of the verb that calls it.
- **Status:** Candidate — sequenced behind bundle work.

## Category 4 — Record-set lifecycle

Promotion, archival, and the three-state row discipline (`none` / `needs_clarification` / `archived`).

### records.promote

- **What it does:** Promote selected rows from a parent record set into a new canonical (vN+1) record set, applying the type-driven fold across responses + helpful_links + socials.
- **Today's shape:** Shipped as UI behavior in Enhanced Records List; not yet a chat verb.
- **Proposed adapter:** TS handler that wraps the existing row-store promote logic.
- **Gating concerns:** Creates a new record set (additive, not destructive). Confirm the row scope before firing.
- **Suggested chat phrasing:** *"promote the good rows to v4"*, *"create a new set from the foundations with verified LinkedIns"*
- **Hand-off:** Deep-link to the new Enhanced Records List view.
- **Status:** Candidate.

### records.archive_row / records.restore_archived

- **What it does:** Set / clear `row.fields.archived` on a row scope. Archived rows still exist (visible in Record Collector's archived tab) but skip operations.
- **Today's shape:** UI behavior in Record Collector; not yet a chat verb.
- **Proposed adapter:** TS handler.
- **Gating concerns:** Reversible (restore exists), so light confirmation only.
- **Suggested chat phrasing:** *"archive the rows where the foundation closed"*, *"un-archive everything from August"*
- **Status:** Candidate.

### records.flag_needs_clarification / records.clear_needs_clarification

- **What it does:** Set / clear `row.fields.needs_clarification: { reason, flagged_at, flagged_by }`. Distinct from archived — these rows ARE carried through promotions, but operations skip them and the canonical CSV shows their enrichment columns as conscious gaps.
- **Today's shape:** Doesn't exist; reserved key declared in design, not yet implemented.
- **Proposed adapter:** TS handler.
- **Gating concerns:** Reversible.
- **Suggested chat phrasing:** *"flag the ambiguous foundations for the client"*, *"clear all clarification flags from the v4 set"*
- **Status:** Candidate — **blocked on Part 5 of [[Run-as-First-Class-Operation]]**.

## Category 5 — Triage assist

Bulk-apply verbs that take the by-record triage work and let the user collapse N decisions into one chat turn.

### responses.accept_by_confidence

- **What it does:** Accept every pack response with `confidence >= threshold` in a scope. Writes to `row.fields.socials[]` via the existing pack-fork in the accept handler.
- **Today's shape:** Doesn't exist; today the user clicks accept per row in Response Reviewer.
- **Proposed adapter:** TS handler — iterates the response set, calls the existing `response.accept.requested` for each match.
- **Gating concerns:** Destructive in the sense that it writes to rows. Always preview the N-to-accept count before firing.
- **Suggested chat phrasing:** *"accept every linkedin response above 80 confidence"*, *"accept all the wikipedia 100s"*
- **Hand-off:** Inline render-hint with the count, then once confirmed a summary of how many landed on each row.
- **Status:** Candidate.

### responses.bulk_flag

- **What it does:** Bulk-set the triage flag (good / wrong / partial / needs-human) across a filtered response set. The pattern that Response Reviewer renders per-row gets a chat-driven bulk path.
- **Today's shape:** Doesn't exist as a single op.
- **Proposed adapter:** TS handler.
- **Gating concerns:** Reversible (the user can re-flag).
- **Suggested chat phrasing:** *"mark every not_found bluesky response as needs-human"*, *"flag the wikipedia disambiguation pages as wrong"*
- **Status:** Candidate.

### responses.retry_errors

- **What it does:** Re-fire every response whose outcome is `error` in a scope.
- **Today's shape:** Doesn't exist; the renderer shows a disabled retry button per the structured-output extension changelog.
- **Proposed adapter:** TS handler that re-publishes the original `pack.search.requested` for each.
- **Gating concerns:** Expensive (re-runs Tavily). Confirm cell count.
- **Status:** Candidate.

## Cross-cutting concerns

### The destructive-op gating model

Several candidates above need confirmation before firing. The pattern should be uniform across all of them:

1. User says the verb in prose ("restore from yesterday's backup")
2. Chat resolves the verb, fetches the preview (snapshot manifest, cell count, row count, etc.)
3. Chat replies with the preview + an explicit "Confirm by saying 'yes' or 'do it'"
4. User confirms in a follow-up turn
5. Chat fires the actual op

This shape is **not yet codified** anywhere — it needs to land as part of whatever spec graduates the first destructive-op candidate (likely `data.restore`). Open question for the blueprint: should the confirmation turn be a chat convention, or should the capability layer expose a two-phase API (`prepare` → `commit`) that the chat orchestrates?

### Scope resolution

Many verbs take a "scope" — a row scope, a record-set scope, a response scope. The chat should resolve a vague phrase ("the foundations", "the v4 set", "everything we did yesterday") into a concrete scope before firing. Mechanism options:

- **Lookup-by-name** — chat fuzzy-matches the phrase against record-set names, pack names, run timestamps
- **Anticipation hints** — every verb declares what scope shapes it accepts; the chat shows a picker if the user's phrase is ambiguous
- **Carry-forward** — once a scope is established in a conversation, subsequent verbs default to that scope ("now flag those as needs-human")

Open question for the blueprint: which of these to land first, or all three with a precedence order?

### The four adapter shapes and when to choose

Working rule of thumb based on the candidates above:

- **TS handler** — when the op is fast, deterministic, and operates on shared types already in `@augment-it/workspace`. Most candidates above fit here.
- **ScriptCapability** — when the op already exists as a shell or node script and rewriting it as a TS handler would just be translation. Specifically: `data.backup`, `data.restore`, `data.scrap_pack_artifacts`, `stack.status`.
- **McpCapability** — when the op needs an external substrate (Chroma for corpus search, SearXNG once that lands, etc.). No candidates above use this yet; the SearXNG migration introduces the first one.
- **SkillCapability** — when the op should also be runnable from outside augment-it (other AI products in the ai-labs tree, or via the Lossless `lossless-skills` distribution). Candidate: the destructive-op gating discipline itself could be a skill; cross-cutting backup/restore patterns could too.

## Promotion out of this list

When a candidate above is ready to build:

1. Fork a spec under `context-v/specs/<verb>.md` (or a plan under `context-v/plans/` if multi-phase).
2. Update the entry here to `Status: Spec exists → <path>` (don't delete; the candidate row remains the index entry).
3. Once the capability ships, update to `Status: Shipped` with a back-link to the changelog entry.

Entries that get rejected (the verb doesn't make sense, the cost/value math doesn't work, the use case dissolved on closer look) move to a §Rejected section at the bottom of this doc with a brief reason — keeping them visible so the next person doesn't re-propose the same dead candidate.

## Open questions to seed the next revision

- **Q1.** Should the destructive-op gating live in the capability layer (two-phase `prepare` → `commit` API) or in the chat layer (a conversation convention)? — affects every destructive candidate above.
- **Q2.** What's the first **bundle** that lands, and does it gate the first `bundles.fire` chat verb on bundles existing at all? Currently `profile-builder.common` is the natural target (LinkedIn + X first, per the blueprint's implementation order).
- **Q3.** Should `responses.accept_by_confidence` honor only pack responses, or also legacy prompt responses (which don't carry confidence — they're prose)? Probably pack-only-by-shape; document the asymmetry.
- **Q4.** How does the chat surface `display_hint.mount: <remote-id>` deep-links — as a clickable card in the chat? a `augment-it:navigate` event dispatch? both?
- **Q5.** What's the right home for ScriptCapability adapters — alongside the script (`services/social-search/scripts/scrap-pack-artifacts.capability.ts` next to the .ts file) or centralized in `packages/workspace/src/capabilities/script-adapters/`?

## References

- [[In-App-Chat-v0-0-1-for-Augment-It]] — the plan that shipped the four-verb roster.
- [[Packs-and-Bundles-Pattern]] — the blueprint that defines packs, bundles, and the chat-verb registration sub-contract.
- [[Run-as-First-Class-Operation]] — Part 5 names `needs_clarification` as a reserved row key; blocks the corresponding chat verbs above.
- `apps/chat/src/PromptDraftPanel.svelte` — the reference implementation of how a capability result renders in chat.
- `packages/workspace/src/capabilities/` — where shipped TS-handler capabilities live.
- `scripts/backup-stores.sh` — the nominating script for this doc.
- `services/social-search/scripts/scrap-pack-artifacts.ts` — second ScriptCapability candidate already on disk.
