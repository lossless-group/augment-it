---
title: "Tag input swallows commas into one mega-tag — commas should split into separate tags"
lede: "`toDashed` splits on every non-alphanumeric, so commas behave like spaces and three intended tags fuse into one mega-tag."
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
  - Tags
  - Bug
status: Resolved
site_uuid: 9adaec54-b674-43d3-8207-6a04f98bf3e0
hex_code: pd8h9p
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
publish: true
---

# Tag input swallows commas into one mega-tag

## Why Care?

Surfaced live on 2026-08-02 while curating the "Quantum Innovation &
Computational Biology" thesis: the source
`biology-begins-to-tangle-with-quantum-computing` ended up with the tag
`Quantum-Computing-Quantum-Innovations-Computational-Biology` — three
intended tags fused into one — plus a stray `Quantum-Computing`. Edit mode
then rendered the fused value as one oversized chip. The operator had
typed commas; the input ignored them.

## Root cause

`toDashed` (`apps/corpora-curator/src/curation.svelte.ts`) is the culprit:

```ts
export function toDashed(s: string): string {
  return s.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean).join('-');
}
```

It splits on **any** non-alphanumeric run — spaces *and* commas alike —
then hyphen-joins everything back. So a whole comma-separated entry becomes
a single dashed token.

Both tag entry points feed the *entire* raw input straight into it as one
tag, with no comma-splitting:

- **Source edit:** `TagBar.svelte` → `curation.applyTag(raw)` → `toDashed(raw)` → one `tag.apply`.
- **Corpus create:** `StrategyPicker.svelte` `addTag(t)` → `toDashed(t)` → one `pendingTags` entry.

(The Authors field, by contrast, *does* comma-split — the inconsistency the
operator reasonably expected the tag field to share.)

## Expected behavior

Commas (and newlines) are **tag separators**; spaces within a segment stay
**word-joiners** (dashed). So:

> `Quantum Computing, Computational Biology` → `["Quantum-Computing", "Computational-Biology"]`

Pasting a comma-separated list into either tag field should create multiple
distinct chips, deduped, each Train-Case-dashed.

## Fix

Add a `splitTags(raw): string[]` helper next to `toDashed` (split on
`[,\n]+`, `toDashed` each segment, drop empties), and route both entry
points through it:

- `applyTag` loops over `splitTags(raw)`, firing one `tag.apply` per new tag.
- `StrategyPicker.addTag` appends every `splitTags(t)` result to `pendingTags`.

Suggestion-click paths pass a single token, which `splitTags` returns
unchanged — no regression.

## Resolution

Fixed 2026-08-02. Note the runtime fix only reaches augment.didi.sh after a
corpora-curator rebuild + redeploy; the already-mangled data on existing
records is corrected separately (the Quantum source's tags were repaired
directly in the canonical layer the same day).

## See also

- [[feedback_tags_train_case]] — the Train-Case convention this preserves.
