---
title: "List rows show hostname only — the path is hidden, so same-domain entries are indistinguishable"
lede: "Gates Foundation's blog_index stream renders as bare 'gatesfoundation.org' when the stream lives at a path — and its two 'website' identity links render identically. AdditiveList's display strips the pathname, hiding exactly the part that tells entries on one domain apart."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Usability
  - Augment-It
  - Org-Workbench
  - Pulse-Streams
  - Identity-Links
status: Open
---

# List rows show hostname only; paths hidden

## The symptom (screenshot-confirmed, 2026-07-24)

On the Gates Foundation card:

- **Pulse streams:** `blog_index · gatesfoundation.org` — but the stream URL is
  `gatesfoundation.org/<path>`; the path IS the stream, and it's invisible.
- **Identity & social links:** two rows both reading `website ·
  gatesfoundation.org` — different URLs, identical display. The operator
  can't tell them apart without hovering or clicking.

Once an org has three streams on its own domain (the exact scenario the
stream-name work anticipated), a hostname-only display makes the list
unreadable.

## Why

`AdditiveList.svelte`'s `host()` helper renders `new URL(u).hostname` only —
the pathname is dropped for every entry in every list (org links, streams,
corpus, person links; person cards inherit the same component). Stream `name`
(shipped earlier today, [[Pulse-Streams-Need-Editable-Kind-And-User-Facing-Names]])
takes precedence when set, but the fallback display for everything else loses
the distinguishing segment.

## The fix

Render `host + pathname` (trailing slash trimmed, `www.` stripped) as the
fallback display, hostname alone only when the path is root. Cap the rendered
length so deep tracking-style URLs don't blow up the row. One component, every
list inherits.
