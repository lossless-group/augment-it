---
title: "Build the Shell Tiling & Peek-Deck — Window the Federated Frontends"
lede: "The augment-it shell stops being a one-at-a-time tab switcher and becomes a desktop-window-tiling surface. Two layout modes: a peek-deck where the focused frontend sits at 90% width with its sequence neighbours peeking from the edges and hover-expanding, and a co-existence split where two frontends share the viewport at a configurable ratio with a draggable seam — entered when a prompt is run against a single record. Full-width single-frontend stays available as a third option. Layout state is User-scoped preference, persisted to localStorage now against a declared shape that the forthcoming shared-auth user store will back later."
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Prompt
  - Augment-It
  - Shell
  - Module-Federation
  - Window-Tiling
  - Peek-Deck
  - Co-Existence-Split
  - Layout-State
  - User-Preferences
  - Single-Record-Enrichment
status: Draft
---

# Build the Shell Tiling & Peek-Deck

## What this prompt is for

Hand this to an agent session to build the augment-it shell's **window-tiling
layout system**. Today the shell (`shell/src/App.svelte`) is a one-frontend-at-a-time
tab switcher: `loadRemote()` destroys the previous mount before creating the
next. This work replaces that with a layout surface that **mounts multiple
federated remotes simultaneously** and arranges them like a desktop window-tiling
manager.

Read first, for grounding:

- [[2026-05-21_03_Shell-Federation-Three-Lessons]] — how the shell mounts
  remotes (the mount-function contract, the generic loader). This work extends
  exactly that machinery.
- [[2026-05-21_05_Prompt-Template-Manager-UI]] — the second remote; the deck
  currently has two frontends.
- [[Impose-Theme-Modes-System]] — the theme tokens every new surface must use
  (no hardcoded hex; `var(--color-*)` / `var(--fx-*)` only).
- [[Shared-Auth-for-Applied-AI-Labs]] — the future backing for layout state
  (see §Persistence seam). **This work does not depend on it.**

## The current state it changes

- `shell/src/App.svelte` holds `REMOTES[]` (an ordered list — currently
  record-collector, prompt-template-manager), a single `activeRemoteId`, a
  single `mountTarget` div, and a single `currentMount`.
- `loadRemote(id)` destroys `currentMount`, dynamic-imports the remote's mount
  function, and mounts it into the one target div.
- Switching frontends = full unmount + remount.

After this work the shell holds **multiple live mounts at once**, each in its
own positioned container, and a **layout state** that decides their geometry.

## The three layout modes

The shell is always in exactly one layout mode. The user picks the default;
it persists (see §Persistence seam).

### Mode A — Peek-Deck (the new default)

The federated frontends form an **ordered, semi-linear sequence** — the order
of `REMOTES[]`. It does **not wrap**: it is a progression you advance along and
can retrace, not a carousel. There is a `focusIndex` into the sequence.

- The **focused** frontend renders at **90%** of available viewport width.
- The frontend at `focusIndex - 1` (the **previous**) peeks in from the **left
  edge**; the frontend at `focusIndex + 1` (the **next**) peeks in from the
  **right edge**. At the ends of the sequence one neighbour is simply absent —
  the focused frontend sits flush against that edge.
- Peeking neighbours sit **behind** the focused frontend. The focused frontend
  has the **highest z-index** — where they overlap, focus is on top.
- All three (prev / focused / next) are **live mounted remotes**, not
  screenshots. The peeking slivers render real app content.
- **Hover a peeking neighbour → it expands (a live preview).** The focused
  frontend **collapses to make room** — width redistributes toward the hovered
  neighbour. This is reversible.
- **Mouse-out → snap back.** The snap-back is **slow — about 2 seconds — and
  eased slow → fast → slow** (ease-in-out, a "sticky" feel). It is a graceful
  return to the prior geometry, not an instant reset.
- **Click *into* a peeking neighbour → it commits as the new focus.** The deck
  advances (or retraces) one step: `focusIndex` moves to that neighbour. Hover
  is preview; click is commit.
- The focused panel's width is **user-adjustable** below 90%. Its **left and
  right edges are resize-sensitive**: when the cursor enters the edge strip it
  changes form (`col-resize`), signalling drag-to-resize. Dragging an edge
  resizes the focused panel; the width it gives up goes to the neighbour on
  that side, the width it takes comes from that neighbour. This is distinct
  from the Mode-B splitter — it is the focused panel's *own* edges, not a seam
  between two panels.
