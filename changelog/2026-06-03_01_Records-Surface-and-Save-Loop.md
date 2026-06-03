---
title: "Records Surface ships an end-to-end per-record augmentation loop — fire a connector, accept inline, save as the next version, navigate to download or augment-again"
lede: "After a long arc that re-spec'd the bundle/pack flow from scratch and ended a stack of architectural overreach, augment-it now has a working per-record surface where the operator picks ONE record, fires ONE connector (Firecrawl scan, Firecrawl + Haiku agent, or SerpApi `site:` search), watches the candidate URLs render inline, picks one (or pastes/edits a custom URL), and moves on. Acceptances land in an array column so an entity with multiple canonical paths (Arthur Blank Foundation's /news/ + /blogs/, Ascendium's /newsroom + /our-stories) carries all of them. A save bar at top AND bottom of the records list invokes the existing `record_set.promote` capability with confirmation, the new version auto-becomes the active set, and a post-promote nav surface offers Enhanced Records (download), Augment (next pass), or stay. The same session also produced three new context-v documents that explain the rearchitecture, audit the v3 → v4 → v5 chain to clear promote of a wrongly-pinned bug, and lock the row-count-stable-across-versions invariant. Record Collector got decomposed into proper components with a descending-by-created_at sort and a per-card CSV download button. The user ran the full loop end-to-end on the 96-row pipeline tracker, accepted 98 URLs across 45 rows, and promoted v5 → v6 cleanly."
publish: true
date_created: 2026-06-03
date_modified: 2026-06-03
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Records-Surface
  - Flow-for-Bundles-Packs
  - Per-Record-Iteration
  - Connector-Firing
  - Promote
  - Record-Collector
  - Data-Persistence
  - UX-Rearchitecture
files_changed:
  - apps/records-surface/ (entire new federation remote)
  - apps/records-surface/src/components/PromoteBar.svelte
  - apps/records-surface/src/components/EditableField.svelte
  - apps/records-surface/src/components/RecordRow.svelte
  - apps/records-surface/src/components/RecordsList.svelte
  - apps/records-surface/src/components/CandidatesPanel.svelte
  - apps/records-surface/src/logic/fire.ts
  - apps/records-surface/src/logic/pick-url.ts
  - apps/records-surface/src/logic/promote.ts
  - apps/records-surface/src/state/records.svelte.ts
  - apps/records-surface/src/state/fires.svelte.ts
  - apps/record-collector/src/App.svelte
  - apps/record-collector/src/components/RecordSetsList.svelte
  - apps/record-collector/src/components/RecordSetCard.svelte
  - apps/record-collector/src/logic/download.ts
  - services/social-search/src/records-surface/connectors.ts
  - services/social-search/src/server.ts
  - services/workspace/src/capabilities.ts
  - shell/rsbuild.config.ts
  - shell/src/remotes.ts
  - docker-compose.yml
  - scripts/dev.sh
  - context-v/specs/Flow-for-Bundles-Packs.md
  - context-v/issues/Augment-Transformations-Not-Reliably-Persisting.md
  - context-v/reminders/Record-Count-Stays-Stable-Across-Versions.md
  - context-v/reminders/Pickup-2026-06-03.md
---

## Why care?

augment-it spent the previous several sessions inheriting more and more architecture for bundle/pack work — Entity Pulse Bundle, Connector Inventory + Per-Record Palette, Pulse Curation Layer, Per-Record Iteration as Primary Surface, In-App Chat addendum — and the running total of spec across those four documents passed 2,500 lines. The session that triggered tonight's rebuild fired the Entity Blog bundle against 96 real foundation records and produced **zero usable results** (90 not_found, 6 errors, 0 found) because path-guessing without SerpApi has near-zero recall on real foundation websites and the only review surface (Response Reviewer) mixed the new responses with prior socials work into one undistinguishable card per record. The user said the words *"this is not hard, whatever it is we are remarkably overthinking it"* and that was the inflection point.

