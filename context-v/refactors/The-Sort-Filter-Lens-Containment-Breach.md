---
title: "sort-filter-lens leaks 61 unnamespaced classes into every other remote — and .error, .row and .muted are live collisions today"
lede: "One member ships 511 lines of global CSS with no root-class containment. Sixteen other surfaces render a class it restyles."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Proposed
tags:
  - Refactor
  - Augment-It
  - Design-System
  - Federation
  - Microfrontends
  - CSS-Containment
site_uuid: 181e75a2-6f8e-4002-b459-65e2f242f9f4
hex_code: 9es7t2
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# The sort-filter-lens containment breach

## Why Care?

`F3` is the federal rule that every selector descends from the member's root
class. Its stated justification in `DESIGN.md` is *"99 unnamespaced selectors in
one remote currently restyle every other remote on screen."* That remote is
`apps/sort-filter-lens`, the rule was written because of it, and **it is still
true.** Measured 2026-09-13:

```
apps/sort-filter-lens/src/app.css    511 lines,  98 top-level rules
distinct leaked leftmost classes     61
scoped <style> blocks in the member   0
.svelte files in the member           1   (App.svelte, 729 lines)
```

The member's registered `root_class` is `.sort-filter-lens`. **One rule honours
it.** `app.css` is imported as plain global CSS from both `mount.ts` and
`index.ts`, so nothing scopes it, and with zero `<style>` blocks there is no
component-level scoping to fall back on.

## This is a live bug, not a latent risk

The leaked names are not exotic. They are the most generic class names in the
product, and other members render them right now:

| Leaked class | Surfaces rendering it |
|---|---|
| `.row` | **19** |
| `.error` | **16** |
| `.muted` | **14** |
| `.empty` | **13** |
| `.loading` | 3 |

Plus `.row-name`, `.row-head`, `.row-main`, `.row-meta`, `.row-url`,
`.corpus-chip`, `.chip-x` — each in active use by one to three other members.

**The demonstrable case is `chat`.** Its rule declares three properties:

```css
.chat-app .bubble.error {
  background: var(--color-field);
  border: 1px solid var(--color-warn, #c66);
  color: var(--color-warn, #c66);
}
```

`sort-filter-lens` declares five, three of which `chat` does not:

```css
.error {
  margin: 0.8rem 1rem;        /* chat does not declare */
  padding: 0.5rem 0.7rem;     /* chat does not declare */
  border: 1px solid var(--color-warn, #c66);
  border-radius: var(--radius-md, 6px);   /* chat does not declare */
  color: var(--color-warn, #c66);
}
```

Specificity decides the contested properties — `.chat-app .bubble.error` is
`(0,3,0)` and wins `border` and `color`. **But specificity never arises for
margin, padding and border-radius, because only one rule declares them.** So:

> Every error bubble in `chat` gains `0.8rem 1rem` of margin, `0.5rem 0.7rem` of
> padding and a `6px` radius **whenever `sort-filter-lens` happens to be mounted
> in the shell, and loses them when it is not.**

The same mechanism applies to any of the 19 `.row` sites whose own rule omits
`display`, `flex-direction`, `gap`, `padding` or `border-bottom` —
`sort-filter-lens`'s `.row` sets all five.

**A member's appearance depends on which sibling is on screen.** Under
independent deploys that is not debuggable by the team that owns the broken
surface.

## The part that is easy to get wrong

`sort-filter-lens` is rated `debt: critical` in the registry, and the instinct is
to read it as the badly-built member. **The sweep found the opposite, and the
distinction decides the fix.**

It has the **best accessibility labelling of the five members in its cluster** —
five `aria-label`s, `role="toolbar"`, `role="menu"`, `aria-expanded`, a real
`<label for>`. And it owns the **most capable single control in the product**: a
persisted three-key sort with rank badges, direction toggles, a grouped column
picker that disables already-used columns, and a `Reset`.

> This is a **packaging failure, not a craft failure.** The member did good design
> work and shipped it in a container that leaks. The fix is containment, and the
> sort toolbar is the organ most worth promoting *out* of it — not the member most
> worth rewriting.

Reading `critical` as "bad member" would have produced exactly the wrong
intervention. It is also a caution about the registry's `debt` column: it rates
remediation weight, and nothing in it distinguishes *leaky packaging* from *poor
work*.

## Proposed work

**Phase 1 — contain, without touching the design.** Prefix all 61 classes with the
member's `sf-` prefix, or wrap `app.css` under `.sort-filter-lens`. Purely
mechanical, no visual change intended, and it is independently verifiable: run
`pnpm design:drift` before and after and F3 goes from 100 findings to zero.

**Verify by measurement, not by eye.** Screenshot `chat`'s error bubble with
`sort-filter-lens` mounted and unmounted, before the change, and confirm the
difference. Then confirm it is gone after. *The bug is invisible unless two
specific remotes are on screen together*, which is precisely why it survived.

**Phase 2 — decompose.** 729 lines in one `.svelte` file with zero components is
what made the leak possible: with no component boundaries there was nowhere for
scoped `<style>` to live. Extract the sort toolbar first — it is the promotion
candidate.

**Phase 3 — the phantom tokens.** This member carries all four:
`--color-accent-bg`, `--color-warn`, `--radius-md`, `--font-sans`. Its chips
currently render a **magenta border on a blue fill** in every mode, because
`--color-accent` resolves federally to electric-magenta while `--color-accent-bg`
falls back to a blue literal the theme never chose. Blocked on
[[The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]].

**Phase 4 — two smaller defects** found in the same pass: `@keyframes
pending-spin` runs `infinite` with no `prefers-reduced-motion` guard (the federal
layer shipped a global guard in Phase 1; `search-results` honours it locally), and
a `<span role="button" tabindex="0">` nested **inside** a `<button>` in the
sort-chip remove control, which is invalid nesting.

## The containment problem is one member, not a pattern

Worth stating plainly, because it bounds the work. The other members in the same
sweep are fully contained: `search-and-add` 47/47 selectors under `.saa-`,
`search-results` 76/76 under `.srq-`, `org-workbench` 131/131 under `.ow-`,
`person-enrichment` 110/110 under `.pe-`/`.pd-`. Zero leaks across all four.

**F3 compliance is otherwise excellent.** This is one member, one file, one
afternoon.

## Related

- [[The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] — Phase 3 is blocked on it
- [[../specs/Design-System-Convergence]] — the registry; the sort toolbar is a promotion candidate
- [[../loops/Converge-The-Federated-Design-System]] — the sweep that measured this
- `DESIGN.md` §The federation contract (F3)
