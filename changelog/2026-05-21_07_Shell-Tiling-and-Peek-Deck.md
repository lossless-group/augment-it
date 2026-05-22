---
title: "The shell becomes a window manager — peek-deck, co-existence split, and a draggable seam"
lede: "augment-it's shell stops taking turns. Where it used to mount one federated frontend at a time and destroy it to show another, it now mounts several at once and tiles them like a desktop window manager. Three layout modes: a peek-deck where the focused app sits at 90% with its neighbours peeking from the edges and hover-expanding, a co-existence split where two apps share the viewport behind a draggable seam, and plain full-width. Layout state persists per-user behind a seam the shared-auth store will back later."
publish: true
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Shell
  - Module-Federation
  - Window-Tiling
  - Peek-Deck
  - Co-Existence-Split
  - Svelte-5
  - Layout-State
files_changed:
  - shell/src/remotes.ts
  - shell/src/layout.svelte.ts
  - shell/src/MountHost.svelte
  - shell/src/App.svelte
  - apps/record-collector/src/App.svelte
  - apps/record-collector/src/app.css
---

## Why Care?

Until now the augment-it shell was a tab switcher. It held one mounted
federated remote; switching to another meant `loadRemote()` destroying the
first and mounting the second. One app on screen, ever.

That's the wrong shape for what augment-it actually is. Enriching records is a
*conversation* between frontends — you pick a record in one app, you author and
run a prompt in another, you want both in front of you. A tab switcher makes
you choose. A window manager doesn't.

So the shell is now a window manager. It mounts multiple federated remotes
simultaneously and tiles them. Three layout modes, and the user picks which is
the default:

- **Peek-deck** — the focused frontend at 90% of the width, its sequence
  neighbours peeking from the left and right edges. Hover a neighbour and it
  expands; the focus collapses to make room. Click into it and it commits as
  the new focus.
- **Co-existence split** — two frontends share the viewport, separated by a
  draggable seam. This is what a single-record enrichment opens: pick "enrich"
  on one record in Record Collector and the shell drops both Record Collector
  and Prompt Templates side by side so you can iterate.
- **Full** — one frontend at 100%. The old behaviour, kept as an option.

This is the substrate the record-instance model and the judgment-class
enrichment flow ([[Original-and-Enhanced-Record-Instances]]) needed. It was
built from [[Build-the-Shell-Tiling-and-Peek-Deck]], the prompt co-designed for
exactly this.

## What's New?

- **The shell mounts multiple remotes at once.** `shell/src/MountHost.svelte`
  wraps one remote's mount and keeps it alive; `App.svelte` renders a keyed
  `{#each}` of MountHosts, so a remote that stays in the visible set survives
  every mode change, hover, and drag without remounting.
- **`shell/src/layout.svelte.ts`** — the layout state: a typed
  `ShellLayoutPreference` (`mode`, `focusIndex`, `focusedWidthPct`,
  `coExistenceRatios`, `defaultMode`), a Svelte 5 singleton, clamped no-wrap
  setters, and a localStorage persistence adapter.
- **`shell/src/remotes.ts`** — the remote registry and the co-existence
  pairing config (which two remotes pair, at what default ratio).
- **`App.svelte` rewritten as the tiling stage** — a `$derived` geometry
  function computes each visible remote's width, z-index, and role per mode;
  the markup is one stage with positioned slots.
- **Three mode buttons in the header** — Deck / Split / Full — alongside the
  existing theme toggle.
- **A single-record enrich control** — top-right of every row card in
  Record Collector. It dispatches an `augment-it:enrich-record` window event;
  the shell hears it and opens the co-existence split.

## How the peek-deck behaves

The frontends are an **ordered, semi-linear sequence** — no wrap. There is a
`focusIndex`. The focused frontend renders at 90%; the previous one peeks from
the left, the next from the right, each in the leftover ~5%. The focused panel
has the higher z-index and a card shadow, so it reads as raised above its
neighbours.

The peeking neighbours are **live mounted apps**, not screenshots — the slivers
show real content. Each carries a click-capture overlay:

- **Hover** the overlay → the neighbour expands to 38%, the focus collapses to
  match. Immediate — the expand is a fast (0.2s) transition.
- **Mouse out** → it snaps back over **1.9 seconds**, eased
  `cubic-bezier(0.45, 0.05, 0.55, 0.95)` — slow, then fast, then slow. Sticky.
