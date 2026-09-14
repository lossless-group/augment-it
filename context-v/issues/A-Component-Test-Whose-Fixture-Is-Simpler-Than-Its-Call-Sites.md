---
title: "A component test whose fixture is simpler than its call sites"
lede: "Selector--Menu's suite was green while both of its first two adopters were broken in exactly the way its header promises to prevent."
date_created: 2026-09-14
date_modified: 2026-09-14
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Resolved
tags:
  - Issue
  - Augment-It
  - Design-System
  - Testing
  - Accessibility
  - Selector
site_uuid: 861a103f-4696-4296-a33a-73f156478217
hex_code: epwev6
date_authored_initial_draft: 2026-09-14
date_authored_current_draft: 2026-09-14
publish: true
---

# A component test whose fixture is simpler than its call sites

## Why Care?

`Selector--Menu` exists so a popup returns focus to its trigger instead of
dropping it to `<body>`. Its header says so. **Two tests asserted it. Both
passed. Both of its first two adopters were broken in exactly that way.**

The fixture's trigger was a local `const` the member could not touch:

```ts
const trigger = document.createElement('button');
render({ trigger, onclose: () => (closed = true) });
```

The realistic call site nulls its anchor on close, because that is what closing a
menu means:

```ts
function closeMenu() { menuAnchor = undefined; }
```

`trigger` is a Svelte prop — **a live getter, read at the moment of the call**.
The handler read it *after* `onclose?.()`. So the component read `undefined`
one line later and focus went to body.

**The test and the realistic call site disagreed, and the test won.**

## The general form

> **A fixture simpler than every real call site does not test the component. It
> tests the fixture.**

This is not the usual "tests can be wrong" observation. The test was *correct
about what it asserted*. It asserted that focus returns to a trigger **that still
exists** — and no adopter has one, because closing a menu is exactly when the
anchor goes away.

The tell was available before the adopters found it: **the fixture did the one
thing no member would do.** Worth asking of any component test — *what does a real
call site do here that my fixture does not?*

## Two more, each revealed by fixing the one before

**No focus-on-open.** A popup whose keydown handler is on the menu, opened with
focus still on the trigger, has a widget whose entire keyboard is unreachable.
Both adopters hand-rolled the same seven-line `querySelector`. Two independent
copies on the first two call sites is the same evidence threshold that justified
building the component.

**Then the fix for that broke the fix for the first.** A Svelte attachment
re-runs on every update, and an unguarded `focus()` in one stole focus *back*
from the trigger a tick after Escape had correctly returned it — so the component
defeated its own promise on the update rather than the keypress.

A one-shot flag was not enough either: a member can close the menu **before the
attachment has run even once**, and the attachment then fires afterwards, sees the
flag unset, and pulls focus out. The guard had to mean *"focus has been placed"*,
not *"the attachment has run"*.

**Fixing a focus bug is how you find the next focus bug.** Three causes, in
sequence, each invisible until the previous one was gone.

## Resolution

All three fixed in `9c1a9c1`. The suite now uses a getter-backed trigger that
`onclose` clears — the shape every adopter has.

## Not fixed, and it blocked a step of the loop

**`gh issue create` was denied by the permission classifier** for the subagent,
so step 3 of [[../loops/Adopt-Selector-In-One-Member]] — open a gh issue, body
linking the plan — did not happen for either member. The work trail is the agent's
report and this file.

Either the loop stops promising a gh issue from a subagent, or subagents get a
Bash permission rule for `gh issue create`. **Operator's call.**

## Related

- [[../loops/Adopt-Selector-In-One-Member]] — the loop, including the red-phase decision node
- [[../plans/Build-Selector-And-Close-The-Keyboard-Contract]] — the plan
- [[A-Silently-Ignored-Alias-Pointed-A-Probe-At-Production]] — the other case of a harness that lied
