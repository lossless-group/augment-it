---
title: "The list-surface paradigm — CardRow, ListContainer, and where selection lives"
lede: "Sixteen of eighteen members are the same shape: controls up top, a generated list below. Five decisions are open; the BEM rollup makes most of them reversible."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Undecided
tags:
  - Decision
  - Augment-It
  - Design-System
  - Component-Library
  - CardRow
  - Layout
  - Accessibility
site_uuid: 4a865437-10ce-48cd-8bf1-9eb1ed3e040b
hex_code: ox4fsy
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# The list-surface paradigm

> `context-v/decisions/` is **experimental**, and the context-vigilance skill
> describes it as *"artifacts of clear decisions made."* This one is open on
> purpose — `status: Undecided` — which the sibling repos already do
> (`self-host-stack` carries `status: Open`). Surfacing the divergence rather
> than normalizing it, per the skill.
>
> **How to use this file:** each decision below has options, a current leaning,
> and what would settle it. The agent resolves them **as the work reaches them**,
> writes the outcome into the *Decided* line, and does not stop to ask. The
> operator overturns anything they disagree with.

## Why Care?

After `Button` (19 units) and `Chip` (13 units), the remaining raw controls
stopped being a grab-bag and became one shape.

**Counted 2026-09-13 — members with a header/controls region and an
`{#each}`-rendered list: 16 of 18.**

`affiliation-rating-resolver` · `chat` · `corpora-curator` · `docs-portal` ·
`enhanced-records-list` · `org-workbench` · `pack-runner` ·
`person-db-resolver` · `person-enrichment` · `record-collector` ·
`record-db-resolver` · `records-surface` · `request-reviewer` ·
`response-reviewer` · `search-results` · `sort-filter-lens`

Named instances: SearXNG result lists, CSV record-import previews, People and
Orgs filter lists, prompt pickers, corpus source lists, connector palettes.

**This is not the next component. It is the shape of the product.** Roughly
*"a small window with some functionality up top that generates a list of
objects."*

## The paradigm, as sketched

```
<ListContainer>              ← the small window: header, controls, the thing that generates
  <CardRowsColumn>           ← the scrolling list region
    {#each items as item}
      <CardRow--SomeKind>    ← one object
    {/each}
  </CardRowsColumn>
</ListContainer>
```

**It is already in the code.** `apps/prompt-template-manager/src/App.svelte:205`:

```svelte
<aside>                            <!-- ListContainer -->
  <h2>Prompts</h2>
  <Button>+ new prompt</Button>    <!--   controls up top -->
  <ul class="prompts">             <!--   CardRowsColumn -->
    {#each prompts as p (p.prompt_id)}
      <li class:selected={…}>      <!--     CardRow -->
        <button class="prompt-select">
          <strong>{p.name}</strong>
          <span class="muted">→ {p.output_column}</span>
        </button>
        <Button size="icon">…      <!--     a sibling action -->
```

Sixteen members wrote that independently.

---

## D1 · One component with props, or many components with BEM names?

**Options.** (a) One `CardRow` taking a `styleClass`/variant. (b) Many files —
`CardRow--SearchResultItem`, `CardRow--CsvPreviewRow`,
`CardRow--OrgFilterItem`. (c) Both: a base plus named wrappers.

**Leaning: it does not matter yet, and that is the finding.** The BEM naming
convention makes this **reversible**: `grep 'CardRow--'` aggregates the
population whether it is one file or sixteen. Start as whatever each member
needs, converge when the shared surface is obvious, and neither the docs nor the
rollup change.

Two supporting facts:

- **BEM component filenames are already house convention** —
  `packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte` ships
  today. This is applying an existing convention consistently, not inventing one.
- The operator is explicitly **not** trying to make one component look like
  sixteen things. Over-abstraction is a named non-goal.

**What settles it:** run the first three members (D5). If one API covers all
three with no rung-4 escapes, collapse to (a). If any member needs an escape on
its *first* try, take (b) and let the rollup document the spread.

**Decided:** *(open)*

---

## D2 · Naming

**Constraint, stated by the operator:** *"the code should be readable by junior
engineers, shouldn't have to go read documentation to infer what it is, how it
works, what it does."* That is the test any name has to pass.

**Candidates on the table:** `CardRow` · `ListItemCardRow` · `ListContainer` ·
`ListColumn` · `CardRowsColumn` · `Selector` · `ClickSelectWrapper` ·
`ClickSelectContainer` · `CheckBoxSelect`.

**Leaning:** `CardRow` over `ListItemCardRow` (shorter, and "list item" is
implied by the container). `ListContainer` over `ListColumn` — the surface is
not always a column and the name should not promise one. Modifiers spell the
domain noun, not the member prefix: `CardRow--SearchResultItem`, not
`CardRow--Srq`, so the rollup reads as a catalogue of *kinds of thing* rather
than a list of members.

**What settles it:** read the three pilot members' markup aloud. If a name needs
a sentence of explanation, it fails.

**Decided:** *(open)*

---

## D3 · Where selection lives — and the trap in it

**Proposal:** selection is a **composable behaviour passed into** `CardRow`, not
baked into it. `<ClickSelectWrapper>` makes the whole card surface select the
card; `<CheckBoxSelect>` is a different one; more can follow.

