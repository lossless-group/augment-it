---
title: "The federation has no layout layer, so seven of its eight deviations are about placement"
lede: "The design system standardised everything that goes inside a box and nothing about the boxes. Consumers keep their freedom for now — deliberately, and on the record."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Open-Deliberately-Deferred
tags:
  - Issue
  - Augment-It
  - Design-System
  - Layout
  - Federation
  - Design-Drift
  - Diverge-Promote-Enforce
site_uuid: dbb21278-c5c5-46dc-863b-38ecad034083
hex_code: r39mh8
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# The federation has no layout layer

## Why Care?

Eight `data-deviation` declarations exist across the whole federation after
nine Button migrations. **Seven of them are about placement.** Alignment,
margin, grid column, stretch-in-a-flex-column. Exactly one is an actual
appearance deviation.

That ratio is not a sign that members are undisciplined about layout. It is a
sign that the escape hatch was the only door in the building, so everything
walked through it — including the things that were never deviations at all.

The immediate cost was legibility. A catalog's **Deviations** section that lists
five margin adjustments teaches its reader to skim, and skimming is precisely
where the one real deviation hides. [[../specs/Component-API-Contract-And-The-Control-Scale|Rung 0]]
fixed that by ruling layout out of the deviation mechanism entirely. But rung 0
answers *"where does this get recorded"*, not *"who decides it"* — and the second
question is still open.

## What is actually missing

`packages/theme` ships a ten-step spacing scale. `packages/shared-ui` ships
three components: `Button`, `ConfidencePill`,
`ToggleHeader__PromptOrPackage--Icons`.

**Every one of those is a thing that goes inside a box. None of them is a box.**

There is no `Stack`, no `Row`, no `Cluster`, no `Grid`, no `Container`,
no `Panel`, no `Toolbar`. There are no container widths, no breakpoint tokens,
no density scale, no rules about what a page's outermost frame looks like. The
federation standardised the contents and left the containers to nineteen
independent authors.

### Counted, 2026-09-13

| Measure | Count |
|---|---|
| `data-deviation` declarations, federation-wide | **8** |
| …of those, describing layout or placement | **7** |
| `padding:` with a raw length | **912** |
| `padding: var(--space-*)` | **0** |
| `gap:` with a raw length | 924 |
| `gap: var(--space-*)` | 26 |
| `max-width:` occurrences | 71 |
| …distinct values among them | **21** |
| `@media (width)` breakpoints, all members | 4 occurrences, 3 distinct |
| Members with any breakpoint at all | **3 of 20** |
| Layout primitives in `packages/shared-ui` | **0** |

Two rows deserve to be read twice.

**`padding: var(--space-*)` is zero.** Not low — zero. The spacing scale was
[[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z|shipped
deliberately]] and has been adopted by nothing except the components that shipped
with it. A scale nobody consumes is not a standard, it is a proposal with good
formatting.

**Seventeen of twenty members have no responsive behaviour whatsoever.** Not
"responsive in a way we disagree with" — absent. Nobody has decided this is fine;
nobody has decided it isn't.

## What this is not

It is not drift, and the [[../loops/Converge-The-Federated-Design-System|convergence
loop]]'s five verdicts do not apply to it. PROMOTE, CONVERGE, SANCTION, DEMOTE and
WATCH all presume **two or more members solving the same problem differently**,
where the work is picking a winner. Here nineteen members solved a problem the
platform never posed. There is no candidate to promote, because nobody diverged
from anything.

This is the same distinction the user drew about the members outside the
registry: *"We started with the Design System because there is cleanup to do. For
the others, there's just nothing. Nothing needs to be cleaned, just needs to be
implemented."* Layout is a **nothing-yet**, not a mess. Twenty-one `max-width`
values are not twenty-one bad decisions; they are twenty-one local answers to a
question that was never asked centrally.

Reading it as drift would invert the governance model. `diverge → promote →
enforce` starts with divergence, and divergence is only meaningful against a
standard. Enforcing before exploring would skip both of the first two steps.

## The interim ruling

**Consumers keep layout. Deliberately, on the record, and with an expiry
condition.**

1. **Layout is the parent's job** ([[../specs/Component-API-Contract-And-The-Control-Scale|rung 0]]).
   A shared component never positions itself; the member aligns it, or a plain
   wrapper div does. This is already true and already cheap — every one of the
   seven cases costs zero or one declaration.
2. **Layout is not a deviation and does not get a `data-deviation`.** The
   Deviations section stays scarce enough to be worth reading.
3. **No member is asked to adopt a spacing token it does not already use.** The
   912 raw paddings stay. Converting them before a layout layer exists would be
   churn that has to be redone once the containers arrive.
4. **Raise, don't chase.** Layout observations from migrations land here, not in
   the migration diff.

The expiry condition is the same forcing function the rest of the practice uses:
**when three independent members reach for the same layout shape, it stops being
theirs.** A `Toolbar` has already been sighted twice (scanbar rows in two
members); a `SelectableRow` / list-row organ has been sighted four times across
`record-collector`, `prompt-template-manager`, `docs-portal` and
`search-results`, and is now the single most-cited missing organ in the
federation. That one is arguably already over the line.

## The path, when it opens

The right sequence is **exploration → spec → plans**, and none of it exists yet.
Naming the shape so it can be picked up cold:

- **Exploration** — *what is a layout layer for a federation of sovereign
  micro-frontends?* The question is genuinely open and probably has a
  house-specific answer. Module Federation means a member is mounted into a
  shell it does not control, which makes a page-level container more of a
  negotiation than a component. Prior art worth reading rather than recalling:
  Every Layout's primitives, Tailwind's container/flow model, Radix's layout
  escape hatches, Open Props' sizing scales — all pinned in
  `studies/frontend-ui-kits-component-libraries`.
- **Spec** — the organ registry entry per shape, plus whatever the federation's
  equivalent of `--container-*` and breakpoint tokens turns out to be. Slots
  into [[../specs/Design-System-Convergence]] beside the control organs.
- **Plans** — a per-shape rollout, one organ at a time, the way Button went. The
  Button arc is now the proven template: author the primitive, prove it on one
  member, then one subagent per member with issues raised not chased.

Nothing above should start before Button is finished and Chip is planned. This
file exists so the gap is recorded rather than rediscovered a third time.

## Related

- [[../specs/Component-API-Contract-And-The-Control-Scale]] — rung 0, and the ladder it completes
- [[../loops/Adopt-The-Shared-Button-In-One-Member]] — where the seven deviations were written
- [[../loops/Converge-The-Federated-Design-System]] — the five verdicts, and why they don't apply here
- [[../specs/Design-System-Convergence]] — the organ registry this would extend
- [[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] — how the spacing scale got here
- [[../patterns/Setup-Microfrontend-with-Proper-Monorepo-Configurations]] — where a layout default would eventually be wired in