- **Click** the overlay → the neighbour commits as the new focus; the deck
  advances or retraces one step. It never wraps.

The directional timing — fast in, slow out — is one CSS trick: the stage
carries a `.fast` class only while a neighbour is hovered, and the slots read
their transition duration off it. Hover-in sets the class (fast); mouse-out
removes it (slow), and the snap-back animates with the slow timing because the
class is already gone when the widths recompute.

The focused panel's own left and right edges are **resize-sensitive** — the
cursor turns to `col-resize` and a drag adjusts the focused width below 90%,
handing the freed space to the neighbours. That's distinct from the
co-existence splitter: the resize edges are the focused panel's own edges; the
splitter is a seam between two panels. Different pixels, different gestures.

## How co-existence behaves

A pairing is config — `recordCollector + promptTemplateManager`, default ratio
30/70. Co-existence mounts both, sized by the ratio, with a **draggable
splitter** on the seam. Dragging it resizes both panels in tandem and persists
the new ratio. Co-existence is reachable from the Split header button, and —
the real entry point — from the per-record **enrich** control: enriching one
record is a two-app job, so the layout puts both apps in front of you.

## Persistence — the seam, not the store

Layout state is a **User-scoped preference**. This work persists it to
localStorage under one fixed key, behind a `load()` / `save()` adapter and the
typed `ShellLayoutPreference` shape. When the shared-auth account system lands
([[Shared-Auth-for-Applied-AI-Labs]]), the durable backing becomes a
`user_preferences` slot — and that is a swap of the adapter, nothing else. The
feature commits to the *shape*; the storage underneath is replaceable. It does
not block on the account system.

## Under the hood — keeping remotes alive

The hard part of a window manager over Module Federation is *not destroying
apps you're going to need again*. The peek-deck shows three apps; switching
focus must not remount them.

The keyed `{#each stage as item (item.id)}` is the mechanism. Svelte keeps a
component instance alive as long as its key stays in the list. A MountHost
keyed by remote id therefore survives as long as that remote stays in the
visible set — focus can move, modes can change, and the live app (its
WebSocket, its workspace singleton, its scroll position) persists. A remote
only unmounts when it genuinely leaves the screen — e.g. full mode, which shows
just one. That remount-on-re-entry is the one accepted cost; everything inside
a mode, and most mode transitions, keeps every app warm.

Each mounted remote still opens its own WebSocket (its workspace singleton
connects on mount). Peek-deck with two remotes = two connections. Fine at this
scale; noted.

## Theme discipline held

Every new surface — the stage, the peek overlays, the resize edges, the
splitter, the enrich control — uses `var(--color-*)` / `var(--fx-*)` tokens
only. No hardcoded hex. All three theme modes (light / dark / vibrant) render
the tiling chrome correctly; the splitter's hover glow is `--fx-accent-glow`,
so it's a hairline in light and a real glow in vibrant.

## Files Worth Knowing About

- `shell/src/App.svelte` — the tiling stage. The `$derived` geometry function
  is the brain; read it to see how each mode lays out.
- `shell/src/layout.svelte.ts` — the layout state + the persistence seam.
- `shell/src/MountHost.svelte` — why apps stay alive across mode changes.
- `shell/src/remotes.ts` — the registry; adding a remote is an entry here plus
  a `remotes` line in `rsbuild.config.ts`.

## What's Next

- **The record-instance model fold** — the `row_ids` argument on `prompt.run`,
  the original/enhanced twin in row-store, so the enrich control's chosen
  record actually flows through to the prompt panel. Today the enrich control
  opens the split; wiring the *record* through is the next piece
  ([[Original-and-Enhanced-Record-Instances]]).
- **Commit-animation tuning** — clicking to commit a focus currently animates
  with the slow 1.9s snap-back timing; a deliberate navigation might want to be
  quicker. One transition value.
- **The `coExistenceRatios` pair key** is `"recordCollector+promptTemplateManager"` —
  the last open question from the prompt, now wired.

## See also

- [[Build-the-Shell-Tiling-and-Peek-Deck]] — the prompt this built.
- [[Original-and-Enhanced-Record-Instances]] — the data model the single-record
  enrich flow serves.
- [[2026-05-21_06_Three-Mode-Theme-System]] — the token system the chrome uses.
- [[2026-05-21_03_Shell-Federation-Three-Lessons]] — the mount-function contract
  this extends from one mount to many.
