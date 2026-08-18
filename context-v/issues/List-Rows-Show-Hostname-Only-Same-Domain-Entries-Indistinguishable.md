---
title: "List rows show hostname only — the path is hidden, so same-domain entries are indistinguishable"
lede: "`AdditiveList`'s `host()` drops the pathname, so two Gates Foundation links both render as `gatesfoundation.org` and can't be told apart."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Usability
  - Augment-It
  - Org-Workbench
  - Pulse-Streams
  - Identity-Links
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped 2026-07-24 in 15c5cb8 — AdditiveList fallback display is host+path (60-char cap); every list inherits. gh #27 closed."
site_uuid: 95970243-fd4d-4f4a-9378-7f1744863ed3
hex_code: 76xsos
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
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
