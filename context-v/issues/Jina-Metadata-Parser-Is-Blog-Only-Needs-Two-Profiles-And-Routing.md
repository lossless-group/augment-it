---
title: "Jina metadata parser is blog-only — needs two profiles + fuzzy routing (academic sources lose their date/publisher)"
lede: "The parser only reads OpenGraph keys, so scholarly sources lose date and publisher to `citation_*` / `dc.*` / `prism.*` it never looks at."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Content-Ingest
  - Jina
  - Metadata
  - Bug
status: Resolved
site_uuid: 23d41189-e6b5-4e0e-b111-420481ca2cca
hex_code: gyabhb
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
publish: true
---

# Jina metadata parser is blog-only

## Why Care?

The operator has been hand-entering metadata that Jina already returned —
"supremely inefficient." A live fetch of a Springer article proved it: Jina
returned authors (`dc.creator`, `citation_author`), publisher
(`citation_publisher = Springer US`), and date (`dc.date = 2023-05-27`,
`prism.publicationDate`, `citation_publication_date`) — but the parser only
looked for blog/OpenGraph keys (`article:published_time`, `meta.date`,
`og:site_name`), which academic pages don't set. So date + publisher fell
through empty. A Jina fetch of a **company landing page** is different again
(og/site metadata, no author or date at all).

## The design (operator-directed)

Not one parser reaching for more keys — **two parser profiles plus fuzzy
routing**, so when auto-detection is wrong the human can press a button to
re-parse under the other profile:

- **`structured`** — Highwire `citation_*`, Dublin Core `dc.*`, PRISM
  `prism.*`. For scholarly articles, journals, anything with a DOI.
- **`opengraph`** — `og:*`, `article:*`, Jina top-level, generic. For blogs,
  news, company landing pages, plain web pages.

Routing detects the **source kind** (`academic-paper` / `article` /
`company-landing` / `web-page`) from which keys are present, records it on the
source, and picks the profile. A `forceProfile` override lets the operator
re-route (button wiring tracked as a fast-follow).

Each profile resolves every field across an ordered alias list (first hit
wins), so a field missing under one convention still resolves under another.
Different kinds expect different fields — a company landing page is not nagged
for an author/date it doesn't have.

## Authors

Authors stay an **array of strings** (Jina's `citation_author` / `dc.creator`
already arrive as arrays; one array element = one author, never comma-split,
so "Pal, Soumen" survives). The UI author field already coerces a
comma-separated entry into an array. Future: array of strings that resolve to
unique author profiles (the persons canonical layer).

## Fix

`jina.ts` gains `detectProfile()` (routing → profile + kind), `extractBib()`
(pure, profile-aware, `forceProfile`-overridable), and per-profile field alias
lists. `fetchViaJina()` accepts `forceProfile`. Vitest fixtures cover the
academic (real Springer metadata), article, and company-landing kinds.

## Resolution

Fixed 2026-08-02. Verified: content-ingest `vitest run` + `tsc --noEmit`.
Reaches augment.didi.sh on the next redeploy. The manual re-route **button**
(UI + a re-extract capability that reuses the cached Jina result) is a
fast-follow, tracked separately.

## See also

- [[Fetch-Full-Content-Clobbers-Operator-Metadata]] — the sibling fetch fix.
- [[feedback_additive_enrichment_never_overrides_accepted]] · [[feedback_human_in_drivers_seat]]
