---
date_created: 2026-07-22
date_modified: 2026-07-22
title: "Stream-scan lands and Augment-from-DB is feature-complete — scan a pulse stream, badge the known, one-click the new"
lede: "Spec step 8 ships as a mode of search-and-add: a per-stream Scan button on the org card fires the official-blog machinery with the stream URL as the authoritative index, dedups against content_items, and badges what the corpus already holds — proven live against The Aspen Institute's blog, flag-flip and all. All five phases of the spec are now implemented."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/social-search/src/stream-scan.ts
  - services/social-search/src/server.ts
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/lib/types.ts
  - apps/org-workbench/src/app.css
  - apps/search-and-add/src/App.svelte
  - apps/search-and-add/src/ResultRow.svelte
  - apps/search-and-add/src/lib/search-client.ts
  - apps/search-and-add/src/lib/types.ts
  - apps/search-and-add/src/app.css
  - context-v/plans/Augment-From-DB-Phase-5-Stream-Scan-Mode.md
  - context-v/specs/Augment-From-DB-Flow.md
tags:
  - Progress-Update
  - Augment-From-DB
  - Stream-Scan
  - Entity-Pulse
  - Feature-Complete
---

# Stream-scan lands — and the flow the spec drew is all there

Phase 5 of [[../context-v/specs/Augment-From-DB-Flow.md]], and with it the spec goes **Shipped**: all five phases implemented in one day against a Signed-Off spec, each phase its own plan, commit, and proof.

## What shipped

**The cheap trick that made this a half-day, not a week:** `runOfficialBlogPack` already had the exact seam — `curated_index_urls`, where operator-curated index pages skip discovery entirely. A stream scan IS "the index is already curated: it's the stream URL." So `organization.stream.scan` is a thin wrapper: fire the blog machinery at the stream, then dedup via the new **`content.urls.check`** on record-surrealdb-resolver (social-search has no DB access by design — the cross-service NATS read follows the domains.ts → content-ingest precedent).

**On the org card:** `AdditiveList` grew an optional per-entry action, and the Pulse-streams list wires it as **scan** — one click dispatches a stream-carrying envelope through the same localStorage + event + navigate contract as every 🔍.

**In search-and-add:** a stream envelope flips the surface into scan mode — TermBar and palette give way to the stream URL + Re-scan; result rows carry an **"in corpus"** badge with the ➕ parked; fresh items one-click into `org_corpus` through the existing add path, and the flag flips on the next scan.

Social walls (LinkedIn/Facebook) ride the same call but stay experimental per the spec's non-goal — blog/RSS/newsroom is the dependable path, and it's the one proven.

## Proof

Live, end-to-end, against the stream Phase 2's proof seeded: scan of `aspeninstitute.org/blog/` → **8 real posts with publish dates** (July 2026, fresh) · `organization.corpus.add` one of them · re-scan → `already_known: 1` and the added item's flag flipped to true. Full sweep green: svelte-check 0/0 on both remotes (one caught-and-fixed prop-destructure miss in AdditiveList — svelte-check earning its keep), all builds, three service typechecks, Phase 1 proof re-run 7/7.

## Where the flow stands

All five phases of [[../context-v/specs/Augment-From-DB-Flow.md]] are implemented and pushed as `attempt(augment-from-db, …, step1–5)`. Remaining before calling the *product* (not the code) done: the operator browser walk-throughs each plan names — the six-flow front door, the org card's ➕s, the 🔍→pairing→add loop, add-person with automatic affiliation, and the scan badge — plus the spec's parked open questions (fire-log persistence, pack-template seed terms, pinned-deploy remote URLs) for a future pass.
