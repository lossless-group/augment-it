---
date_created: 2026-06-29
date_modified: 2026-06-29
title: "Sources capture their own bibliography — authors, publisher, date"
lede: "Fetch a source and it now fills in its own author(s), publisher, and publication date, straight from Jina's structured metadata — authors as an array, all editable, all written to both the file and the registry. Plus a green save-pulse on every field, and a fix so renamed files actually stay connected."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - services/content-ingest/src/jina.ts
  - services/content-ingest/src/corpus.ts
  - services/record-surrealdb-resolver/src/domains.ts
  - apps/strategy-curator/src/curation.svelte.ts
  - apps/strategy-curator/src/SourceDetail.svelte
  - apps/strategy-curator/src/types.ts
  - apps/strategy-curator/src/app.css
  - context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md
tags:
  - Progress-Update
  - Strategy-Curator
  - Source-Curation
  - Jina
  - Bibliography
  - SurrealDB
  - reach-edu
---

## Why Care?

A source isn't just a URL — it's a citation. To ground anything in it you need the
author, the publisher, and the date. Until now the curator caught the title and
nothing else, so every source needed those typed in by hand. That's exactly the
tedious, error-prone work the tool exists to remove.

Now: fetch a source and its **author(s), publisher, and publication date appear on
their own**, pulled from the page's structured metadata. You still own them — every
field is editable — but you start from filled-in, not blank.

## What's New?

- **Auto-filled bibliography.** `source.add` and `source.fetch` extract author,
  publisher (`og:site_name`), and published date from Jina and write them to both the
  markdown frontmatter and the SurrealDB registry.
- **Authors is an array.** One author → a one-element list; multiple authors → multiple
  entries. (Jina hands back a string for one and an array for several; we normalize.)
- **Editable everything.** Title, Filename, Author(s), Publisher, Published date — all
  in the source form, all hand-correctable, each writing through to file + registry.
- **Green save-pulse.** Hit Enter (or click away) in a field and its border pulses green,
  then fades — a "saved ✓" right where you typed. No pulse if the save errored.
- **Renamed files stay connected.** Fixed a gap where an in-session source could lose its
  link to its file on disk.

## Under the Hood — the one-line bug that hid everything

The bibliographic data was always in Jina's response — we were just asking for the
wrong format. `r.jina.ai` returns a markdown preamble (title + date only) *or* a JSON
body whose `data.metadata` carries author and `og:site_name`. We switched to JSON, wrote
all the extraction code... and it did nothing. The author and publisher kept coming back
empty.

The cause: a stale `Accept: 'text/markdown'` header. An earlier edit replaced the
response-*handling* code but the window started one line below the header, so the request
still asked for markdown. Every fetch ran the JSON parser against a markdown body,
`JSON.parse` threw, and the code fell to the partial fallback path. **All the right code,
dead behind a failing parse.** One character — `application/json` — and authors,
publisher, and date all lit up:

```yaml
authors:
  - "Alana Semuels"
publisher: "The Atlantic"
published_date: "2016-06-02"
```

The lesson logged for next time: when a feature is "implemented but inert," check the
*request*, not just the handler — and verify the running container actually has the line
you think it does.

## The "renamed files won't connect" fix

A source added during a session came back from the resolver without its `source_slug`, so
its Filename field sat empty and rename had nothing to point at — even though the database
knew the file perfectly well. Two fixes: the `source.add` / `fetch` / `retry` responses now
echo `source_slug`, and the UI derives the slug from `corpus_path` as a fallback. A file
that exists never shows a blank filename again.

## What's Next

- A **paid Jina key** (`JINA_API_KEY` in `augment-it/.env`) for more consistent extraction
  and higher rate limits — the free tier honors the JSON request less reliably.
- The still-pending **interstitial detector** and **auto text-extraction from attached PDFs**
  from the prior entry, [[2026-06-29_01_Strategy-Curator-Source-Surface-Curate-Sources-By-Domain-Type]].

## Files Touched

content-ingest's `jina.ts` (JSON extraction) and `corpus.ts` (bib frontmatter + authors
list), the resolver's `domains.ts` (registry columns + response echo), and the
strategy-curator UI (`curation.svelte.ts`, `SourceDetail.svelte`, `types.ts`, `app.css`).
Spec bumped to 0.0.0.6 with an Increment 4 section.
