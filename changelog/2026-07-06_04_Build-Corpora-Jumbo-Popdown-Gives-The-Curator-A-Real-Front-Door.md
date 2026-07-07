---
date_created: 2026-07-06
date_modified: 2026-07-06
title: "\"Build Corpora\" jumbo popdown — the strategy/thesis curator gets a real front door"
lede: "A header-level dropdown (the Lossless 'jumbo popdown' convention, ported from astro-knots into the shell's Svelte header) replaces the memorized-:3017-port habit with a click: 'Flows' -> 'Build Corpora' navigates straight to strategy-curator, full-screen, no CSV-augmentation steps trailing it. No new persisted state, no auth interaction — a plain navigate action, same mechanism the chat rail and pack-runner already use to reach non-rotation remotes."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - shell/src/JumboPopdown.svelte
  - shell/src/App.svelte
tags:
  - Progress-Update
  - Shell
  - Strategy-Curator
  - Thesis-Curator
  - Navigation
  - Jumbo-Popdown
  - Design-System-Port
---

## Why Care?

Mid-session, the operator went looking for the corpus curator at
`http://localhost:3017` — its own standalone dev port — because that was
the only on-ramp that existed. No shell chrome there, no sign-in badge, no
workspace switcher: just the bare federation remote. The underlying gap,
in the operator's words: "we kept running into workflows that don't fit
the current shared shell header of 1-2-3-4." Two explorations later
([[../context-v/explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]]),
the fix landed: a real, header-level entry point.

## What's New?

- **The jumbo popdown convention, ported into augment-it.** The shape —
  trigger button + chevron, a content-rich panel (`role="menu"`, one card
  per item with a title and description, hover-open + click-toggle,
  Esc/click-outside closes) — is documented at
  `astro-knots/context-v/blueprints/Jumbotron-Popdown-Patterns.md` with a
  live reference in `astro-knots/sites/fullstack-vc`. `shell/src/JumboPopdown.svelte`
  is a native Svelte port of that interaction contract — a pattern port,
  not a shared dependency, per the "no shared dependency across ai-labs
  apps" convention.
- **One entry, on purpose: "Build Corpora."** The popdown ships with
  exactly the one item the flow needs today — clicking it dispatches the
  shell's existing `augment-it:navigate` event (`{ remoteId: 'strategyCurator',
  mode: 'full' }`), the same mechanism the chat rail, pack-runner, and
  person-enrichment already use to reach remotes that aren't in `ROTATION`'s
  numbered sequence. `mode: 'full'` is the fix for the actual complaint:
  strategy-curator mounts alone, with no CSV-augmentation steps peeking in
  from the sides.
- **Deliberately NOT a pre-auth landing screen.** The first draft of this
  idea proposed gating flow-choice behind sign-in with its own persisted
  state. Corrected down to what the moment actually needs — augment-it has
  exactly two users today (Michael, Aniel) — so this is just a nav control,
  no new state, no auth interaction at all.
- **Auth was already there — verified, not assumed.** The shell's header
  (DidiBadge, WorkspaceSwitcher) renders outside the rotation stage
  entirely, so it stays visible regardless of what's mounted. And
  strategy-curator opens its *own* WS connection to the same
  `workspace-service` host (`curation.svelte.ts`), so the `didi_session`
  cookie rides along automatically — Step 4's actor-attribution envelope
  already reaches every write it makes, with zero extra wiring.

## What's Next

Grow the popdown only when a second flow-entry is actually needed — the
operator floated a richer "vertical carousel of use-cases" framing as a
later upgrade once there's more than one item worth showing. For now: one
menu, one click, corpus curation has a front door.
