---
date_created: 2026-08-08
date_modified: 2026-08-08
title: "Every micro-frontend can now publish what it is made of"
lede: "The token layer got a surface last week. The other half of the design system — seventeen members' own components — still had none. Now each member ships its own component library, at its own address, with a live contract audit attached."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - packages/gallery/
  - apps/corpora-curator/src/gallery/
  - apps/corpora-curator/rsbuild.config.ts
  - apps/corpora-curator/src/index.ts
  - apps/docs-portal/src/MemberLibraries.svelte
  - apps/docs-portal/src/members.ts
  - apps/docs-portal/src/App.svelte
  - shell/src/DevelopersMenu.svelte
  - context-v/specs/Federated-Component-Libraries.md
tags:
  - Augment-It
  - Design-System
  - Component-Library
  - Module-Federation
  - Accessibility
---

# Every micro-frontend can now publish what it is made of

## Why Care?

The federated design system has two layers. The federal one — the token
vocabulary — got its surface when the swatch page shipped, and thirty-five
tokens were finally looked at instead of merely measured. The local layer never
did. Seventeen members "own their own components, composition patterns and
interaction idioms," and there was no page anywhere that rendered a single one
of them.

Which means the number that started this whole effort — 158 button rule-sets,
13 card recipes, 34 badge treatments, 6 spinners — had only ever been counted.
Nobody had seen the thing being counted, side by side, in one place.

Now they can. Each member publishes a component library from its own bundle,
reachable three ways: inside the shell, standalone on the member's own port,
and — the one that matters for review — **one specimen at its own bare URL**,
no chrome, openable on a phone against the LAN address by someone who has
neither the repo nor the shell running.

## What shipped

**`packages/gallery` — one runtime, seventeen catalogs.** The runtime owns how a
library is browsed, isolated, deep-linked and audited. It knows nothing about
any member: prefix, root class, origin and fixtures all arrive as data. Members
declare what is in their own library and expose it over Module Federation as
`./gallery`, alongside the `./mount` they already had. A central library that
imported from members would have re-created the single queue federation exists
to avoid — so the index is central and the libraries are not.

**Class recipes are first-class.** Alongside `component` entries there are
`pattern` entries: `.cc-card`, `.cc-row`, the four button variants. A gallery
that catalogued only `.svelte` files would have shown none of the 158 buttons,
because not one of them is a component.

**Three modes, side by side, from the real cascade.** `theme.css` scopes its
mode blocks to `[data-mode='…']` rather than `:root[data-mode='…']`, so an
ordinary `<div>` re-points the whole token vocabulary for its subtree. Dark,
light and vibrant render simultaneously. Plus a surface selector, because a
component that vanishes on `--color-surface-raised` is the swatch page's P2/P3
failure one level down.

**A contract audit, per component, at render time.** F1a (a Tier-1 token read
directly), F4 (a bare z-index), F8 (a colour literal) and F2/F3 (an unprefixed
class) — measured from the CSSOM rules that actually matched *this specimen*.
`pnpm design:drift` sweeps files and reports per member; this reports per
component, in the mode you are looking at. Plus contrast off every painted text
node against its **composited** background — the house
`color-mix(…, transparent)` idiom makes a naive background transparent and a
naive checker useless — target size against the 24×24 floor, missing accessible
names, and controls no `:focus-visible` rule covers.

**Token provenance.** Every custom property a matched rule reads, diffed against
what the catalog claims. A stale declaration becomes a finding rather than a
comment nobody re-reads.

## What the pilot found

`corpora-curator` was the first member. Building its library surfaced five
things no static sweep had:

- **The components are not prop-driven.** All four read the `curation` runes
  singleton, so every fixture has to stage that singleton before rendering. Good
  convention for an app, bad one for a library — a component whose inputs are
  ambient cannot be rendered in a state its author did not anticipate. The
  gallery says so on the Usage tab rather than papering over it.
- **`SourceList` filtered-to-nothing renders exactly like empty.** Four sources,
  a filter matching none, no message at all. Now a pinned fixture.
- **Three badge treatments coexist** — `.cc-pill`, `.cc-status-chip`, `.cc-conn`.
  Apart, each looks fine. In one frame, it is obviously one job done three ways.
- **Every field label is a `<span>`, not a `<label>`.** Two blocking
  accessibility findings on the Fields recipe alone.
- **The commit flash runs a local `@keyframes`** instead of a federal motion
  token — the kind of thing a per-component view surfaces and a per-member sweep
  averages away.

## Also included

The Developers menu gains **Component libraries** next to Design system; both
open the same portal on its two halves, handed over in `sessionStorage` so the
`mount(target)` remote contract stays exactly as narrow as it was. The portal's
`lib-host` is a generic loader — same contract as the shell's `MountHost` — so
adding the next member's library is one entry in `members.ts`.

`pnpm design:drift` reports the same 99 findings it did before this work: the
gallery adds no drift of its own. The chrome is prefixed `agx-`, built from
Tier-2 tokens only, and is deliberately not a registry member — it documents
the system rather than consuming it, the same carve-out the portal already had.

Full spec: `context-v/specs/Federated-Component-Libraries.md`. Adoption recipe
for the other sixteen members: `packages/gallery/README.md`.
