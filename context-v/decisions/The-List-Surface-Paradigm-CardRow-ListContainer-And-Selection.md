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
> and what would settle it.
>
> **Leaving one open is the correct outcome, not a debt.** An open decision is how
> we know to come back to it; closing one early to tidy the file destroys exactly
> the signal the file exists to carry. Resolve a decision when the *work forces
> it* — when code cannot be written without an answer — and not before. Until
> then a leaning is enough, and a leaning is not a decision.
>
> **Who closed it matters.** An entry marked *Decided* should say whether the
> operator decided it or the agent did. An agent's judgement call recorded as
> settled reads, six weeks later, like something the team agreed — and nobody
> will know to revisit it.

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

**DECIDED 2026-09-13 — a `SelectWrapper` may not be wrapped around a card that
contains controls. The multi-control case gets its own named component:
`SelectWrapper--MultiControls`.**

This is better than hiding the distinction behind one component, which was the
earlier leaning. A single `SelectWrapper` that quietly switched strategies would
mean an engineer reaching for it **never learns that the multi-control case is
dangerous**. The named variant puts the hazard at the call site, where the
decision is actually made.

It is the same principle as the override ladder's rung 3: `radius="lg/60"` is
deliberately countable, because *the escape hatch is also the detection
mechanism*. A name you can `rg` for is a population you can measure.

The operator's reasoning, which applies well beyond this component: **spell the
variant even when it is not strictly necessary.** It organises, it cues the
reader, it makes `rg` trivial, it enables script-based rollups, and it gives
Graphify a real edge to draw. A distinction that exists only in a maintainer's
head cannot be counted.

### How each one works

| | when | mechanism |
|---|---|---|
| `SelectWrapper` | the card holds **no** interactive descendants | may render a real `<button>` — simplest, best names, no tricks |
| `SelectWrapper--MultiControls` | the card holds **any** control | never a button. The row's primary label is the real control, stretched across the card by a pseudo-element; sibling controls sit above it |

```css
.cardrow__primary::after { content: ''; position: absolute; inset: 0; }
.cardrow__action        { position: relative; }  /* above the overlay */
```

Click anywhere selects; the delete button still works; one accessible name; no
nesting. `CheckBoxSelect` needs none of this — a real `<input type="checkbox">`
with a `<label>` is simpler and better.

### Enforce it, do not just document it

Both `Button` (`size="icon"` without an accessible name) and `Chip`
(`dismissible` without `dismissLabel`) already **fail loudly in the console and
mark themselves with `data-a11y-error`**. `SelectWrapper` gets the same
treatment: on mount, query its own subtree for
`button, a[href], input, select, textarea, [tabindex]` and, if it finds any,
console-error telling the author to use `--MultiControls`.

That is today's lesson applied — *a sandbox that is not asserted is not a
sandbox*. A convention that only lives in this file will be violated by the
fourth engineer who never reads it.

### The variant family — and the axis problem worth naming

The operator proposed `SelectWrapper--SingleControl` and `SelectWrapper--ClickBody`
and asked for a read. **Those two names sit on different axes**, and that is the
useful thing to surface:

| axis | reads as | examples |
|---|---|---|
| **A — what you click** | the thing the engineer is *choosing* | `--ClickBody`, `--ClickPrimary`, `--Checkbox` |
| **B — what the card contains** | a *constraint*, derived not chosen | `--SingleControl`, `--MultiControls` |

`--ClickBody` is axis A. `--SingleControl` is axis B. Mixing them means two
variants can both be true of one card, which is where families rot.

**Leaning: name on axis A, enforce axis B.** The engineer picks what you click;
the component *checks* whether the card's contents make that legal.

### The family, grounded in what is actually in the tree

Measured 2026-09-13:

| mechanism | sightings | variant |
|---|---|---|
| row's primary control is a `<button>` | **8** | `SelectWrapper--ClickPrimary` |
| whole-surface click intent | (the `--ClickBody` case) | `SelectWrapper--ClickBody` |
| `<input type="checkbox">` in a list | **5 members** | `SelectWrapper--Checkbox` |
| `<input type="radio">` | **0** | *do not build* |
| row is an `<a href>` | **4** | **not selection** — see below |

`aria-pressed` 29 · `aria-current` 2 · `aria-selected` 1. The aria vocabulary is
almost entirely toggle-shaped today, which is itself a finding.

**Two calls inside this:**

- **Rename `--SingleControl` → `--ClickPrimary`.** It then reads as a set with
  `--ClickBody`: *what do you click — the body, or the primary?* `--SingleControl`
  describes the card's composition, which is the constraint, not the choice. This
  is a genuine coin-flip if the team thinks in terms of card composition rather
  than click target — overturn it freely.
