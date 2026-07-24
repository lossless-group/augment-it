---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "List rows show their paths — rounding out the day's four usability fixes"
lede: "The fourth fix of the day: AdditiveList's fallback display becomes host+path instead of hostname alone, so a blog_index stream at gatesfoundation.org/<path> stops masquerading as the root domain and same-domain entries stop being identical twins. With it, all four issues filed from today's workbench sessions are fixed, shipped, and closed — same day."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - apps/org-workbench/src/AdditiveList.svelte
tags:
  - Org-Workbench
  - Usability
  - Pulse-Streams
  - Identity-Links
---

# List rows show their paths

## The fix ([#27](https://github.com/lossless-group/augment-it/issues/27))

The Gates Foundation card made the problem obvious: a `blog_index` pulse
stream rendered as bare `gatesfoundation.org` when the stream lives at a path
— the path IS the stream — and its two `website` identity links rendered as
identical rows. `AdditiveList`'s fallback display stripped the pathname from
every entry in every list.

The fallback is now **host + path** (trailing slash trimmed, `www.` stripped,
capped at 60 characters so tracking-style URLs don't blow up the row);
hostname alone appears only for root URLs. Operator-set stream names (shipped
this morning) still take precedence. It's one function in one component, so
org links, pulse streams, corpus items, and person-card lists all inherit the
fix at once.

## The day's arc

Today's workbench sessions filed issues and closed them the same day — the
full loop (issue doc → gh task → plan → implement → verify → ship → close)
ran four times:

- [#20](https://github.com/lossless-group/augment-it/issues/20) corpus entries
  visible on person cards · [#26](https://github.com/lossless-group/augment-it/issues/26)
  stream names + editable kind · [#25](https://github.com/lossless-group/augment-it/issues/25)
  bio links promotable to affiliations — the three-slice sweep, detailed in
  [[2026-07-24_01_Workbench-Usability-Sweep-Corpus-Entries-Visible-Streams-Editable-Bio-Links-Promotable|the sweep entry]]
  and its [[context-v/plans/Workbench-Usability-Sweep-Corpus-Visibility-Stream-Editing-Affiliation-Promotion|plan]].
- [#27](https://github.com/lossless-group/augment-it/issues/27) — this entry.

Verification: svelte-check 91 files / 0 errors, org-workbench build green.
Operator walk-through: the Gates Foundation card's stream row should now read
the full `gatesfoundation.org/<path>`, and the two website links should be
tellable apart at a glance.
