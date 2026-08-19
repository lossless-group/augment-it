---
title: "Augment from DB · Phase 5 — stream-scan mode: scan a pulse stream, badge the already-known, one-click the new into the corpus"
lede: >-
  Stream scan is a mode of search-and-add, not a third remote: the stream URL is the authoritative index, deduped against `content_items`.
date_created: 2026-07-22
date_modified: 2026-07-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
date_first_published: 2026-07-22
spec_reference: "[[../specs/Augment-From-DB-Flow]] §Phase 5"
post_ship_note: "Executed same day as authored. Live flip-test green against Aspen's blog stream: 8 dated posts → corpus.add one → re-scan shows already_known:1 with the flag flipped. One svelte-check catch (entryaction added to AdditiveList's prop type but not its destructure) fixed before commit. Social-wall kinds untested by design — experimental per the spec non-goal."
tags:
  - Plan
  - Augment-It
  - Augment-From-DB
  - Phase-5
  - Stream-Scan
  - Entity-Pulse
  - Pulse-Streams
status: Shipped
site_uuid: b384d972-ecb0-40e3-ba75-1c4902d7144c
hex_code: zaazn1
date_authored_initial_draft: 2026-07-22
date_authored_current_draft: 2026-07-22
publish: true
---

# Augment from DB · Phase 5 — stream-scan mode

## Spec reference

Implements **Phase 5 (v1.1)** of [[../specs/Augment-From-DB-Flow]], per decision D3 (mode of search-and-add, not a third remote). Branch: `rebuild/turbo-rsbuild`.

**Two design facts found during authoring that make this cheap:**

1. `runOfficialBlogPack` already has the exact seam: `curated_index_urls` — when non-empty, discovery (SerpApi + homepage + path-guess) is SKIPPED and the pack harvests straight from the given index pages. A stream scan IS "curated index = the stream URL." No entity-pulse changes at all.
2. social-search has no DB access, so corpus dedup is a cross-service NATS call (the domains.ts → content-ingest precedent): a new **`content.urls.check`** verb on record-surrealdb-resolver (`{urls[]} → {existing[]}` against `content_items`' unique url index). Service-to-service only — no workspace map entry.

## Steps

1. **`content.urls.check`** — `checkContentUrls` in `resolver.ts` (`SELECT url FROM content_items WHERE url IN $urls`); handler in `handlers.ts` (`content.urls.check.requested`). Shared-ledger read: no client filter, content_items is keyed by unique URL.
2. **`stream-scan.ts`** (social-search) — `scanStream(nc, {org_slug, stream_url, stream_kind, client, max_items?})`: `runOfficialBlogPack({row_id: 'org:'+org_slug, row_url: stream_url, curated_index_urls: [stream_url], max_posts_total})` → `content.urls.check` over the item URLs → items + `already_in_corpus` flags. Blog/RSS/newsroom kinds are the dependable path; social-wall kinds pass through the same call flagged experimental (non-goal: no reliability commitment).
3. **`server.ts`** — subscribe `organization.stream.scan.requested`; ok:false on failure (search.fire's contract, same reason).
4. **`capabilities.ts`** — `organization.stream.scan` → subject, 60s timeout (multi-stage, like pack.entity_pulse).
5. **org-workbench** — `AdditiveList` gains an optional per-entry action (`entryaction={{label, fn}}`); OrgCard wires it on the Pulse-streams list only: "scan" per stream → `requestSearch` with an envelope extended by `stream: {url, kind}` (target `corpus` — scan adds land in `org_corpus`).
6. **search-and-add** — when the envelope carries `stream`, the App enters scan mode: TermBar hidden, stream URL + "Re-scan" shown, results via `organization.stream.scan`; `ResultRow` gains a `known` badge ("in corpus") and disables ➕ for known items; ➕ routes through the existing corpus add + `entity-updated` broadcast.
7. **Verify** — rebuild both service containers; live NATS proof against Aspen's seeded blog stream (`https://www.aspeninstitute.org/blog/`, added in Phase 2's proof): scan → items with flags → `organization.corpus.add` one item → re-scan → its flag flips to true. svelte-check + builds on both remotes + shell. One real Firecrawl-credit scan, accepted.
8. Changelog; spec status → Shipped (all five phases done; operator browser walk-throughs noted as pending); commit + push as `attempt(augment-from-db, stream-scan, step5):`.
