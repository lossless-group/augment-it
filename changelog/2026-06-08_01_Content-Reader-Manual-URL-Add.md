---
title: "Content Reader manual URL add — operator pastes a URL from any search, lands in the funder's corpus regardless of domain; spec clarifies Rule 1 binds pack outputs only; exploration filed for in-app browser vs plugin"
lede: "The Funder Content Corpus Workflow's pack layer is doing its job for the records that have crawlable indexes, but for the records where the pack finds nothing the operator was stuck. Manual URL add closes the loop: every Content Reader card now has a collapsed '+ add URL manually' affordance that takes any URL the operator found via their own search, Jina-fetches it, and lands it as a corpus markdown file with `pack_id: manual`. Same-host (Rule 1) is NOT enforced — that rule binds pack outputs only; Rule 5 (operator decides per item) trumps for manual flows. Verified end-to-end with `lawserver.com/law/state/alabama/al-code/alabama_code_41-29-333` posting into `alabama-state-legislature-appropriations-funds/` despite the URL being off-domain. The spec was updated (v0.0.0.2) to make this scope explicit so a future agent doesn't re-add the same-host filter to manual paths. A separate exploration captures the next-step trade-off — embedded in-app browser vs browser plugin/bookmarklet — for shrinking the operator's search → paste round-trip further."
publish: true
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Content-Reader
  - Funder-Corpus
  - Reach-Edu
  - Response-Reviewer
  - Operator-UX
  - Per-Record-Augmentation
files_changed:
  - services/content-ingest/src/handlers.ts (new content_ingest.preview_url handler — fetches operator-pasted URL via Jina, returns PreviewResult with pack_id: "manual" and synthetic response_id; tags same_host in extra_metadata for UI display, does NOT block off-domain URLs)
  - services/workspace/src/capabilities.ts (wires the new capability + 60s timeout)
  - apps/response-reviewer/src/App.svelte (per-card collapsed "+ add URL manually" affordance — URL input → Preview button → editable title + tags → "+ add to corpus" using existing corpus.add; off-domain chip surfaces as info, not a block)
  - apps/response-reviewer/src/app.css (cr-manual / cr-manual-toggle / cr-manual-body / cr-manual-preview / cr-domain-off styles)
  - context-v/specs/Funder-Content-Corpus-Workflow.md (v0.0.0.2 — new "Rule 1 addendum" section clarifying scope, new Step 5b documenting the manual path)
  - context-v/explorations/In-App-Browser-Or-Plugin-For-Corpus-Add.md (NEW — trade-off doc for the next iteration; "ship cheapest of both, observe, then commit" recommendation)
  - clients/reach-edu corpus/ — new manual-add files including the lawserver.com end-to-end verification
---

# Content Reader manual URL add

## Why care

Yesterday's session closed with 81 of 96 funder records producing zero
corpus content via the pack — either the pack found nothing, the row's
URL was wrong, or the funder's site has no walkable index. The pack
layer is the right primary path for the 15 records where it works, but
for the other 81 the operator needs a way to *bring their own URLs* —
URLs they found via their own Google search, their own LinkedIn dig,
their own foundation-directory browsing. Manual add is that path.