**This is the right instinct** and matches how Radix and shadcn separate
behaviour from presentation. **But there is a trap, and it is the exact defect
removed from `sort-filter-lens` today** — a `<span role="button">` nested
inside a `<button>`, measured at 14×14px, 34% of the WCAG 2.2 SC 2.5.8 floor.

Every row surface **already contains controls**:

| row surface | controls inside |
|---|---|
| `search-results/SearchCard` | **7** |
| `prompt-template-manager/App` | **6** |
| `record-collector/RecordSetCard` | 3 |
| `corpora-curator/SourceList` | 3 |
| `docs-portal/MemberLibraries` | 3 |

**If the wrapper renders a `<button>`, all sixteen members get interactive
content inside interactive content.** Invalid HTML, broken accessible names,
unreachable inner controls.

**Leaning — the wrapper is never a button.** The row's primary label is the real
control, stretched across the card by a pseudo-element:

```css
.cardrow__primary::after { content: ''; position: absolute; inset: 0; }
.cardrow__action        { position: relative; }  /* sits above the overlay */
```

Click anywhere selects; the delete button still works; one accessible name; no
nesting. `CheckBoxSelect` needs none of this — a real `<input type="checkbox">`
with a `<label>` is simpler and better.

**What settles it:** a probe on `search-results/SearchCard` (7 controls, the
worst case). If the overlay pattern keeps all seven reachable by keyboard and
pointer, adopt it federally.

**Decided:** *(open)*

---

## D4 · Is `Selector` its own component, a wrapper, or both?

Both, and they are different layers. **The Selector owns *which one is chosen*;
the CardRow is the item.** `prompt-select` and `rs-select` are CardRows *inside*
a Selector — not a competing classification.

That makes `<Selector styleClass="Popdown">` coherent: one selection widget,
several presentations. Column-shaped (`prompt-select`, `rs-select`) and
popdown-shaped (`WorkspaceSwitcher`, `ConnectorPalette` ×2, `JumboPopdown`,
`DevelopersMenu`, `CorpusPicker`) are the same widget rendered differently.

**The number that argues for building it:**

| file | `role="menuitem"` | arrow-key handler |
|---|---|---|
| `chat/ChatSurface` | 1 | **0** |
| `response-reviewer/ConnectorPalette` | 0 | **0** |
| `sort-filter-lens/App` | 0 | **0** |
| `pack-runner/ConnectorPalette` | 0 | **0** |
| `shell/JumboPopdown` | 1 | **0** |
| `shell/DevelopersMenu` | 0 | **0** |

**Six `role="menu"` declarations, zero arrow-key handlers, four with no
`menuitem` children.** Plus a `role="radiogroup"` with no radios in
`search-and-add`. Every one announces a keyboard widget the member does not
implement.

Six members got this wrong independently, which means it is not carelessness —
**the roving-tabindex contract is the substance of a Selector, and nobody should
be hand-rolling it six times.**

**Leaning:** `Selector` is its own organ, sequenced **after** `CardRow` and
**before** the containers, because it is a live a11y defect in six places where
the containers are not.

**Decided:** *(open)*

---

## D5 · Does `ListContainer` become how layout enters the federal layer?

[[../issues/The-Federation-Has-No-Layout-Layer]] deferred layout deliberately and
set an expiry: *"when three independent members reach for the same layout shape,
it stops being theirs."*

**It is 16 of 18. The condition is long past.**

And this is a better route than that issue imagined. Not an abstract spacing
system nobody adopts — `padding: var(--space-*)` is still at **0 uses against
912 raw paddings** — but **one concrete container that 16 members already need**,
which pulls the spacing tokens in behind it because they are what it is built
from. **Layout arrives as a component, not as a doctrine.**

`ListContainer` takes a layout and a preferred `CardRow` styleClass, and that
composition *is* the convergence.

**Leaning:** yes. When this ships, amend the layout issue rather than leaving it
saying layout is deferred.

**Decided:** *(open)*

---

## D6 · Which three members pilot it

**Slow-roll the first three** to establish the pattern before any sweep — the
operator's call, and the Button rollout supports it (the API stabilised in the
first three members and never moved again).

**Leaning — pick three that *disagree*,** so the styleClass surface is forced to
be real rather than fitted to one case:

| member | why this one |
|---|---|
| `search-results` | rich, multi-line, **7 controls per row** — the worst case for D3 |
| `prompt-template-manager` | dense two-line, selection-driven — the D4 case |
| `record-collector` | card with a disclosure and destructive actions |

If one API survives those three it will survive the other thirteen. If it does
not, we learn it at three members instead of sixteen.

**Decided:** *(open)*

---

## Non-goals, stated

- **Not** one component contorted into sixteen appearances. The operator said so
  explicitly; over-abstraction is a failure mode here, not a target.
- **Not** a sweep. Three members, then reassess.
- **Not** renaming anything that already works to fit the paradigm.

## Related

- [[../issues/The-Federation-Has-No-Layout-Layer]] — D5 unblocks this
- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the ladder these inherit
- [[../specs/Design-System-Convergence]] — the organ registry
- [[../plans/Tidy-Every-Consumer-Onto-The-Shared-Primitives]] — Phase 4 lists these organs
- [[../loops/Adopt-The-Shared-Chip-In-One-Member]] — the classification tree the CardRow loop will extend
