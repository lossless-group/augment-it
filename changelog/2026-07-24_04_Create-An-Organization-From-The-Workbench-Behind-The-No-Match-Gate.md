---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "Create an organization from the workbench — behind the 'be sure there is no match' gate"
lede: "The workbench could only find orgs that already exist. '+ New organization' opens a gated create: scored candidates from every match signal surface first, picking one just opens it, and creating is an explicit choice past the gate — with the new org's domain seeded so it's matchable from birth."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/record-surrealdb-resolver/src/resolver.ts
  - apps/org-workbench/src/OrgCreateInline.svelte
  - apps/org-workbench/src/App.svelte
  - apps/org-workbench/src/app.css
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/lib/types.ts
tags:
  - Org-Workbench
  - Organizations
  - Candidate-Gate
  - Usability
---

# Create an organization from the workbench

## What shipped ([#29](https://github.com/lossless-group/augment-it/issues/29))

A **+ New organization** button beside the org search opens
`OrgCreateInline` — the third member of the gate family
(`AddPersonInline`, `AddAffiliationInline`). The operator types a name and
optionally a website/domain, and "Find matches" runs the **scored**
candidate path (`resolver.candidates`: slug 100 · domain 90 · fuzzy name
60, with per-candidate link/stream/corpus counts) — not the autocomplete's
lighter name-contains. The gate always shows: picking a candidate simply
opens that org's card (no write); "No match — create" is an explicit
choice past the evidence, never a silent submit.

A created org seeds its `domains[]` from the given site (domain-matchable
from birth, per the bio-promotion precedent) and the website URL lands as
its first `org_links` entry.

## Zero new verbs, one access fix

Creation rides `person.affiliate`'s documented org-only path (no
`person_uuid` → resolve the org, no edge, no observation) — the
"independent decisions" design earning its keep. The one service change is
a fix the flow surfaced: `resolveOrgRow`'s create branch, when the slug
already exists (minted by another client), returned the org without
granting the caller's client access — the follow-up card load couldn't see
its own result. Create-intent now unions `client_access`, consistent with
the shared-canonical / per-workspace-visibility model.

## Verification

Resolver typecheck clean; org-workbench svelte-check 92 files / 0 errors;
org-workbench + shell builds green; resolver container rebuilt and
reconnected to NATS. Operator walk-through: ➕ → type a known org's name
(candidates surface, top one opens on click) → type a genuinely new org
with its domain → gate shows none → create → the card opens with the
website already in its links.
