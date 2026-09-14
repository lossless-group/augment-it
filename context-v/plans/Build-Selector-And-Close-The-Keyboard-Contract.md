---
title: "Build Selector and close the keyboard contract"
lede: "Nine surfaces declare a keyboard widget. Zero implement one. This is the first component whose whole substance is behaviour, so it is the first one with real tests."
date_created: 2026-09-14
date_modified: 2026-09-14
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Active
tags:
  - Plan
  - Augment-It
  - Design-System
  - Accessibility
  - Selector
  - Testing
site_uuid: cf111bbe-ad9d-4930-8da8-271c856af97b
hex_code: uzjg21
date_authored_initial_draft: 2026-09-14
date_authored_current_draft: 2026-09-14
publish: true
---

# Build Selector and close the keyboard contract

## Why Care?

Nine surfaces across seven members declare `role="menu"`, `role="listbox"` or
`role="radiogroup"`. **Not one implements arrow-key navigation.**

```
chat/ChatSurface                    arrowkeys=0
org-workbench/OrgSearch             arrowkeys=0
response-reviewer/ConnectorPalette  arrowkeys=0
sort-filter-lens/App                arrowkeys=0
search-and-add/ProviderPalette      arrowkeys=0
pack-runner/ConnectorPalette        arrowkeys=0
shell/DevelopersMenu                arrowkeys=0
shell/JumboPopdown                  arrowkeys=0
shell/WorkspaceSwitcher             arrowkeys=0
```

Each of those roles is a **promise to a screen-reader user**: *this is a widget
you navigate with arrows, and Tab will take you out of it.* All nine deliver a
list of tab stops instead. Two go further and declare `role="menu"` with no
`menuitem` children at all; one declares `role="radiogroup"` containing no
radios — a widget a screen reader announces as structurally broken.

**Seven members got this wrong independently**, which is the tell. It is not
carelessness. **The roving-tabindex contract is the substance of the organ**, and
nobody should be hand-rolling it seven times.

## What makes this different from the first three

`Button`, `Chip` and `CardRow` are **appearance** with a little behaviour.
`Selector` is **behaviour** with a little appearance. That changes the method:

| | first three | Selector |
|---|---|---|
| verified by | rendering and measuring | **keypresses and focus assertions** |
| a defect looks like | wrong pixels | *nothing happens* |
| caught by | a probe screenshot | **a test** |

The three primitives shipped with defects that rendered perfectly —
`display: contents` passing every gate while Tab skipped every row, found only
because five engineers measured by hand. **A behaviour component cannot be
verified that way**, so this is the first one with real tests.

`packages/shared-ui` has no test setup today. `apps/corpora-curator` has a
working `vitest` + `jsdom` + `vite-plugin-svelte` config with 12 passing
tests — mirror it rather than invent one.

## The contract

Straight from the WAI-ARIA authoring practices for composite widgets. Each line is
one failing test first.

1. **One tab stop for the whole widget.** The active option is `tabindex="0"`,
   every other option `tabindex="-1"`. Tab enters and Tab leaves — it does not
   walk the options.
2. **Arrow keys move the active option**, and move focus with it.
3. **Home / End** jump to first / last.
4. **Typeahead**: a printable character moves to the next option starting with it.
5. **Enter / Space** activate. **Escape** closes a popup variant and returns
   focus to its trigger.
6. **The role triad is consistent** — `listbox`/`option`/`aria-selected`, or
   `menu`/`menuitem`, or `radiogroup`/`radio`/`aria-checked`. Never a
   container role with the wrong children, which is what all nine ship today.
7. **Wrapping is a decision, not an accident** — and the same one everywhere.

## The variants, on the what-you-click axis

Same naming rule as `SelectWrapper`: **spell the variant.** The census query is
the import path, not the tag — see the decision doc.

- **`Selector--Listbox`** — choose from a set. `aria-selected`. The
  workspace-switcher and provider-palette shape.
- **`Selector--Menu`** — a list of *actions*. `menuitem`, no selected state.
  The popdown shape.
- **`Selector--Radio`** — choose exactly one, and it is a form value. **Zero
  sightings today**, so it is not built until one appears.

## The loop, per member

Given in full by the operator, and it differs from the previous sweeps in one
important way — **the test comes before the refactor**:

1. Read the spec, this plan, and the adoption loop.
2. Identify the custom code the federal component replaces.
3. **Open a gh issue.**
4. **Write a test that FAILS** against the member's current markup — the arrow
   key that does nothing, the missing `tabindex="-1"`, the `role="menu"` with
   no `menuitem`.
5. Refactor onto `Selector`.
6. **Make the test pass.**
7. Write discoveries into `context-v/issues/`.
8. Report back for verification.
9. On verification: changelog, then commit.

**A failing test first is the point.** Every previous sweep measured *after* the
change and inferred the defect; this one states the defect as an executable claim
before touching anything. It is also the only way to prove the nine surfaces were
genuinely broken rather than merely undocumented.

## Order

**`shell` last.** It hosts every remote; three of the nine surfaces are its own
chrome, and a regression there is a regression in all twenty members at once.

Otherwise: the two `ConnectorPalette` copies first, because they are a declared
converged twin and already diverging — whatever is decided there applies to both
and should be decided once.

## What "done" looks like

- Nine surfaces on `Selector`, or explicitly raised as a different organ.
- `rg 'role="(menu|listbox|radiogroup)"'` matching **only** surfaces with a
  real keyboard implementation.
- A test file per adopting member.
- Federation gate not increased. `pnpm verify` clean. `pnpm organ:census`
  showing `Selector--*`.

## Related

- [[../decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection]] — D4
- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the ladder
- [[../loops/Adopt-The-Shared-Button-In-One-Member]] — the mechanical half
- [[../issues/A-Silently-Ignored-Alias-Pointed-A-Probe-At-Production]] — probe safety
