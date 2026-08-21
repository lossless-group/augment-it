---
title: "Tokens landed, components didn't — the UI needs an overhaul, and the drift linter can't see the problem"
lede: "19 of 20 apps consume the theme package; shared-ui ships exactly two components. Every remote hand-rolls its own buttons, pills, and empty states against shared colours."
date_created: 2026-08-21
date_modified: 2026-08-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Design-System
  - Component-Library
  - Usability
  - Microfrontends
  - Org-Workbench
  - Theme-System
status: Open · Diagnosed · Scoped from a live prod screenshot + drift audit
site_uuid: e862574a-3e21-4ee3-b3f7-bf99ce83f28f
hex_code: 03hrzx
date_authored_initial_draft: 2026-08-21
date_authored_current_draft: 2026-08-21
publish: true
---

# Tokens landed, components didn't

## Why Care?

[[No-Component-Library-UI-Improvised-Not-Component-Based]] was jotted on
2026-07-24 and still reads `Open · Jotted`. This issue is not a restatement of
it — it is the **measurement** that closes the diagnosis, taken a month later
against the live prod surface, plus the finding that our automated design
guardrail is structurally blind to the actual defect.

The short version: **the token half of the design system shipped and the
component half did not.** We now have the worst configuration of the two —
enough shared infrastructure to believe the problem is handled, not enough to
make any two surfaces look related.

## The measurement

| Signal | Value |
|---|---|
| Apps depending on `@augment-it/theme` | **19 of 20** |
| Components exported by `packages/shared-ui/src` | **2** — `ConfidencePill.svelte`, `ToggleHeader__PromptOrPackage--Icons.svelte` |
| Apps importing anything from `shared-ui` | **3** (`pack-runner`, `prompt-template-manager`, `response-reviewer`) + `shell` |
| `node scripts/design-drift.mjs` | **99 fail · 0 warn**, across **16 apps** |
| Contrast pairs | **30/30 pass** |

Drift failures by rule:

| Count | Rule |
|---|---|
| 53 | `F8` hardcoded hex colour outside `packages/theme` |
| 17 | `F6` no `DESIGN.md` at member root |
| 22 | `F4` raw `z-index` (values 1, 2, 5, 10, 15, 20, 50, 90, 100, 200) |
| 6 | `F8` hardcoded `box-shadow` outside `packages/theme` |
| 1 | `P2` tier-2 token `--font-mono` missing in light vibrant |

The `z-index` spread is its own small horror: ten distinct raw values competing
across remotes with no shared stacking contract. That is a layering bug waiting
for the first overlay that needs to sit above a `200`.

## The finding that matters most: the linter is blind to this

**`org-workbench` produces zero drift failures.** It is token-clean — no
hardcoded hex, no raw z-index, nothing. And it is the exact surface in the
screenshot that reads as improvised.

That is the whole problem in one data point. `design-drift.mjs` checks
*values* — is this colour a token, is this z-index a token, is there a
`DESIGN.md`. It cannot check *form*: whether a button is the same shape,
height, radius, and weight as the button on the surface next to it. A remote
can pass every rule we have and still invent its own visual dialect, because
nothing in the toolchain has an opinion about components.

So the 99 failures are real and worth fixing, but closing all 99 would **not**
fix the screenshot. We would have 16 apps hand-rolling divergent components out
of perfectly compliant tokens.

## What the prod screenshot actually shows

From Org Workbench on `augment.didi.sh`, reach-edu workspace:

- **Three button dialects in one 900px row** — `+ New organization` (flat, dark,
  square-ish), `📋 Relevance brief` (lighter fill, different radius, emoji
  glyph), `◀ orgs` (third fill, third radius, arrow glyph).
- **A `closed` status pill** floating unanchored in the top-right, overlapping
  the header's baseline rather than sitting in a defined status slot.
- **A dead 900px void** below the intro copy — no empty state, no skeleton, no
  error surface. (The *reason* it is empty is
  [[Every-Remote-Hardcodes-The-Workspace-WS-To-Localhost-So-Prod-Loads-No-Data]];
  the fact that emptiness renders as an unstyled void is this issue.)
- **A crowded, mixed-metaphor header** — monospace `augment-it · shell`,
  underlined `FLOW`, a numbered pill, chat/queue/Developers/account/Dark/Reach
  Edu controls in at least four different shapes and three different border
  treatments.