- **Row-as-anchor is not a `SelectWrapper` at all.** Four sightings, and they
  *navigate* rather than select. That is `CardRow--Link`, a different organ
  concern, and conflating it would put a navigation affordance inside a selection
  component.

- **Do not build `--Radio`.** Zero sightings. Same discipline that keeps the
  federal layer honest — a spacing scale sitting at 0 uses against 912 raw
  paddings is what happens when you ship ahead of consumers.

### Axis B becomes the enforcement, not a name

Measured: **every row-rendering surface in the federation contains controls.
Minimum 3, maximum 23. Not one has zero.**

| surface | controls |
|---|---|
| `person-db-resolver/App` | 23 |
| `affiliation-rating-resolver/App` | 21 |
| `org-workbench/RelatedOrgs` | 16 |
| `prompt-template-manager/App` | 11 |
| `docs-portal/MemberLibraries` | 4 |
| `person-enrichment/LinkList` | 3 |

*(File-level counts, so an upper bound per card — confirmed by reading:
`prompt-template-manager`'s `<li>` holds a primary button **and** a sibling icon
Button.)*

So `--ClickBody` is the variant that needs the overlay, always, in this codebase.
The check earns its place: on mount, query the subtree for
`button, a[href], input, select, textarea, [tabindex]`; if `--ClickBody` finds
any and is not using the overlay, console-error and set `data-a11y-error`. Same
mechanism `Button` uses for `size="icon"` without a name and `Chip` for
`dismissible` without a label.

**DECIDED — by the operator:** a `SelectWrapper` may not wrap a card that contains
controls; the cases get distinct named variants rather than one component that
switches strategy silently. That rule is settled.

**STILL OPEN — agent leanings inside it, deliberately not closed:**

- Name on axis A (`--ClickBody` / `--ClickPrimary` / `--Checkbox`) and enforce
  axis B at runtime. *Leaning, not settled — the axis argument is sound but the
  vocabulary is the team's to pick.*
- Rename `--SingleControl` → `--ClickPrimary`. **A genuine coin-flip.** If the
  team reasons about card composition rather than click target, `--SingleControl`
  is the better name and this should be overturned.
- `CardRow--Link` is a separate organ from selection. *Leaning — four sightings,
  none examined closely yet.*
- Do not build `--Radio`. *Leaning — zero sightings today, and that can change.*

None of these blocks writing code. The first `--ClickBody` call site forces the
first one; the rest can stay open indefinitely.

### The checkbox variant's invariant — added 2026-09-13 from its first sweep

`SelectWrapper--Checkbox` is the only selection variant that needs **neither an
overlay nor a MultiControls sibling**, and the reason is load-bearing rather than
incidental:

> **Its label is sized to its own content and must never be stretched to the row.**

In every multi-control row it was adopted into, the label is a **sibling** of the
other controls, not an ancestor — so nothing nests and nothing is captured. That
works *because it shrink-wraps*. Give it `flex: 1` or `position: absolute;
inset: 0` to make "the whole row" clickable and it swallows the neighbouring
buttons, landing straight back in the `--ClickBody` problem this variant avoids.

A future *"make the checkbox row bigger"* request will look entirely reasonable
and is the one change that breaks it. The note is in the component too, so the
request meets the reason before it meets the CSS.

### The sweep corrected the premise it was launched on

The brief said *one* member ships a 13×13 checkbox. Measured: **all nine
hand-rolled checkboxes across all five members are 13×13** — 54% of the WCAG 2.2
SC 2.5.8 floor, every one, without exception. Two of them had **no accessible name
at all**.

Worth keeping as a pattern beyond this component: **a native control is not an
accessible one if nobody sized it.** *"We use the platform control"* reads as a
safety claim and measured as a uniform failure.

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

### Sharpened by the sweep — `direction` belongs to the container

One member ran four treatments of **identical children** —
`{row, column} × {280px grid track, full-width list}` — with no member CSS beyond
container-level rung 0:

| | geometry | result |
|---|---|---|
| grid + `row` | 281×172, the two cards disagreeing on internal height (72 vs 154) | **breaks** |
| grid + `column` | 281×121, both identical | correct |
| list + `column` | 1152×88 | correct |
| list + `row` | 1152×57, link beside the body | correct |

**Three of four render cleanly, and the one that breaks is the wrong argument to
the right component** — not a missing organ. So `Card` is not separate from
`CardRow`; a tile is a `CardRow` in a narrow track.

The sharper result is *which* thing decides the prop: `direction` is determined
entirely by **the container's width** and never by the card's content — the two
correct treatments have the same children. **So `direction` is a prop the
container should own**, which makes it `ListContainer`'s business rather than a
per-call-site decision.

