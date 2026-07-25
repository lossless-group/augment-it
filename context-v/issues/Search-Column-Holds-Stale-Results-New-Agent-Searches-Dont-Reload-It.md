---
title: "The search column holds stale results — a new agent search doesn't reload it"
lede: "The identity-links crawl fills the third column and that's the right home for results — but the column then just stays there. Fire the people/team crawl next and the column keeps showing the previous search's candidates while the new results land somewhere else (or nowhere visible). One results surface, always showing the latest search, is the expectation."
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
  - Search-And-Add
  - Didi-Crawl
  - Org-Workbench
status: Superseded
superseded_by: "[[Concurrent-Agent-Searches-Queue-Into-A-Search-Results-Column]]"
---

# The search column doesn't follow the latest search

## The symptom (operator-reported, 2026-07-24 evening)

1. 🤖 crawl on identity links → the Search & Add column opens with
   candidates. Good — that column is where results belong.
2. Fire the next agent search — the people/team crawl — and the column
   **keeps the old identity-links results**. Nothing tells the operator
   they're looking at a previous search; the new search's activity isn't
   reflected there at all.

## Why (two designs colliding)

- The links/streams crawls ride the Search & Add envelope
  (`augment-it:search-request`), so a NEW envelope does reload the column —
  but only those targets send one.
- The **team crawl deliberately bypasses the column**: its candidates stage
  on the workbench's People section (`StagedPeople`), per the accept-gate
  design. Nothing clears or re-labels the Search & Add pane, so it sits
  frozen on the last envelope — stale results masquerading as current.

The operator's mental model is simpler and better: **the third column is
THE results surface; whatever agent search ran last is what it shows.**

## Direction (jotted)

- Either route team-crawl results into the column too (person-shaped rows
  with the same accept gate the staged section has — the column becomes the
  one home for every crawl's candidates), or
- Keep the split but make the column state honest: a new agent action
  anywhere (team crawl included) clears or visibly supersedes the pane
  ("results from a previous search — re-crawl to refresh"), and the pane
  header always names the search that produced what's shown (target + org +
  when).
- Either way, results want a timestamp/provenance line — "identity links ·
  Quell Foundation · 5:35pm" — so stale can never impersonate fresh
  (the day's recurring stale-state theme;
  [[Crawl-Progress-Is-A-Black-Box-Needs-Traces-The-Operator-Can-Watch]] is
  the sibling on the same pane).

## Open questions

- [ ] Do person-shaped candidates belong in ResultRow (url-centric today) or
  does the column grow a second row type? (The component-library issue
  looms here.)
- [ ] Should the column auto-clear when its launching org card changes
  (roster click elsewhere), independent of new searches?