- **Chat rail content vertically centred** in a tall column, so the prompt
  hint floats mid-void with no visual anchor.

Notably the *colours* are fine — dark ground, purple accent, readable text,
30/30 contrast pairs passing. It is the **shapes, spacing, and states** that
have no shared grammar. Which is precisely what tokens-without-components
predicts.

## Why it went this way

The honest account is in [[No-Component-Library-UI-Improvised-Not-Component-Based]]
and holds up: remotes were built fast, independently, each solving its own UI
in isolation, and Module Federation made that independence frictionless. The
theme package was the cheap win — a CSS import and a dependency line — so it
propagated to 19 apps. A component library is the expensive win, because it
requires agreeing on an API and then *migrating* sixteen call sites. It stalled
at two components.

This is also the tail of the same pressure recorded in
[[Refactoring-for-API-Speed]] and [[No-Test-Coverage-TDD-Deferred-Despite-Agentic-Fit]]:
infrastructure that is one import away lands; infrastructure that requires
coordinated migration does not.

## What an overhaul should actually do

Sequenced so each step is shippable on its own:

1. **Name the primitives.** From an audit of what the 16 remotes already
   hand-roll, the recurring set is roughly: `Button` (primary/secondary/ghost),
   `Input`, `Pill` / `Badge` (incl. connection status), `Card`, `EmptyState`,
   `ErrorState`, `Skeleton`, `Toolbar`. Ratify that list before writing any of
   it.
2. **Fix the stacking contract first** — it is the cheapest high-leverage fix.
   Define `--z-*` tokens covering the ten values in use and convert all 22
   raw `z-index` sites.
3. **Build the primitives in `packages/shared-ui`**, matching the two existing
   components' conventions so `ConfidencePill` does not become an orphan
   dialect.
4. **Migrate surface by surface, most-visible first** — Org Workbench, then
   `search-and-add` / `search-results` (the rest of the Augment-from-DB flow),
   then corpora-curator and chat. Each migration is one PR and one changelog
   entry.
5. **Standardise the connection-status slot** as part of step 4 — every remote
   has the same `'connecting' | 'open' | 'closed' | 'error' | 'auth_required'`
   state and each renders it differently, or (per the sibling issue) not
   meaningfully at all.
6. **Retire the 53 hardcoded hex values** as a by-product of migration rather
   than as a separate sweep — most of them live in components that are about to
   be replaced.
7. **Teach the linter about form.** Add a rule that flags a remote defining its
   own `button` / `input` / pill styling when a `shared-ui` primitive exists.
   Without this, step 4 decays exactly the way the theme rollout did.
8. **`DESIGN.md` per member** — 17 apps lack one. Cheap, and the
   `maintain-design-md` skill already specifies the shape. Do it last; it
   documents the outcome rather than driving it.

## Open questions for the operator

- **Is this an overhaul or a rebuild?** The steps above are incremental and
  preserve every surface. A genuine visual redesign — new layout language, new
  header, new information density — is a different and larger piece of work.
  The screenshot's header crowding hints you may want the latter.
- **Does the shell header get redesigned separately?** It is the one surface
  every flow inherits, and [[Header-Polish-Flow-Label-Chat-Toggle-Placement-Shell-Suffix]]
  already has scope on it.
- **Should this supersede [[No-Component-Library-UI-Improvised-Not-Component-Based]]**,
  or sit under it as the measured follow-up? Recommend the latter — that issue
  holds the origin story, this one holds the numbers and the plan.

## Related

- [[No-Component-Library-UI-Improvised-Not-Component-Based]] — the 2026-07-24 admission this measures
- [[Every-Remote-Hardcodes-The-Workspace-WS-To-Localhost-So-Prod-Loads-No-Data]] — why the screenshot's main pane is empty
- [[Org-Workbench-Narrow-Layout-Roster-Doesnt-Collapse-Card-Contents-Spill]] — a layout symptom of the same absence
- [[Header-Polish-Flow-Label-Chat-Toggle-Placement-Shell-Suffix]]
- [[Live-Not-Live-Indicator-Tooling-And-Cross-Service-Error-Surfacing]] — the status-slot half
