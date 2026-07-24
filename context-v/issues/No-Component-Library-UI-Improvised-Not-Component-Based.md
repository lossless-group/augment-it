---
title: "No component library — the UI is improvised per-remote instead of component-based, and it's starting to show"
lede: "For expediency, agents have improvised working UI in each remote — and it worked, fourteen remotes' worth. But the bill is arriving: the UI is getting visually funky, near-identical widgets exist in parallel dialects (status pills, additive lists, candidate pickers, chip palettes), and a ton of code is almost certainly redundant. Time to decide what Component-Based Architecture means under this repo's copy-don't-depend rules."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Oversight
  - Usability
  - Augment-It
  - Component-Library
  - Design-System
  - Microfrontends
status: Open · Jotted
---

# No component library — improvised UI across fourteen remotes

## The admission

Every remote's UI was improvised by agents under ship pressure. Each app
namespaces its CSS (`.rc-*`, `.pdr-*`, `.ow-*`, `.saa-*`, …) and re-invents
the same organs locally. It worked — fourteen shipped remotes prove it —
but the compounding costs are now visible:

- **The UI is getting funky.** Sibling remotes solve the same problem with
  slightly different visuals and behaviors; the app reads as a collection
  of sessions, not a product.
- **Redundancy.** Known near-duplicates, off the top of a scan:
  - WS status pill + client badge header (every remote, copied N times)
  - Additive URL list with ➕ form (org-workbench's `AdditiveList`;
    affiliation-rating-resolver's four lists; person-enrichment's
    `LinkList`)
  - Candidate pickers with score + match_reason (record-db-resolver,
    person-db-resolver, org-workbench's `AddPersonInline` gate)
  - Connector/provider chip palettes (pack-runner, response-reviewer,
    search-and-add)
  - Debounced autocomplete (person-enrichment org picker, person-db-resolver,
    org-workbench `OrgSearch`)
  - Result/source rows with one-click action (response-reviewer,
    strategy-curator `SourceList`, search-and-add `ResultRow`)
- **Agent drift amplifies it.** Each new remote copies whichever sibling
  the session happened to read, forking dialects further.

## The constraint that shapes any fix

Two standing rules bound the solution space:

1. **No shared runtime dependency across the three ai-labs apps**
   (augment-it / dididecks / memopop) — patterns travel knots-style
   (blueprint + copy-from), never as a package across apps.
2. **Within augment-it**, a shared package is allowed and precedented —
   `packages/shared-ui` already exists (ConfidencePill, ToggleHeader) and
   `packages/theme` proves the intra-repo-package path works across
   federation (imported per-remote at build time, no shared federation
   runtime).

So the real question is *intra-repo*: grow `packages/shared-ui` into a real
component library, or codify components as copy-templates with a canonical
source per organ? (Or the hybrid: primitives in shared-ui, composites as
copy-templates.)

## Directions worth weighing (not decided)

- **Inventory first.** A one-session audit producing the canonical list of
  duplicated organs (the six above + whatever the sweep finds), each with
  its "best current implementation" named — that's the component library's
  table of contents regardless of packaging choice.
- **DESIGN.md + tokens discipline.** The funkiness is partly visual drift;
  `packages/theme` tokens exist but per-remote CSS re-hardcodes fallbacks
  and spacing ad hoc. A DESIGN.md contract (per the maintain-design-md
  practice) would give agents the palette of *moves*, not just colors.
- **Migration is incremental by construction** — remotes are federated, so
  each can adopt shared components one at a time; no big-bang.
- **New-code rule candidate:** before writing a new widget, check the
  inventory; extend-or-adopt beats improvise. (Belongs in CLAUDE.md and
  the loop doc's plan-authoring step once the inventory exists.)

## Open questions

- [ ] `packages/shared-ui` as the home (build-time import per remote), vs
  copy-template canon, vs hybrid — what's the deciding criterion?
  (Leaning hybrid: primitives shared, flow-specific composites copied.)
- [ ] Does Svelte 5 + module federation put any real constraint on sharing
  components (each remote owns its Svelte runtime — components compile
  per-remote, so likely fine — verify once with a real widget).
- [ ] Sequence relative to [[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]]:
  extracting components without tests risks silent regressions across
  fourteen remotes; tests-then-extract or extract-with-tests-per-organ?
- [ ] Relationship to the usability pass the v1 milestone named — the
  component inventory and the usability iteration probably want to be the
  same sweep.