- **Hit-zone discipline:** the resize edge strip and the click-to-commit-a-
  neighbour zone occupy different pixels — the resize strip is the focused
  panel's outer edge; the commit-on-click zone is the neighbour's visible
  sliver beyond it. Keep them as distinct hit targets so a resize-drag never
  fires a focus-commit.

### Mode B — Co-Existence Split

Two frontends share the viewport at once — a **mutually-selected pair**.

- **Trigger:** running a prompt against a **single record**. In record-collector,
  each individual record's container carries a control in its **top-right**
  ("enrich this record" or similar). Activating it puts the shell into Mode B
  with **record-collector and prompt-template-manager both mounted, side by
  side**.
- The pair has a **default width ratio** declared per pairing — e.g.
  record-collector 30% / prompt-template-manager 70%. Different pairings may
  want different defaults (50/50, 70/30, 80/20); the ratio is **per-pair
  config**, not a global constant.
- A **draggable splitter** sits on the seam between the two panels. Dragging it
  resizes both **in tandem** — one grows as the other shrinks. The dragged
  ratio persists (see §Persistence seam).
- Mode B is wired between **specific frontend pairs**. Today there is one pair
  (record-collector × prompt-template-manager). The design should make adding a
  pairing a config entry, not a rewrite — but only the one pair need exist.

### Mode C — Full

One frontend at 100% width — the pre-existing behaviour. Kept as an available
option. It is **not** removed; the peek-deck becomes *a* default, not the only
layout.

## The record-instance model — original and enhanced

Mode B exists because of how augment-it enriches. Enrichment is **not** a
mutation of the upload, and **not** a new derived set per run. It is an
**original → enhanced twin**:

- The **original import** is the uploaded record set. Pristine — never mutated.
- Its **enhanced instance** is a single mutable twin, created lazily on the
  first enrichment. There is **one enhanced instance per original** — not one
  per run. Every enrichment run, single-record *or* batch, **accumulates into
  it**: adds columns, fills cells.
- A **clear id-map** ties each enhanced row to its original row, so an enhanced
  row always traces home — and a future write-back knows which
  system-of-record row each enhanced row corresponds to.
- The terminal steps (later) are **export** the enhanced records, and one day
  **write-back** into the system of record (CRM, Airtable).

