---
title: "Workspace-scope legibility — empty workspaces and stale org restores should explain themselves, not look broken"
lede: >-
  Switching to a workspace with 0 orgs made the workbench look dead — the visibility rules were right, only the messaging failed.
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Plan
  - Augment-It
  - Org-Workbench
  - Workspaces
  - Usability
status: Draft
site_uuid: fd7c230a-c607-44e4-aaff-3b23728e0de7
hex_code: p985yr
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# Workspace-scope legibility

## Diagnosis (live-verified 2026-07-24)

`humain-vc` has **0** organizations in the canonical layer; all 319 carry
`client_access: [reach-edu]`. With the workspace on humain-vc the workbench
showed: an empty roster ("no orgs match" — wrong message, right data), and
"organization not found: new-america" (App restores the last-worked org from
localStorage; the org exists but isn't visible from this workspace). The
system behaved exactly per [[../../CLAUDE.md]]'s canonical-tagging model;
only the *messaging* failed. Operator's read: "no organizations are loading."

## Steps

1. **Roster empty-state distinguishes empty-workspace from empty-filter.**
   `OrgRoster.svelte`: when the server returned 0 rows, render "Workspace
   ‹client› has no organizations yet" (+ a hint that ➕ New organization
   creates the first one, and that other workspaces' orgs are hidden by
   design). "no orgs match" stays only for a non-empty roster narrowed to
   nothing by the filter box.
2. **Active-org restore becomes per-workspace.** `App.svelte`: key the
   localStorage slot by client (`augment-it:org-workbench:active-org:<client>`)
   so switching workspaces restores *that workspace's* last org (or nothing)
   instead of failing on another's. Migrate the old un-keyed value once.
3. **Cross-workspace not-found reads as scope, not error.** When a restored
   load fails, clear the stored slot and show a neutral note ("‹slug› isn't
   visible in workspace ‹client›") instead of the red error band. Manual
   loads keep the error styling — a click that fails IS an error.
4. **Verify** — svelte-check + build; walk-through: on humain-vc the roster
   explains itself and no red error appears; back on reach-edu the roster
   and last-worked org return. Frontend-only; no service or container work.
5. Changelog rider on the day's entries; commit per [[git-conventions]].

## Non-goals

- No cross-workspace org browsing or client_access editing — visibility
  stays per-workspace by design ([[../issues/Merge-Organizations-Or-People-Non-Destructive-Dedupe]]
  and the unlock flow own the sharing questions).
- No workspace-switcher changes in the shell.