This session ships the simplest-possible-thing version: a new federation remote, `apps/records-surface/` at port 3011, mounted into the Flow's step 3 slot, where the operator iterates one record at a time. Three connectors. One screen. Inline candidates. Multi-URL acceptance. Save as next version. Move on. No bundles. No rollup agents. No curation layer. No mixed-pack triage. The 2,500 lines of prior spec still exist (un-deleted, per the non-destructive refactor rule) and inform what to add when the simplest version proves it works, but they're no longer load-bearing for the next step.

The user successfully ran the full loop end-to-end on their 96-row pipeline tracker and accepted 98 URLs across 45 records by the end of the night. That's the trust-building beat the product needed.

## What's new

### Records Surface — `apps/records-surface/` (NEW federation remote)

Standalone at `http://localhost:3011`; mounted by the shell as step 3 of the numbered Flow (replacing Request Reviewer in the rotation, which stays registered as a remote and reachable via direct navigation per the non-destructive refactor rule). Architecture follows the component-decomposition rule the user named twice this session: `App.svelte` is a thin shell that mounts the workspace and renders the records list; logic lives in `src/logic/`; state stores live in `src/state/`; components live in `src/components/`. No business logic dumped into the top-level file.

Per row the surface shows entity name + URL + a small horizontal row of connector buttons. Click a button → that ONE connector fires against that ONE row's URL → candidates render inline below the row → pick one (or paste/edit a custom URL) → the URL writes to the row's `official_updates_index_urls` array column → the user moves to the next row. The bulk-fire-then-triage shape that wasted credits on Entity Blog earlier is gone; per-record iteration is the primary mode.

### Three connectors implemented — `services/social-search/src/records-surface/connectors.ts`

- `firecrawl-nav-scan` — scrape the row's homepage with Firecrawl, extract outbound same-domain links, score by path depth + last-segment-keyword match, return top candidates. Deterministic; no LLM call; works on Walton (Stories), Carnegie (News), Annie E. Casey, etc.
- `firecrawl-nav-agent` — same scrape but pipes nav/footer links + their anchor text through Claude Haiku 4.5 with a one-line prompt to classify which links point at content indexes. Falls back to the deterministic nav-scan when `ANTHROPIC_API_KEY` isn't set. Useful when the deterministic heuristic can't disambiguate (foundations with weird nav structures).
- `serpapi-site-search` — sends `site:<row.url> blog OR news OR press OR insights OR stories` to SerpApi's Google engine. Strongest recall when keyed.

All three return the same `Candidate[]` shape (`{ url, title?, anchor_text?, confidence? }`) so the UI doesn't branch per-connector and a fourth one would land as one more entry in the switch.

### Multi-URL acceptance — `official_updates_index_urls` array column

The original spec called for a single `[pick]` writing one URL per row. Live use surfaced that real entities have multiple canonical paths — Arthur Blank Foundation publishes via both `/news/` and `/blogs/`; Ascendium uses `/newsroom` AND `/our-stories`; Britebound/ASA uses both `/research-insights/` and `/research/`. Picks now append to an array (with dedup), each accepted URL renders as its own line on the row with an `✕` remove button, the paste/edit URL input below the candidates lets the user trim and add fresh entries. Backwards-tolerant: rows that had a single value in the singular `official_updates_index_url` column from earlier in the session still display.

### Inline-editable name + URL per row — `EditableField.svelte`

The user named the principle: "at any point, the user should be able to change the name or url property, or frankly any other property shown in context. This is all iterative." Each row's name and URL are now inline-editable in place. Click to enter edit mode (focuses + selects), Enter or blur to commit, Escape to abort. Writes go through `row.update` so the canonical column gets the change.

The EditableField component is generic — kind: `'name' | 'url'` controls only the typography. Same component will mount on any future field once a "show all fields" toggle lands per the Flow-for-Bundles-Packs spec.

