---
title: "Fetch full content clobbers the operator's metadata — resets the title to a URL approximation"
lede: "`fetchSourceContent` never consulted the saved title, so Jina's guess — or the raw URL on failure — overwrote what the operator typed."
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
  - Strategy-Curator
  - Corpus
  - Bug
status: Resolved
site_uuid: 36218a4f-dc16-45f4-9719-379c0cf8f0f8
hex_code: lvs69g
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
---

# Fetch full content clobbers the operator's metadata

## Why Care?

Surfaced live 2026-08-02. The operator fills in a source's metadata (title,
publisher, date), clicks **Fetch full content**, and the title resets to an
approximation of the URL — the hand-entered value is gone. Worse, a
URL-shaped title is the *failure* signal: it means Jina couldn't read the
page, so the content probably wasn't fetched either. Two bugs stacked, and
the clobber hid the failure. Violates the standing rule that additive
enrichment never overrides accepted fields ([[feedback_additive_enrichment_never_overrides_accepted]]).

## Root cause — three layers

1. **`fetchSourceContent` (content-ingest/corpus.ts):**
   `const title = jr.ok ? jr.title || args.url : args.url` — never consulted
   the operator's saved title; Jina's guess (or the URL on failure) always
   won. Bib fields likewise merged "Jina wins, fall back to file."
2. **`applyBibToRegistry` (resolver):** wrote that Jina/URL title straight
   onto the canonical `sources` row.
3. **Client `fetchSource` (curation.svelte.ts):** merged the fetch result
   *over* the form (`{ ...source, ...r.source }`), so the clobbered title
   landed back in the field.

## Desired behavior (operator's spec, 2026-08-02)

Keep all form metadata as-is → fetch full content → write to SurrealDB with
workspace access (humain-vc) → return the `sources` uuid → write local
markdown *if local-write is enabled*.

Of these: DB write + client scoping (`source_usages.client_slug`) and the
returned `source_uuid` already exist. This issue covers the **metadata
preservation** half. The **local-write toggle** is tracked separately (spec
addendum to [[Corpora-Curator-Entry-Point-for-Augment-It]]).

## Fix

- `fetchSourceContent` reads the operator's saved `title` (and bib) from the
  source file and treats them as authoritative; Jina's values are demoted to
  fallbacks that fill only empty fields. The existing `source_slug` is
  preserved so a re-fetch never renames the file.
- Client `fetchSource` keeps the operator's title/authors/publisher/date and
  takes only content + status from the fetch; and now surfaces
  "fetch failed — could not read the URL" instead of silently resetting.

## Resolution

Fixed 2026-08-02. Verified: `rsbuild build` (corpora-curator) + `tsc
--noEmit` (content-ingest) both green. Reaches augment.didi.sh on the next
redeploy.

## See also

- [[feedback_additive_enrichment_never_overrides_accepted]]
- [[feedback_human_in_drivers_seat]] — web-research output isn't trusted to overwrite operator input.
