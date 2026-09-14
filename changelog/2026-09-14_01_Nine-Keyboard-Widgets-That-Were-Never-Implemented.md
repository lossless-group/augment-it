---
title: "Nine Keyboard Widgets That Were Never Implemented"
lede: "Seven members promised a screen reader arrow-key navigation and none delivered it. Closing that took six more primitives — and the first tests this federation has ever had."
publish: true
date_authored_initial_draft: 2026-09-14
date_authored_current_draft: 2026-09-14
date_work_started: 2026-09-14
date_work_completed: 2026-09-14
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
summary: >-
  Six primitives built and swept: Selector (two variants), MenuItem,
  DisclosureRow, StatusIndicator, CountBadge, SearchBox (two variants over a
  private core) and ExternalLink. 539 call sites across the federation. This is
  the first arc verified by tests rather than by screenshots, because it is the
  first where a defect looks like nothing happening — and the tests immediately
  found that the components themselves were broken in ways every gate had passed.
  Also: the drift checker was reading comments as code, so documenting a deletion
  re-created it; and a browser drive on the host caught a silent layout change
  latent in every member that had adopted a row component.
site_uuid: 2130e951-1740-4141-8421-4277d0edf15f
hex_code: ovb6rf
files_changed:
  - packages/shared-ui/src/
  - packages/shared-ui/test/
  - scripts/design-drift.mjs
  - context-v/specs/SearchBox-LiveFilter-And-Autocomplete.md
  - context-v/plans/Build-Selector-And-Close-The-Keyboard-Contract.md
  - context-v/loops/Adopt-Selector-In-One-Member.md
  - apps/
  - shell/
tags:
  - Changelog
  - Augment-It
  - Design-System
  - Accessibility
  - Testing
  - Component-Library
---

# Nine Keyboard Widgets That Were Never Implemented

## Why Care?

| | |
|---|---|
| Composite roles with no keyboard | **9 → 0** |
| New primitives | **6** (9 exported components) |
| Federal call sites | **539** across 19 units |
| Component tests | **99**, from zero |
| Members with a test suite | **11**, from 1 |
| Federation gate | 66, contrast 30/30, 22/22 units verify |

Seven members declared `role="menu"`, `role="listbox"` or `role="radiogroup"`
— each of which is a **promise to a screen-reader user**: *this is a widget you
navigate with arrows, and Tab takes you out of it.* **Not one implemented it.**
Two declared `role="menu"` with no `menuitem` children; one declared a radio
group containing no radios.

Seven members got it wrong independently. That is the tell: the roving-tabindex
contract **is** the organ.

## This is the first arc with tests, and it had to be

`Button`, `Chip` and `CardRow` are appearance with a little behaviour — a
probe screenshot catches their defects. `Selector` is the inverse. **A broken
keyboard renders perfectly.**

So 99 tests, most written before the component existed. And they immediately
earned their keep by finding that **my own components were broken**:

- **`SelectWrapper--ClickBody` was keyboard-dead.** `display: contents`
  generates no layout box, so the button was **not focusable** — while reporting
  `tabIndex="0"`, carrying a correct accessible name, and working with a mouse.
  Three engineers found it independently; one measured tab stops going 37 → 29,
  *exactly* the eight instances.
- **`Selector--Menu` broke its own headline promise three ways**, each revealed
  only by fixing the one before. Fixing a focus bug is how you find the next
  focus bug.
- **A fixture simpler than every call site.** Its Escape test passed while both
  adopters were broken, because the fixture's trigger was a local `const` no
  member could clear — and closing a menu is exactly when the anchor goes away.
  **The test and the realistic call site disagreed, and the test won.**

## The two best moves of the arc were made by agents, not by me

**A refusal that produced a fix.** `person-enrichment` stopped mid-adoption
because `SearchBox--Autocomplete` could not take an initial value — and its
affiliation name **arrives pre-filled** from the person's email domain. Adopting
would have silently dropped a value the operator was looking at. It marked its
eight red assertions **`it.fails`** — which *passes while the defect is present
and fails the moment it is fixed.* A live tripwire rather than a silenced test.
All eight flipped on the first run after the fix; **not one defect had to be
re-discovered by hand.**

