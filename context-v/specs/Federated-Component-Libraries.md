---
title: "Federated Component Libraries"
lede: "One gallery runtime, seventeen sovereign catalogs — every member publishes what it is made of, at its own address."
date_created: 2026-08-08
date_modified: 2026-08-08
semantic_version: 0.0.1.0
status: Draft
tags:
  - Design-System
  - Federation
  - Component-Library
  - Gallery
site_uuid: 64f0c333-7d87-49d5-a480-2db5aef359f3
hex_code: 838pff
date_authored_initial_draft: 2026-08-08
date_authored_current_draft: 2026-08-08
publish: true
---

# Federated Component Libraries

## 1. The gap this closes

[[Federated-Design-System-Architecture]] settled the **federal** layer: one token
vocabulary, enforced by `scripts/design-drift.mjs`. [[Design-System-Portal]] gave
that layer a surface — the swatch page, where a token can finally be *seen*.

Neither covers the **local** layer. §4 of the architecture spec says each member
"owns its own components, composition patterns, and interaction idioms," and
nothing anywhere renders them. The measurement that motivated federation counted
158 button rule-sets, 13 card recipes, 34 badge treatments and 6 spinners — and
every one of those numbers came from a script, not from a page. Nobody has ever
looked at the thing being counted.

A component library is how you look at it.

## 2. The shape

**One runtime, seventeen catalogs.** `packages/gallery` (`@augment-it/gallery`)
owns *how* a library is browsed, isolated, deep-linked and audited. Each member
declares *what is in* its own, in `src/gallery/catalog.ts`, and exposes it over
Module Federation as `./gallery` alongside its existing `./mount`.

```
packages/gallery/                   the runtime — no member knowledge
apps/<member>/src/gallery/
  catalog.ts                        what this member has
  fixtures.ts                       the states worth pinning
  patterns.svelte                   snippets for class-based recipes
  mount.ts                          the ./gallery federation expose
apps/docs-portal                    the index — aggregates, never owns
```

A central library that imported from members would have re-created the single
queue federation exists to avoid. The **index** is central; the **libraries**
are not. A member's specimens come out of that member's own bundle, styled by
that member's own stylesheet — so a specimen is the real component, never a copy
that drifted.

## 3. Three addresses for the same thing

| Where | URL | For |
|---|---|---|
| In the shell | Developers → Component libraries | Browsing while working |
| The member, standalone | `http://localhost:3017/#/gallery` | The member's own author |
| **One specimen, isolated** | `http://localhost:3017/#/gallery/source-row/active?iso=1` | Review, screenshots, bug reports, a phone on the LAN |

The third is the load-bearing one. `iso=1` renders one fixture and no chrome, on
the member's own origin — including a LAN IP, because standalone the gallery
takes its link origin from `location.origin` rather than the catalog's declared
one. A reviewer needs neither the shell, nor the repo, nor a running backend.

Hash routing is opt-in. Standalone the hash is the member's to spend; federated
into the shell it is the *shell's*, and a remote writing to it would be reaching
outside its own boundary — so the federated gallery keeps its route in state and
points its isolate links at the member's origin instead.

## 4. What a catalog declares

Two entry kinds, because this codebase has two kinds of design:

- **`component`** — a real `.svelte` file, rendered from its own module.
- **`pattern`** — a class-based recipe with no component behind it. `.cc-card`,
  `.cc-row`, the four button variants. In a codebase whose measured problem was
  158 button rule-sets and 34 badge treatments — *none of them components* — a
  gallery that listed only `.svelte` files would show none of the problem.

Each entry carries fixtures (the named states), optional controls (live knobs),
a usage snippet, an accessibility note, a declared token list, and an optional
declared deviation (F9). Nothing is discovered by convention: the expensive
knowledge in a component library is not "which files exist" but "which states
are worth pinning," and that only ever comes from whoever owns the component.

## 5. What the gallery does that a screenshot cannot