So Mode B's single-record run updates that one record's row **in the enhanced
instance** (creating the enhanced twin first if it doesn't exist yet). It is
neither in-place-on-the-original nor a 1-row throwaway set.

`prompt.run` therefore needs to target specific rows of an enhanced instance —
a `row_ids: string[]` argument, or equivalent (single-record = a one-element
array). This is a related backend change, separable from the shell work but
part of the same feature.

> **This supersedes a locked decision.** The
> [[Prompt-Template-Manager-Walking-Skeleton]] plan said every run produces a
> new derived record set and framed re-runs as a *lineage chain*. The
> original/enhanced-twin model replaces that — no chain, one accumulating twin.
> The full model is captured in
> [[Original-and-Enhanced-Record-Instances]] (its own blueprint); this section
> is the summary the shell-tiling work needs to be self-contained.

## Architecture implications

- **The shell mounts multiple remotes simultaneously.** Replace the single
  `currentMount` with a map of live mounts keyed by remote id. Each mounted
  remote lives in its own absolutely/flex-positioned container; the layout mode
  computes each container's width, transform, and z-index.
- **Each mounted remote opens its own WebSocket** (its workspace singleton
  connects on mount). Three simultaneous mounts = three connections. Acceptable
  for the walking skeleton; note it.
- **The mount-function contract is unchanged** — remotes still expose
  `./mount`; the shell still calls the generic-loader pattern. Only the *number
  of simultaneous mounts* and *their geometry* changes.
- **Unmounting discipline.** When a remote leaves the visible set (e.g. Mode B
  drops a peek-deck frontend), call its `destroy()`. Don't leak mounts.
- **All new chrome uses theme tokens** — `var(--color-*)` / `var(--fx-*)`. No
  hardcoded colour. The splitter, the peek slivers' edge treatment, any hover
  affordance: tokens only.

## Persistence seam

Layout state is **User-scoped preference**. It is a typed object:

```ts
type ShellLayoutPreference = {
  mode: 'peek-deck' | 'co-existence' | 'full';
  focusIndex: number;              // peek-deck: position in the sequence
  coExistenceRatios: Record<string, number>;  // per-pair-key → left-panel %
  defaultMode: 'peek-deck' | 'co-existence' | 'full';
};
```

- **Walking-skeleton persistence:** `localStorage`, keyed by the
  workspace-service session token the shell already mints.
- **Future backing:** a `user_preferences` slot in the shared-auth `users`
  store, when `Shared-Auth-Core-Package` lands ([[Shared-Auth-for-Applied-AI-Labs]]).
- Build it as **one storage adapter behind the typed shape** — `load()` /
  `save(pref)`. The localStorage implementation now; the shared-auth
  implementation is a drop-in swap later. The prompt commits to the *shape*,
  not the storage.

This feature does **not** block on the account system. The seam is the whole
point.

## Motion & feel

- Desktop-window-tiling feel overall.
- Peek-deck hover-expand: immediate on hover-in; **~2s ease-in-out snap-back**
  on hover-out.
- Mode transitions (peek ↔ co-existence ↔ full): animated, not instant.
- z-index layering keeps the focused frontend cleanly above its neighbours
  through every transition.
- The 75ms theme-swap transition from `theme.css` is a separate concern — do
  not couple the tiling animations to it.

## Acceptance criteria

1. The shell mounts and renders **prev + focused + next simultaneously** in
   peek-deck mode; the focused frontend is at 90% with the correct neighbour(s)
   peeking and the correct z-index layering.
2. Hovering a peeking neighbour expands it and collapses the focus; mouse-out
   snaps back over ~2s with slow→fast→slow easing.
3. Clicking into a neighbour commits it as the new focus; the deck advances /
   retraces by one; it never wraps.
4. The single-record control (top-right of a record's container in
   record-collector) puts the shell into co-existence mode with both frontends
   mounted at the pair's default ratio.
5. The co-existence splitter drags; both panels resize in tandem; the ratio
   persists.
6. Full mode (100%, one frontend) is reachable and is a selectable default.
7. Layout state survives a page reload (localStorage), through the typed
   `ShellLayoutPreference` shape and its storage adapter.
8. No hardcoded hex anywhere in the new chrome — theme tokens only; all three
   theme modes (light/dark/vibrant) render the tiling chrome correctly.

## Out of scope

- The shared-auth account system itself — `@lossless/auth-core`,
  User < Team < Org, the `users` store. That is a separate, ai-labs-level
  session. This work only declares the preference *shape* and the seam.
- Frontends beyond the current set. Design the deck for N frontends; only
  record-collector and prompt-template-manager exist to mount.
- The Team tier of the account model — irrelevant to layout preference, which
  is pure User scope.

## Decisions resolved during co-design (2026-05-21)

1. **Single-record run — neither in-place nor a throwaway set.** It updates the
   record's row in the **enhanced instance** (the original/enhanced twin — see
   §The record-instance model). The enhanced twin is created lazily on first
   enrichment and accumulates.
2. **Mode A focused-panel width control — resize-sensitive edges.** The focused
   panel's left/right edges change the cursor to `col-resize` and drag to
   resize, redistributing width with the neighbour on that side. Distinct from
   the Mode-B splitter (see the Mode A spec).
3. **First-load default — peek-deck.** A brand-new user (no stored preference)
   lands in Mode A.

## Open questions — still to resolve

1. **Pair key.** `coExistenceRatios` is keyed by pair — what is the key
   string? `"recordCollector+promptTemplateManager"` (sorted remote ids) is the
   obvious choice; confirm when wiring.

## See also

- [[2026-05-21_03_Shell-Federation-Three-Lessons]] — the shell's mount machinery.
- [[Prompt-Template-Manager-Walking-Skeleton]] — `prompt.run`; the single-record
  capability extends it.
- [[Impose-Theme-Modes-System]] — the token discipline the new chrome must follow.
- [[Shared-Auth-for-Applied-AI-Labs]] — the future home of layout preference.
