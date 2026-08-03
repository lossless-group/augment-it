---
title: "Corpora builder gets its curator fixes — tags split on commas, and fetch stops clobbering your metadata"
lede: "Two operator-reported curator bugs, fixed the same afternoon they surfaced: comma-separated tag entries now become separate chips instead of one fused mega-tag, and 'Fetch full content' no longer overwrites the title (and bib) you typed — it fills only empty fields and, when a page can't be read, says so instead of silently resetting the title to the URL. Plus the search-queue feature earns a splash highlight."
date_created: 2026-08-02
date_modified: 2026-08-02
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
files_changed:
  - apps/strategy-curator/src/curation.svelte.ts
  - apps/strategy-curator/src/StrategyPicker.svelte
  - services/content-ingest/src/corpus.ts
  - splash/src/content/feature-highlights/fire-many-searches.md
tags:
  - Augment-It
  - Strategy-Curator
  - Corpus
  - Bug-Fix
  - Tags
---

# Corpora builder — curator fixes

Two bugs surfaced live while curating the humain-vc theses, and both are fixed.

## Tags split on commas (#76)

Typing `Quantum-Computing, Quantum-Innovations, Computational-Biology` used to
save as **one** dashed token, because the tag helper treated commas exactly like
spaces. Now commas (and newlines) are tag **separators**; spaces within a
segment stay word-joiners. Paste a comma-separated list into either tag field —
source edit or corpus create — and you get distinct chips, deduped, each
Train-Case. Suggestion clicks are unchanged.

## Fetch full content stops clobbering your metadata (#77)

"Fetch full content" used to overwrite the title you typed with the fetcher's
guess — or, when the page couldn't be read, with the raw URL, which also hid
that the fetch had failed. Enrichment is now **additive**: your saved title,
publisher, date, and authors are authoritative; the fetch fills only fields you
left empty and pulls the body. When a page can't be read, it now says
"fetch failed — could not read the URL" instead of silently resetting.

## Also included

- The async **search queue** ("run several searches at once, no babysitting")
  earns a curated splash highlight, not just a changelog line.

Both curator fixes reach augment.didi.sh on the next redeploy; already-mangled
records (one quantum source's tags) were corrected directly the same day.
