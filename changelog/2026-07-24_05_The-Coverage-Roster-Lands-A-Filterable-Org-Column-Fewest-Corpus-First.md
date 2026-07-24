---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "The coverage roster lands — a filterable org column in front of the workbench flow, fewest corpus first"
lede: "The workbench gets its missing first move: a sticky left column listing every org the workspace client can see, filterable by name, sorted by corpus count ascending — so the organizations that could and should have more corpus content surface at the top, zero-corpus in red, one click from their card."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - apps/org-workbench/src/OrgRoster.svelte
  - apps/org-workbench/src/App.svelte
  - apps/org-workbench/src/app.css
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/lib/types.ts
tags:
  - Org-Workbench
  - Corpus
  - Coverage
  - Organizations
---

# The coverage roster — the column in front of the flow

## What shipped ([#32](https://github.com/lossless-group/augment-it/issues/32))

Until now the workbench flow started with a search box — which presumes you
already know which org to work. The actual operator job is often the
opposite: **find the orgs whose corpus is thin.** The new `OrgRoster` column
answers it directly:

- Every organization the workspace client can see (the default filter IS the
  workspace: `client_access CONTAINS` the active client, `reach-edu` today —
  switching workspaces re-scopes the roster automatically).
- Sorted by **corpus count ascending** by default (toggle to descending);
  zero-corpus counts render red.
- Each row: name + `corpus · links · streams · people` counts.
- Name/slug filter box; click a row → the org card opens; every write in the
  workbench refreshes the counts via the existing `entity-updated` event.

Server-side, one new read: `organization.roster` — counts ride `array::len`
over the entity lists plus a graph `count(<-affiliations)` for people; no
arrays cross the wire. Proven live before wiring: 319 reach-edu orgs, with
the long zero-corpus tail the sort is built to surface.

## Lineage

This is **layer 2 of the corpus-coverage issue**
([[context-v/issues/Corpus-Items-Not-Visible-On-Person-Cards-Coverage-Hard-To-Assess|#20]]) —
"the real job: which relevant orgs/people have NO corpus items?" — promoted
from "folds into the component-library sweep" to its own build at the
operator's request. The per-card visibility half shipped this morning; with
the roster, coverage is now assessable end to end: find the gap in the
column, open the card, fill it, watch the count move.

## Verification

Resolver + workspace typechecks clean; svelte-check 93 files / 0 errors;
org-workbench build green; both service containers rebuilt (resolver for the
verb, workspace for the capability map) and reconnected. Operator
walk-through: the roster should open with zero-corpus orgs on top
(Philanthropy Roundtable et al.), filter as you type, and the New America
row should show its 1 corpus item from this afternoon.