It also resolves a quieter tension in the goals spec: Rule 5 (operator
decides per item) and Rule 1 (only the funder's own domain) read like
they apply to the same flow, but they don't. Rule 1 governs pack
discovery; Rule 5 governs the operator. When the operator pastes a URL,
Rule 5 wins.

## What's new

**Backend.** `services/content-ingest` gains a new NATS handler,
`content_ingest.preview_url.requested`. Takes `{record_id, url}`,
validates the URL parses and uses http(s), Jina-fetches it (warming the
existing per-URL cache so a subsequent `corpus.add` is free), returns
the same `PreviewResult` shape used by the bulk preview endpoint with
two manual-flow markers — `pack_id: 'manual'` and a synthetic
`response_id` like `manual-mq5kpndx-bu5e4k`. The preview's
`extra_metadata.same_host` is `true|false` so the UI can show an
"off-domain" chip as information without blocking the operator.
`services/workspace/src/capabilities.ts` wires the new capability with a
60s timeout (single Jina fetch).

**Frontend.** Every Content Reader card — has-content, no-responses,
not-found, invalid-url — now has a collapsed `▸ + add URL manually`
toggle directly under the existing "In corpus:" chip row. Expanded, it
presents a URL input + Preview button. After preview, the operator sees
the same edit-title + add-tags + "+ add to corpus" flow that exists for
pack-discovered URLs; the UI even reuses the same component shape
(`cr-preview` class) so it visually reads as "another item to triage."
On add, the manual draft + preview clear and the new corpus file shows
up in the "In corpus:" chip row on the next render.

**Spec.** `Funder-Content-Corpus-Workflow.md` bumped to **v0.0.0.2**
with two surgical edits. (1) A new "Rule 1 addendum — manual additions
ride Rule 5, not Rule 1" subsection under the hard rules block; states
explicitly that Rule 1 binds pack outputs and that manual paste bypasses
same-host, with the two-paragraph rationale. (2) Step 5 of the workflow
is split into 5a (pack-discovered URLs) and 5b (operator manual paste);
5b spells out the synthetic-response_id and `pack_id: manual`
conventions so a future agent doesn't accidentally collapse them.

**Exploration.** `context-v/explorations/In-App-Browser-Or-Plugin-For-
Corpus-Add.md` is the next-iteration trade-off doc. Two options for
shrinking the operator's search → paste round-trip further — Option A
(in-app browser / search surface) and Option B (browser plugin or
bookmarklet) — with cheap-version-of-each first and a "ship both
cheaply, observe which the operator reaches for, then commit" finish.

## How it works

End-to-end verified at session-end with the URL the operator pasted in
the live cockpit:

- Input: `https://www.lawserver.com/law/state/alabama/al-code/alabama_code_41-29-333`
- Active record: Alabama State Legislature Appropriations Funds
- Output file:
  `clients/reach-edu/corpus/alabama-state-legislature-appropriations-funds/2026-06-08_alabama-code-41-29-333-alabama-office-of-apprenticeship-powe.md`
- Frontmatter on the file:
  - `pack_id: "manual"`
  - `response_id: "manual-mq5kpndx-bu5e4k"`
  - `exact_url: "https://www.lawserver.com/..."` (preserved exactly)
  - Operator-supplied tags: `Relevant-Regulations`, `State-Legislation`
- `lawserver.com` is not on any funder's domain — off-domain chip
  displayed in the preview but did not block the add, which is the
  whole point.

Same backend code path as the pack-discovered flow once the preview
exists — `corpus.add` doesn't know or care whether the response_id is
real or synthetic. The corpus markdown's `pack_id: manual` is the only
field downstream consumers can use to distinguish provenance, and that's
deliberate (cross-funder synthesis can choose to weight pack-discovered
vs manually-added URLs differently if it wants).

## What's still loose

- **The friction of leaving Augment-It to do the search.** Manual add
  helps, but the operator still has to open Google, find a URL, copy,
  switch back, scroll to the right card, expand, paste. The exploration
  doc filed in this session sketches two ways to shrink that loop
  (in-app SERP / browser plugin); neither shipped here. The cheapest
  version of either is "minutes of work" — a Google-search-link button
  pre-filled with the funder name on each card (Option A minimum), or a
  bookmarklet that opens an Augment-It popup with the active-tab URL
  pre-filled (Option B minimum). Worth A/B-ing.
- **No "where did this come from" trace beyond `pack_id: manual`.**
  The corpus frontmatter doesn't record *what search* surfaced this URL
  for the operator, or whether they were referred from a foundation
  directory vs a press wire vs LinkedIn. Probably fine for v1; might
  matter later if cross-funder synthesis wants to reason about source
  diversity.
- **No re-edit affordance.** Once a corpus markdown is written, editing
  its title or tags requires opening the file directly in the
  per-client repo. The Content Reader doesn't surface an "edit corpus
  entry" path yet. Comes up if the operator wants to fix a typo'd
  title without leaving the cockpit.
- **The verification was a single URL on a single record.** Lots of
  edge cases not exercised yet — very long titles (slug truncation),
  unicode, query-string URLs, URLs that redirect, URLs that 404, URLs
  that Jina returns empty for. The existing pack path has shaken these
  out for pack-discovered URLs; the manual path almost certainly
  inherits the same handling but hasn't been stress-tested.