1. **Three modes side by side.** `theme.css` scopes its mode blocks to
   `[data-mode='…']`, not `:root[data-mode='…']` — so an ordinary `<div>`
   re-points the entire token vocabulary for its subtree. Dark, light and
   vibrant render simultaneously, from the real cascade.
2. **Every surface.** The five federal surfaces in a selector, because a
   component that vanishes on `--color-surface-raised` is the P2/P3 failure the
   swatch page exists to catch, one level down.
3. **A per-component contract audit.** F1a (Tier-1 read directly), F4 (bare
   z-index), F8 (colour literal) and F2/F3 (unprefixed class), measured from the
   CSSOM rules that actually matched *this specimen*. `pnpm design:drift` sweeps
   files and reports per MEMBER; this reports per COMPONENT, at render time, in
   the mode you are looking at.
4. **A per-component accessibility audit.** Contrast off every painted text
   node against its *composited* background (the house `color-mix(…, transparent)`
   idiom makes naive backgrounds transparent and naive checkers useless), target
   size against the 24×24 floor, missing accessible names, and controls with no
   `:focus-visible` rule.
5. **Token provenance.** Every custom property named by a matched rule — the
   component's real dependency on the federal layer — diffed against what the
   catalog *claims* it reads. A stale declaration becomes a finding.

Everything is measured **after paint**, never read from `design-manifest.json`.
That rule is inherited from the swatch page: a page that painted from JSON would
prove the JSON is well-formed and nothing about the stylesheet.

## 6. What the pilot found

Building `corpora-curator`'s library surfaced things no static sweep had:

- **The components are not prop-driven.** All four read the `curation` runes
  singleton, so every fixture stages that singleton before rendering. That is a
  perfectly good convention for an app and a bad one for a library: a component
  whose inputs are ambient cannot be rendered in a state its author did not
  anticipate. The gallery says so on the Usage tab rather than hiding it.
- **`SourceList` filtered-to-nothing is indistinguishable from empty.** Four
  sources, a filter matching none, and no message at all. Pinned as a fixture.
- **Three badge treatments coexist** — `.cc-pill`, `.cc-status-chip`, `.cc-conn`.
  Apart, each looks fine. Rendered together in one specimen, they are obviously
  one job done three ways.
- **Every field label is a `<span>`, not a `<label>`.** Nothing is
  programmatically associated with any input; the audit reports two blocking
  findings on the Fields recipe alone.
- **The commit flash runs a local `@keyframes`** rather than a federal motion
  token — visible per-component, averaged away per-member.

## 7. Adopting it in another member

1. `pnpm add '@augment-it/gallery@workspace:*'` in the member.
2. Author `src/gallery/catalog.ts` (+ `fixtures.ts`, `patterns.svelte`).
3. `src/gallery/mount.ts` — `makeGalleryMount(catalog)`. **Import
   `@augment-it/gallery` BEFORE `../app.css`**; the package carries the
   `token-baseline.css` floor and the order is load-bearing for the same reason
   it is in `packages/federation`.
4. `rsbuild.config.ts` — add `'./gallery': './src/gallery/mount.ts'` to `exposes`.
5. `src/index.ts` — branch on `galleryRequested()` and dynamically import the
   catalog, so the product bundle does not carry the fixtures.
6. `apps/docs-portal/src/members.ts` — one entry; and the remote in the portal's
   `rsbuild.config.ts`.

## 8. Out of federation

The gallery chrome is prefixed `agx-`, built from Tier-2 tokens only, and is
**not** a member. It documents the system rather than consuming it as a product
surface, so the per-member contract (a registry row, a tier, its own DESIGN.md)
does not apply — the same carve-out `apps/docs-portal` already has.

## 9. Open

- **A1.** Only `corpora-curator` has a library. Sixteen to go, and the count
  should be visible in the portal rather than inferred from an empty list.
- **A2.** The audit is per-specimen and manual. It could run headless over every
  catalog in CI and become the per-component floor `design-drift` cannot be.
- **A3.** `apps/corpora-curator/DESIGN.md` is in the member registry and does
  not exist (F6 fails for it today). The catalog now holds much of what that
  document would say; the two should not diverge.
