---
title: "Org Workbench in a narrow pane — the roster doesn't collapse, and the org card's contents spill out of their container"
lede: "In a narrow pane the roster keeps its 300px and the card's link rows overflow — the flexbox `min-width: auto` trap, twice."
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
  - Layout
  - CSS
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped 2026-07-24 — min-width:0 down the card's flex/grid chain (+ .ow-url flex:1 so ellipsis engages), roster auto-hides under 860px with the ◀/▶ orgs toggle. Browser-drive verified at 720px on the Sterling card: 0px card overflow, 0px link spill, toggle round-trips. gh #38 closed."
site_uuid: 021285a9-a43d-4ac3-9df0-fc06e855ccbb
hex_code: 04m8qs
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# Narrow-pane workbench: roster hogs, card spills

## The two symptoms (screenshot-confirmed, 2026-07-24 evening)

1. **Roster doesn't yield.** The coverage roster keeps its 300px in a pane
   that can't afford it. Wanted: auto-hide below a width threshold, plus an
   always-available show/hide toggle so the operator can override either way.
2. **The card doesn't contain its contents.** Long link URLs
   (theorg.com/org/…) and people rows run past the org card's right border
   at whatever width they like. Cause: `.ow-url` has ellipsis styling but is
   a flex item with implicit `min-width: auto`, so it never shrinks — the
   row grows instead, and the same rule bites the `.ow-lists` grid items
   and the person-row spans.

## The fix (this doc precedes the implementation by minutes)

- `min-width: 0` at every level that must shrink: the card, the lists-grid
  items, the entry rows, `.ow-url` (with `flex: 1 1 auto` so ellipsis
  actually engages), and the person-row name/role spans (ellipsis).
- App-level: measure the columns wrapper (`bind:clientWidth`); roster
  auto-hides under ~860px; a compact toggle beside the search row shows
  "◀/▶ orgs" and overrides the auto behavior in either direction.
- This narrows the gap the component-library issue
  ([[No-Component-Library-UI-Improvised-Not-Component-Based]]) will close
  properly — containment rules belong in shared list components, not
  re-discovered per remote.