Contrast with the table result, which is a genuinely different shape:
`display: table-row` cannot be a flex container at all, and column alignment is a
*cross-row* constraint no per-item prop can express. `CardRow`'s tile/row split
has no such constraint — one flex box, one axis, one prop.

### When does a pattern become a layout? — operator's framing, and the answer it implies

> *"In Astro, layouts are just components that happen to be in the layout folder.
> You can totally nest them. So at what point does a pattern become a layout?
> …Is that a layout? I think it's fine if it is."*

The observation is right and worth building on: **a layout is not a different kind
of thing, it is a component with a particular job.** No separate mechanism, no
special folder semantics, and nesting is free.

**Rung 0 already drew the line without anyone noticing.** It says *layout is the
parent's job*, which makes the definition usefully close to tautological:

> **A layout is a parent whose job is layout.**

That resolves the nesting question directly — nested parents, each owning
placement of its own slot, all the way down.

**The operational test:** *does it place children whose shape it deliberately does
not know?*

| | knows its children | verdict |
|---|---|---|
| `CardRow` | yes — title, meta, actions | component |
| `ListContainer` | no — a header slot and a scroll region, contents unknown | **layout** |
| `LayoutHeader--FilterOptions` | no — places a slot it does not own | **layout** |
| two-column, list left / list right | no | **layout** |

So yes, the operator's examples are layouts, and that is fine.

### The rule that stops "layout" from meaning nothing

If anything can be a layout the word carries no information. What keeps it honest
is **token ownership**:

> **A layout may set spacing, placement and container width. A component may not.**

That is rung 0 restated from the other side — and it is the lever on the problem
[[../issues/The-Federation-Has-No-Layout-Layer]] names. **912 raw paddings, 0 uses
of `var(--space-*)`.** Members hand-roll spacing because nothing owns it. Give
layouts the job and members stop, which is a far better route than asking nineteen
teams to adopt a scale by discipline.

### Naming: block is the structural role, modifier is the domain

The operator offered `<FilterOptionsContainer--Header>` and
`<LayoutHeader--FilterOptions>`. Let the rollup decide it, since that is what the
BEM convention is buying:

```
ListContainer--FilterOptions
ListContainer--SearchResults
LayoutHeader--FilterOptions
CardRow--SearchResultItem
```

`rg 'ListContainer--'` answers *"every list surface we have."*
`rg -- '--FilterOptions'` answers *"everywhere filter options appear."*

Put the domain in the **block** and the second rollup still works while the first
is lost. Structural role in the block, domain in the modifier, keeps both.

### Context-passing shipped and is UNEXERCISED — recorded honestly, 2026-09-13

`ListContainer` publishes `direction` and `CardRow` reads it. Across eight
adopting members it removed the prop from **zero call sites**.

Three still name `direction="column"` explicitly, and an explicit prop wins — so
context changed nothing for them. Every other call site omits it, but
`layout="list"` publishes `row`, **which is already `CardRow`'s own default**, so
the context read is a no-op reproducing the fallback.

It pays off only at `layout="grid"`, and exactly one member in the federation has
a grid list. The 280px-track evidence that motivated it lives in a member shape
that four of four pilots do not have.

**So: correct, and premature.** It costs a `getContext` in the most-instantiated
component in the federation, and it buys one call site today. Left in place
because the one grid adopter does work, and because removing it would re-open a
decision nothing is pressing — but it is **not** evidence that the mechanism was
right, and it should be justified by a second grid adopter before anyone builds on
it.

Worth keeping as a pattern: *a mechanism that reproduces the default it replaced
is indistinguishable from no mechanism.* The way to tell is to count call sites
that actually changed, not call sites that now omit a prop.

**Decided — by the operator:** layouts are components; nesting is expected; the
examples given qualify.
**Leaning — agent, open:** the does-it-know-its-children test, the token-ownership
rule, and block-is-structural-role naming. None blocks code until the first
`ListContainer` is written.

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

## The naming principle, promoted out of D3

D3 produced a rule general enough to outlive it:

> **Spell the variant, even when it is not strictly necessary.**

A `SelectWrapper--MultiControls` that behaved identically to `SelectWrapper`
would still be worth naming, because the name:

- **organises** — related things sort together
- **cues the reader** — the modifier says *this case is different* before anyone
  opens the file
- **is trivially greppable** — `rg 'SelectWrapper--'` is the whole query
- **enables script rollups** — `rg -o 'CardRow--\w+' | sort | uniq -c` is a
  living catalogue with no doc to maintain
- **gives Graphify a real edge to draw** — a distinction that exists only in a
  maintainer's head is invisible to every tool we own

This is the same argument the override ladder makes for rung 3 and the same one
the organ registry makes for fingerprints: **a thing you can count is a thing you
can govern.** It applies to any variant, in any organ, from here on.

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