### `helpful_links` → `url` visibility fallback — `logic/pick-url.ts`

A late-session audit (see *What's new at the pattern tier* below) found that 23 of 96 rows in the user's v5 had a hand-curated correct URL trapped in `helpful_links` because a prior URL-edit affordance wrote to `row.helpful_links.add` instead of `row.update({ url: ... })`. The `url` column still held `'unknown'` (or a wrong fan-out value). The Records Surface now reads `url` first, falls back to `helpful_links[0].url` when `url` is empty/`'unknown'`, displays the recovered URL with a small "recovered from helpful_links" chip, and routes the inline edit back through `row.update({ url })` so a save promotes the recovered value to the canonical column. Howard Schultz Foundation, Lumina, McGovern, Tepper, Lauder, DeLaski — all immediately usable on the surface; one promote moves the URLs to where the rest of the system reads them.

### Save / promote-to-next-version bar — `PromoteBar.svelte`

Top AND bottom of the records list (per user request — don't make them scroll to save). Shows live count of how many rows have accepted URLs and total URL count. Click `Go to Save · promote to next version →`, second click `✓ promote` confirms, the existing workspace `record_set.promote` capability fires, the new version (`..._v5.csv` → `..._v6.csv` by name pattern) auto-becomes the Records Surface's active set, and a success block appears with three next-step buttons: `→ Open Enhanced Records (download)`, `→ Augment this set again`, `stay here`. Each navigation hop writes the canonical `augment-it:active-record-set` localStorage key, broadcasts the change event, and dispatches `augment-it:navigate` with the right `remoteId` so the target remote shows up pre-loaded with the new version.

### Record Collector decomposition — `components/` + `logic/`

The user pointed out that the record-sets list card was a key UI element bundled into `App.svelte`. Decomposed into `components/RecordSetsList.svelte` (sorted descending by `created_at` — most-recent uploads and most-recent promotes at the top) + `components/RecordSetCard.svelte` (one card with select / delete / `↓ CSV` download per card) + `logic/download.ts` (CSV build + browser blob download). The CSV picks up declared schema columns first, then any extras (like `official_updates_index_urls`) appended sorted, JSON-stringifies array/object fields so socials + helpful_links + acceptances round-trip cleanly.

### Connector firing capability — `services/workspace/src/capabilities.ts` + handler in `social-search`

New `connector.fire` capability routes browser invocations to a NATS subject `connector.fire.requested`. The social-search handler dispatches by `connector_id`, calls the connector implementation, returns `{ candidates: Candidate[], fired_at, connector_id }`. 60-second timeout for Firecrawl latency. No response-store write — candidates live in the Records Surface's session state, accepts go directly to `row.update`. This is the seam that makes per-record fire-and-fallback work without any round trip through response-store's triage flow.

## What's new at the pattern tier

### Spec — `context-v/specs/Flow-for-Bundles-Packs.md` (NEW, v0.0.0.3)

The simplest-possible-thing spec that powers this whole session. Two-surface Flow (Record Collector → Records Surface), explicit list of what's NOT here (no bundles, no rollup, no fan-out, no triage view, no promote step as its own thing — promote happens on the records surface), the non-destructive refactor rule, the component-decomposition rule with file-structure layout, and the Response Reviewer-as-shell pairing model that swaps the inner view based on what was fired (socials-bundle → SocialsTriageView, url-finder → CandidatesView, prompt-apply → PromptResponseView). The Response Reviewer shell swap itself is unfinished work tracked in the pickup.

### Issue — `context-v/issues/Augment-Transformations-Not-Reliably-Persisting.md` (NEW, v0.0.0.2)

A four-hour audit triggered by the user's observation that "v5 has none of the homepage URL fetching I did." The audit cleared `record_set.promote` of the wrongly-pinned bug — v3 → v4 → v5 carries data forward correctly — and named the actual failure mode: 23 of 96 rows have the user's correct URL trapped in `helpful_links` because the by-record card's URL-edit affordance wrote to `row.helpful_links.add` instead of `row.update({ url })`. Includes the full v3 timestamp reconstruction (user worked 00:47 – 02:00 on 2026-05-23, 41 helpful_links entries with `source: 'manual'`, all preserved through promote). Lists the 18 D-pattern rows (url='unknown' + helpful_link present) and the 5 C-pattern rows (url has a value but helpful_link is right — Griffin Catalyst, Pinterest, GM, Britebound, Ballmer II) that need per-row decisions.

### Reminder — `context-v/reminders/Record-Count-Stays-Stable-Across-Versions.md` (NEW)

Locked invariant: 1 dataset = 1 row count, forever. Augmenting adds columns to existing rows, never new rows. The 231-rows-in-store thing (39 RSVP + 96 v4 + 96 v5 = 231) is row-multiplication-across-versions and should never surface to a user. Two architectural directions: row-store stops multiplying rows across versions OR every surface filters to active-record-set counts only. Lean is the former; the latter is the immediate trust-closing patch.

### Backup — `.backups/2026-06-02_records-surface-acceptances/`

A snapshot of the row-store + response-store + prompt-store + sessions JSON extracted from the docker volume to the host filesystem before any further changes touched the v5 work. Verified to contain the user's 98 accepted URLs across 45 rows. The backup is intentionally outside the docker volume so a container reset can't lose it. Not gitignored at the time of this commit — should be added to `.gitignore` next session, but left in the working tree as the visible artifact of the safety pull.

## What's not in this commit

- **Response Reviewer step-4 view swap.** The pairing model is spec'd; the implementation is unfinished. Step 4 still loads the legacy socials triage UI for every record set, regardless of which kind of fire produced the data. The user flagged this 3+ times this session. It's the highest-leverage unfinished piece — captured as the recommended-A next move in `Pickup-2026-06-03.md`.
- **One-time data fixup script** that promotes `helpful_links[0].url` → `url` for the 18 D-pattern rows. The Records Surface's read-side fallback makes them usable NOW, but the canonical column is still wrong until a script runs. Also the affordance that wrote to helpful_links in the first place hasn't been fixed in `apps/response-reviewer/src/App.svelte` — future edits will recreate the same problem.
- **Enhanced Records List download button.** Record Collector has it per-card; Enhanced Records doesn't yet. The post-promote nav routes through it, so the user expects to download there.
- **Per-row `[show all fields]` toggle** on the Records Surface. Spec step 7. Not done. Each row currently shows only name + URL + accepted URLs; other columns are hidden.
- **Row-count-stable-across-versions architecture work.** The invariant is documented; the row-store still multiplies rows per version. No code change yet.
- **The Pulse Curation Layer, the Entity Pulse rollup agents, the Adaptive Request Reviewer.** All still spec'd, all not built. The simplest-possible-thing spec deliberately rolls them out of v0; they come back when the simple version proves it scales.

## Related

- [[../context-v/specs/Flow-for-Bundles-Packs]] — the active spec (v0.0.0.3)
- [[../context-v/issues/Augment-Transformations-Not-Reliably-Persisting]] — the audit (v0.0.0.2)
- [[../context-v/reminders/Record-Count-Stays-Stable-Across-Versions]] — the invariant
- [[../context-v/reminders/Pickup-2026-06-03]] — tomorrow's session map
- [[../context-v/specs/Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — the predecessor spec (kept for the request-inspection section)
- [[../context-v/issues/Troubleshooting-UI-for-Official-Blogs]] — earlier-in-session catalog of gaps
- [[2026-06-02_01_Official-Blog-Pack-Step-1]] — yesterday's changelog; Entity Pulse step 1 + iso-helper. The Records Surface uses connector implementations adjacent to but not derived from the official-blog-pack handler, so this commit doesn't disrupt that work.