**A refusal that was right in the strongest sense.** Two icon-only links could not
adopt `ExternalLink`, because an `aria-label` *suppresses* the visually-hidden
new-tab notice — the one thing the component exists to add. One of those sites
**already cleared the target floor with its own rules**, so adopting would have
turned a measured pass into a measured failure.

## The gate was punishing the practice

An engineer deleted a rule carrying `z-index: 5`, wrote a comment explaining the
deletion, and **F4 re-reported the literal from the prose.** The member sat at its
old count until the sentence was reworded.

**Documenting a removed defect re-created it in the gate** — a direct incentive
never to explain a deletion, in a codebase whose entire practice is explaining
things in place. F8 had the same blind spot and had been *reported twice as a
finding* without anyone fixing the cause.

The script's own header warns about a checker that reports success because it
failed to look. This was the inverse.

**And my own census had the same bug.** `DevelopersMenu` was on the nine-surface
list because a grep hit a *code comment*. The ninth surface never existed.

## What a browser drive caught that 99 tests could not

`Button` declares `white-space: nowrap` **and** a fixed height. A Selector option
declared **neither**. So every member that swapped Button rows for options
**silently converted a clip into a wrap** — one real row measured **48px against
its neighbours' 29px**, its label squeezed to the min-content of its first word.

jsdom has no layout. It passed every test in every adopting member, and was found
on the one member where somebody looked at pixels.

> **A component that replaces another must match its layout defaults, not just its
> role and its keyboard.** The parts nobody declares are the parts that change
> silently.

## Defects the sweeps found in members

- **`shell`'s workspace switcher rendered a dead socket and a healthy one
  identically** — four of six connection states fell through to the same label,
  with the only trace of failure in a `title` nobody hovers.
- **Six members were still shipping one identical broken status recipe** after
  nine migrations: five states, three colour treatments.
- **A tag popup was thirteen tab stops** — Tab took the caret out of the input
  mid-word.
- **Six of the federation's seven missing-`noopener` links were in two files**,
  each opened page holding `window.opener` access back into ours.
- **All nine hand-rolled checkboxes measured 13×13** — 54% of the target floor,
  every one. Two had no accessible name at all.
- **A keyboard hint that had started lying.** A `↵` badge advertised *"Enter
  picks the first match"* — true when written, false after. Removing it was the
  point: a hint that lies is the defect class this rollout exists to remove.

## Two hand-rolled guards disagreed, and the weaker one was shipping a bug

Both async search surfaces guarded against stale responses. One guarded only the
success path — its `catch` was unguarded, so a rejection for a term the operator
had already moved past **emptied the suggestions and painted an error over
correct, on-screen results.**

That disagreement is the argument for promoting a guard into a component rather
than documenting it.

## What is not done

- **Snippet props cannot be typed with a member's own row type.** Three adopters
  have now hand-rolled the identical id-lookup workaround. That is the threshold;
  it wants generics.
- **Every adopter keeps a document-level Escape** in addition to the Selector's —
  it covers Escape while focus is still on the trigger. Third copy; smells like a
  trigger primitive.
- **`InteractiveBadge`** has one sighting. Not built — the same rule that keeps
  `Selector--Radio` unbuilt.
- **F7 still has no mechanical check**, and 11 of 22 units still have no tests.

## Related

- [[2026-09-13_07_CardRow-Twenty-Members-In-One-Evening-And-A-Primitive-That-Failed-Silently]]
- [[../context-v/plans/Build-Selector-And-Close-The-Keyboard-Contract]]
- [[../context-v/specs/SearchBox-LiveFilter-And-Autocomplete]]
- [[../context-v/loops/Adopt-Selector-In-One-Member]]
- [[../context-v/issues/A-Component-Test-Whose-Fixture-Is-Simpler-Than-Its-Call-Sites]]
