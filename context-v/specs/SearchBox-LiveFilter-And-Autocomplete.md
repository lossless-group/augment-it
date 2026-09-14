---
title: "SearchBox — LiveFilter and Autocomplete"
lede: "A subsidiary spec. Two named variants over one private core, because the keyboard contract must exist exactly once and the two differ only in where options come from."
date_created: 2026-09-14
date_modified: 2026-09-14
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Active
parent_spec: "[[Component-API-Contract-And-The-Control-Scale]]"
tags:
  - Spec
  - Augment-It
  - Design-System
  - Component-Library
  - Accessibility
  - SearchBox
site_uuid: ce905ead-f039-4006-bb28-d386a25ebee3
hex_code: u4220p
date_authored_initial_draft: 2026-09-14
date_authored_current_draft: 2026-09-14
publish: true
---

# SearchBox — LiveFilter and Autocomplete

> **Subsidiary spec.** The federal component contract — the override ladder, the
> control scale, the token rules, rung 0 layout — lives in
> [[Component-API-Contract-And-The-Control-Scale]] and is **not restated here**.
> This documents only what is specific to the SearchBox family, because it has
> nuances the general contract does not cover.
>
> Sibling organs are registered in [[Design-System-Convergence]].

## Why Care?

Six members ship a text input that narrows a list you then pick from. Two of them
already declare a composite ARIA role with no keyboard implementation, and every
one of them hand-rolls the same machinery.

**This is the first organ where the input keeps focus.** Every other selection
component in the federation moves focus to the thing you are choosing.
`Selector--Listbox` and `Selector--Menu` use a **roving tabindex**: the active
option is `tabindex="0"`, focus lands on it, and the screen reader reads the
option because it is focused.

A SearchBox cannot do that — **the user is still typing.** Moving focus to an
option would take the caret out of the input. So the active option is announced
via `aria-activedescendant` while focus never leaves the input.

That single difference is why this is not a `Selector--` variant. It is a
different keyboard contract, not a different appearance.

## The two variants, and the axis they sit on

```
SearchBox--LiveFilter      options come from a prop, narrowed in memory
SearchBox--Autocomplete    options come from an async function
```

The axis is **where options come from**, and it is not cosmetic. Measured across
the six members:

| | `--LiveFilter` | `--Autocomplete` |
|---|---|---|
| source | `curation.suggestTags(input)` — derived | `await lookup(term)` — fetched |
| failure modes | none | stale response, network error, timeout |
| needs debounce | no | yes |
| minimum query length | no | yes — two members gate at 2 chars |
| distinguishable states | open / closed | **idle · typing · loading · results · no-results · error** |

`--Autocomplete` has four states `--LiveFilter` does not have, and **two members
independently hand-rolled the same stale-response guard**:

```ts
if (seq === lookupSeq) { suggestions = r; }
```

Without it, a slow response for `"aa"` can land after a fast one for `"aardvark"`
and replace correct suggestions with stale ones. It is invisible in testing and
common in use.

## Why they nest into a private core rather than into each other

Nesting was considered in both directions and neither works:

- **`Autocomplete` wrapping `LiveFilter`** filters twice. The server already
  narrowed by the query; filtering again by the same string discards fuzzy
  matches, aliases and ranked-but-not-prefix results the server deliberately
  returned.
- **`LiveFilter` wrapping `Autocomplete`** inverts the dependency — the async
  concern is the outer one.

What they share is **neither variant**: it is the input, the popup, and the
keyboard. So:

```
SearchBoxCore.svelte       NOT exported — input, popup, keyboard, ARIA
SearchBox--LiveFilter      thin: narrows a prop
SearchBox--Autocomplete    thin: debounce, stale guard, states
```

**`SearchBoxCore` is deliberately absent from `package.json` exports.** Members
see only the two named variants, so there is no third thing to choose between and
the census still reads cleanly. This is one private file, not an abstraction
layer.

The keyboard contract therefore exists **exactly once** and cannot drift between
the variants — which matters, because that contract is the entire reason the organ
exists.

## The keyboard contract

Straight from the WAI-ARIA combobox pattern. Each line is a test.

1. **The input keeps focus, always.** Arrows never move it.
2. **`aria-activedescendant`** on the input names the active option's id; the
   option carries `aria-selected="true"`. No option is ever `tabindex="0"`.
3. **`role="combobox"`** on the input, with `aria-expanded` tracking the real
   popup state and `aria-controls` naming a listbox **that exists**.
4. **ArrowDown opens a closed popup** without moving the caret.
5. **Escape closes** — and a second Escape clears the input. It does not return
   focus anywhere, because focus never left.
6. **Enter picks the active option.** With none active, Enter is the member's own
   submit, not the widget's.
7. **Blur closes**, but not before a click on an option has registered.

## Naming

`SearchBox` fits five of the six. `corpora-curator`'s is
`placeholder="add a tag…"` — picking, not searching. `PickerInput` would cover
all six and be a worse word for the five, so the one stretch is accepted
deliberately.

The rejected alternative is recorded because the reasoning generalises:
**`SearchBox__Suggestive--AutocompleteLiveFilter`**. `__Suggestive` misuses
BEM's element syntax for an adjective — `__` names a *part* of a block, and
"suggestive" is not a part. And `AutocompleteLiveFilter` stacks three words for
one idea, so the modifier discriminates nothing. Splitting those words across the
two variants is what turned them into a real axis.

Per the naming principle in [[../decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection]]:
the census query is the **import path**, never the tag, because a Svelte tag must
be a valid identifier and each member aliases it however it likes.

## Out of scope

- **Multi-select.** Every sighting picks one. `aria-multiselectable` is not
  implemented until something needs it.
- **Free text as a value.** `corpora-curator` allows a tag that matches nothing;
  that stays the member's Enter handler, not the widget's.
- **Grouped options.** No sighting has them.

## Related

- [[Component-API-Contract-And-The-Control-Scale]] — **the parent spec**
- [[Design-System-Convergence]] — the organ registry
- [[../loops/Adopt-Selector-In-One-Member]] — the adoption loop this reuses
- [[../plans/Build-Selector-And-Close-The-Keyboard-Contract]] — the sibling keyboard arc
