---
title: "Jina learns two metadata profiles — academic sources stop losing their dates and publishers"
lede: "The metadata parser was reading only blog/OpenGraph keys, so scholarly articles — whose data hides under Highwire/Dublin-Core/PRISM tags — arrived with no date and a weak publisher, and the operator hand-filled them. Now it detects the source KIND (academic-paper / article / company-landing / web-page), routes to the right parser profile, and resolves every field across all conventions. A Springer article now fills its authors, publisher, and date automatically."
date_created: 2026-08-02
date_modified: 2026-08-02
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
files_changed:
  - services/content-ingest/src/jina.ts
  - services/content-ingest/test/jina-extract.test.ts
tags:
  - Augment-It
  - Content-Ingest
  - Jina
  - Metadata
  - Bug-Fix
---

# Jina learns two metadata profiles

Jina always returned rich metadata for every source — we just weren't reading
it. The parser looked for blog/OpenGraph keys (`article:published_time`,
`og:site_name`), which scholarly pages don't set: they carry their metadata
under Highwire, Dublin-Core, and PRISM tags (`citation_*`, `dc.*`, `prism.*`).
So academic sources lost their publish date and got a weak publisher, and you
filled them in by hand.

Now `jina.ts` **detects the source kind** and **routes to one of two parser
profiles**:

- **`structured`** — `citation_*` / `dc.*` / `prism.*`, for scholarly articles
  and anything with a DOI.
- **`opengraph`** — `og:*` / `article:*` / generic, for blogs, news, company
  landing pages, and plain web pages.

Each field resolves across an ordered list of aliases spanning every
convention, so a value missing under one still resolves under another. Every
source now records its detected `source_kind` and `parser_profile`, and the
extractor accepts a `forceProfile` override — the foundation for a "re-parse
as…" button when detection is wrong (fast-follow, #79).

A live Springer article that used to arrive dateless now fills its four
authors, `Springer US`, and `2023-05-27` automatically.

Verified with a vitest suite whose academic fixture is the real metadata
captured live from that article. Reaches augment.didi.sh on the next redeploy.
