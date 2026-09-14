---
title: "Adopt the shared Button in one member — the per-member executor for the Button rollout"
lede: "One member per run, never a sweep. Replace the buttons, delete the recipes they made redundant, raise everything else."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Draft
tags:
  - Loop
  - Augment-It
  - Design-System
  - Component-Library
  - Microfrontends
site_uuid: e2865d13-48ce-4ee2-8a67-7b1817ee6ae0
hex_code: lj2bo3
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Adopt the shared Button in one member

> **One member per run. Never a sweep.** The contract is
> [[../specs/Component-API-Contract-And-The-Control-Scale]]; this is the executor.
> Where they disagree, the spec wins and the disagreement is a bug in this loop.

## What you are doing

Replacing a member's hand-rolled buttons with `@augment-it/shared-ui`'s `Button`,
and **deleting the CSS that replacement made redundant.**

> **The deletion is the point of the job.** A member that adopts the component and
> keeps its recipes has added a dependency and removed nothing. If your diff has
> no red in it, you have not finished.

## The rollout, in numbers

302 `<button>` elements across 18 members. Five members carry **zero `aria-*`
attributes** — `org-workbench` has 61 buttons and not one. Button is accessible by
construction: `type="button"` by default, real `disabled` rather than a class,
`:focus-visible` that will not double-paint against the federal rule, and
`size="icon"` refusing to render without an accessible name. **Those five members
gain the most and will show the largest measurable delta.**

## The API you are adopting

```svelte
<Button variant="primary" size="md">resolve →</Button>
```

`variant`: `primary` · `secondary` · `outline` · `ghost` · `destructive` · `link`
(default `secondary`)
`size`: `sm` · `md` · `lg` · `icon` (default `md`)

Override rungs, in order of preference — **never a raw value**:

### 0 — layout is the parent's job, and is not a deviation

**A Button never positions itself.** If it needs to sit at the end of a row, align
to a baseline, right-align in a grid column, or stop stretching in a column-flex
container, that is the *container's* concern.

Two spellings, both free:

```css
/* the parent owns alignment */
.my-row { display: flex; align-items: flex-end; }

/* or wrap it — a plain div, usually zero CSS */
<div class="my-row-end"><Button …>Not now</Button></div>
```

> **This rung exists because the absence of it was measured.** Five layout-only
> overrides appeared across three independent migrations —
> `margin-inline-start: auto`, `justify-self: end`, `align-self: center`, and
> twice "a Button inside a column-flex container stretches to full width." Every
> one carried a `data-deviation` reading some variant of *"the ladder has no rung
> for layout."*
>
> **Placement is not a design departure**, and routing it through rung 4 puts it
> in the member's catalog under *Deviations*, where it buries the real ones. A
> deviation section listing five margin adjustments teaches a reader to skim it.

**Why it happens:** `Button` sets a `height` and never a `width`, so in a
`flex-direction: column` container it stretches. That is correct component
behaviour — a control that pinned its own width could not be used in a toolbar —
and the container is the only place that knows what the right answer is.

1. `variant` + `size`
2. `radius="lg"` — a token NAME
3. `radius="lg/60"` — `calc(var(--radius-lg) * 0.6)`
4. `class=` + `data-deviation="reason"` — legal, declared, and it shows up in the
   member's catalog under *Deviations*

## Steps

1. **Read the member's CSS first, all of it.** You are about to delete from it.
2. **Read the member's prefix out of `DESIGN.md` frontmatter first.** The directory name is not the prefix — `response-reviewer` is `resp`, `request-reviewer` is `req`. `--member <wrong>` fails closed with *Member not found*, which is good, but only after you have wasted the run.
3. **Check the dependency.** `@augment-it/shared-ui` should be installed in
   every member — if it is already in your `package.json`, skip this step and do
   **not** edit the file. If it is somehow missing, add — `"@augment-it/shared-ui": "workspace:*"` — then run
   `pnpm install`. **Do not stage `pnpm-lock.yaml`**: it is shared, every
   concurrent migration writes it, and the manager stages it once.
3. **Map each `<button>` to a variant** by what it *does*, not by how it looks.
   The accent-filled commit action is `primary`; the quiet default is `secondary`;
   a destructive action is `destructive` even if the member drew it grey.

   > **Preserving the member's current appearance is not a goal.** If the new
   > variant looks different from what the member drew, *that is the migration
   > working.* An agent's default instinct is to keep the pixels, and keeping them
   > is how a member that was drawn by eye manufactures false evidence for a
   > variant nobody needs.

4. **Replace, then delete.** Every recipe the replacement orphaned comes out.
   Verify with a search that nothing still references the class.

   **Look past the button recipes.** In the first migration the highest-value
   deletion was not a button rule at all — it was
   `.member select:focus, .member input:focus { outline: … }`, made redundant by
   the *federal focus ring* and actively painting a second ring in a second colour
   over it. A local `:focus` rule at class specificity beats `*:focus-visible`.
   Check for one.

   **Count the recipes yourself.** A central sweep undercounts: the first member's
   plan said four, the real number was eight.

5. **Run the gates** (below), **verify what you cannot see**, and stop.

## Gates

```
pnpm --filter @augment-it/<member> check     must be clean
pnpm --filter @augment-it/<member> build     a typecheck is not a build
pnpm design:drift --member <prefix>          must not INCREASE
pnpm design:drift                            federation count must not increase
```

> ⚠️ **Do not trust a baseline written in this document.** It has moved five times
> in one day — 99, 93, 56, 69, 72 — as checks were fixed and invisible members
> were registered. **Measure it yourself at the top of your run** and report
> before-and-after. The gate is *relative*: the number you measured must not go
> up. An absolute number here would have given one engineer 21 points of slack it
> did not know it had.

> ⚠️ **The federation count is not attributable to you while other migrations are
> running.** Several members migrate in parallel in one working tree, so
> `git status` will show files that are not yours and the federation number
> reflects everyone. **The member-scoped count is your attributable gate.** Report
> both, and name exactly which files are yours.

### The drift gate is blind to the actual deliverable

**`design:drift` has no button check at all.** A member can delete fourteen
rule-sets and seventy-seven lines and the gate will not move a single point.

Say that plainly to yourself before you start, because it has a sharp edge: **an
agent optimising for the gate would delete nothing.** The gate proves you did no
*harm*; only the diff proves you did the *work*. Report both, and treat a net
diff that is not strongly negative as a sign you have not finished.

### One browser, several agents

Under parallel migration the Playwright browser is **shared**, and other agents
will navigate your tab out from under you. This has happened: an `evaluate` ran
against the wrong member's DOM and returned another member's markup **while the
tab title still said the right thing** — a failure that produces confidently
wrong verification rather than an error.

**Make navigate-and-assert atomic — and the MCP browser cannot do this.**
`browser_navigate` and `browser_evaluate` are separate tool calls, so there is
always a window for another agent to move your tab. One engineer was navigated
away *mid-evaluate* and received a different member's DOM.

**Launch your own headless chromium from a node script via Bash instead.** Fully
isolated, and navigate + assert + measure genuinely is one call.

Either way, **assert on the member's root class inside the evaluate**, never the
tab title. A title can be right while the DOM is someone else's.

### The alias that silently does nothing — read this before you build a probe

**In rsbuild 2.x, `source.alias` is accepted and silently ignored. The key is
`resolve.alias`.** Getting this wrong does not error. It bundles the *real*
`@augment-it/workspace`, which finds a live workspace-service on this machine and
renders **real production data**.

This is worse than every other trap in this file, because the failure mode is a
*full, plausible page*. One engineer's probe reported 866 buttons and record-set
names like `investors-2026-07-01.csv 378 rows · 104 cols`, from a four-row
fixture. Another rendered 1,982 real responses and caught it only because the
numbers were too round to have come from an eleven-record stub.

**And on 2026-09-13 a probe in this state drove its own click-path through
`content_ingest.preview_url` → `corpus.add` and wrote a real file into live client
data** at `clients/reach-edu/corpus/…`. It violated the standing rule that
browser-driven reads are unrestricted and writes go only to a designated safe
target — not because the engineer ignored the rule, but because **nothing told it
it was talking to production.**

Three defences, all mandatory, because any one of them can be got wrong:

1. **`resolve.alias`**, never `source.alias`.
2. **Assert the stub is actually in the bundle before trusting a single number:**
   put a sentinel string in the stub and
   `grep -c '<sentinel>' dist-probe/static/js/*.js`. Zero hits means you are
   looking at production.
3. **Kill the network in `addInitScript`**, belt and braces:
   ```js
   await page.addInitScript(() => {
     window.WebSocket = class { constructor() { throw new Error('probe: no sockets'); } };
     window.fetch = () => Promise.reject(new Error('probe: no fetch'));
   });
   ```

A probe that renders an empty surface wastes your time. A probe that renders
production can write to it.


### Building the probe — the parts that are not guessable

Five engineers hit the same five walls. None of these produce an error; every one
produces a *confidently wrong pass*.

**Where the probe goes: `apps/<member>/probe/`.** An earlier version of this
playbook said "outside `apps/`", which is exactly backwards and self-defeating —
a probe outside `apps/` cannot resolve `@augment-it/*` at all. Verified in
`scripts/design-drift.mjs`: `findMemberFiles()` walks **only**
`apps/<member>/src`, and the S5 unregistered-member sweep enumerates **only
direct children of `apps/`**. A sibling of `src/` is therefore invisible to every
F-check and to S5, while inheriting the member's own `node_modules` — rsbuild,
plugin-svelte, `@augment-it/theme`, `@augment-it/shared-ui` — for free.

Corollary with teeth: **the fixture stub must not live in `src/`.** That
directory *is* scanned. Put it in `probe/` with everything else.

Delete the whole directory before the final gate run regardless.

**There is no Playwright in this repo.** Not in `apps/`, `packages/`, `e2e/`, or a
root `node_modules`, and adding one would touch `package.json` in a way nothing
here needs. It resolves from the MCP server's npx cache.

**Do not `find` for the binary and pick what turns up** — two engineers did and
both got a stale revision. Several playwright-core copies coexist in that cache at
different versions, and the newest one may pin a Chromium revision that is not
installed at all. Match them explicitly:

```bash
find ~/.npm/_npx -maxdepth 4 -type d -name playwright-core     # candidates
# then, per candidate, read the revision it actually requires:
cat <candidate>/browsers.json | grep -A2 '"name": "chromium'
find ~/Library/Caches/ms-playwright -maxdepth 1 -type d        # what is installed
```

Pick the playwright-core whose pinned revision **exists on disk**. One engineer's
"newest wins" heuristic selected a 1.63.0-alpha pinning revision 1243 with nothing
matching; 1.61.1 → 1228 was the working pair.

The binary's path and name both vary by age. Older revisions:
`chromium_headless_shell-<rev>/chrome-mac/headless_shell`. Newer:
`chromium_headless_shell-<rev>/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
Look for **both** names under the revision you matched.

**`require()`, not `import()`.** `await import(PW + '/index.js')` resolves to an
object with no `.chromium` on it, and fails as *"Cannot read properties of
undefined"* several lines later.

**The probe's rsbuild config must set `root: __dirname`.** rsbuild defaults `root`
to the nearest `package.json` directory — so from `apps/<member>/probe/`, passing
`-c rsbuild.config.ts` silently loads **the member's own config** and boots the
member on the member's port. One engineer's first run reported *"built in 0.41s"*
on :3014 and looked entirely successful. Pass both flags absolute, and use the
member's own bin shim rather than `npx`:

```bash
cd apps/<member>/probe && P=$(pwd)
../node_modules/.bin/rsbuild build -r "$P" -c "$P/rsbuild.config.ts"
```

**The stub must be reactive, or you will verify an empty surface.** A plain-object
stub never re-runs the member's `$derived`, so the page renders with zero rows and
every data-driven button in its empty state — and reports a clean pass. Name it
`stub-workspace.svelte.ts` and back its fields with `$state`. One engineer's first
run reported "all 0 / Promote 0 records" and looked entirely successful.

**Read the member's predicates and dialog calls before shaping the fixture.**
Aliasing the workspace is necessary and not sufficient. One member's auto-select
only fires on a parent with more than ten columns, so a three-column fixture
leaves the table empty forever. `window.confirm` blocks headless outright — stub
it via `addInitScript` or the whole post-confirm branch is unreachable.

**`theme.css` transitions `body *`, so computed style races.** A disabled-state
read taken mid-transition returns intermediate values and looks *exactly* like the
component failing to apply its rule. One engineer got as far as a CDP
`getMatchedStylesForNode` dump before realising the rule matched fine and the
clock was wrong. Settle ~1.2s before reading computed style.

**`getComputedStyle` returns a LIVE object.** Focus A, hold the reference, focus
B, read — and you get A's values *after* A lost focus. Snapshot inside the same
`evaluate`, per element, with `JSON.parse(JSON.stringify(...))` before moving
focus. This one reads as a clean pass, which is why it is on the list.

**`:focus-visible` does not match a programmatic `.focus()`.** A focus probe driven
by `el.focus()` reports `boxShadow: none` on every control — indistinguishable
from the federal ring being broken. Drive focus with real `Tab` keypresses.

**A template-literal `page.evaluate` string eats backslashes.** `/\s+/` becomes
`/s+/` at runtime, which silently truncates class names mid-word
(`ow-list-actions` → `ow-li`) and produces plausible-but-wrong attribution rather
than an error. Pass a real function, or double the backslash.

**Do not dedup call sites by shape alone.** Keying on class + variant + size + text
collapses genuinely distinct call sites — two different `×` closes in two
components are both `secondary|lg|×`. Include an ancestor-class path in the key,
or your stated coverage number is lower than what you actually verified.

### Measure the before, don't compute it

The loop asks for a numeric delta and until now gave no way to obtain the first
half of it. Arithmetic on deleted CSS is not a measurement.

```bash
git archive HEAD apps/<member>/src | tar -x -C probe/before --strip-components=3
```

Then add a **second rsbuild entry** pointed at `probe/before/App.svelte`. Same
browser, same viewport, same theme, same fixture — the delta becomes a diff of two
evaluates. This is what caught a `margin-right` on a bare `button` selector that
was silently widening every control in one member; no amount of reading the diff
would have surfaced it.

The same move is what turns a suspected double focus ring into a proven one.
`git show HEAD:<path>` the old CSS, rebuild, read `outline` **and** `boxShadow` at
focus. It also exposed three rules that *looked* like focus handling and had never
painted anything in their lives — `--focus-ring` holds a box-shadow value, so
`outline: var(--focus-ring, …)` is invalid at computed-value time and dropped, and
because the property *is* defined the fallback after the comma never applies
either.

### Capture both gate numbers at the top of the run

Member-scoped **and** federation, before touching anything. Under parallel
migration the federation number moves for reasons that are not yours, and an
engineer who only captured the member number ends up reasoning backwards to prove
a 72 wasn't theirs.

### The a11y delta is usually not aria

This loop's headline number — "five members carry zero `aria-*`" — has now
mis-aimed two disciplined members in a row. One went 9 → 9 and that was *correct*:
nothing it migrated was a toggle or a disclosure, and every icon-only control
already had a name. Its real delta was two live WCAG 2.2 SC 2.5.8 target-size
failures and a control boundary at 1.26:1 against a 3:1 floor.

**Lead with target size and boundary contrast. Check aria second.** The recurring
findings across nine migrations, in order of how often they turn out to be real:

1. Controls under the 24px target floor — found in six of nine members.
2. Boundaries drawn with `--color-border` (≈1.26:1) instead of
   `--color-border-strong` (≈3.44:1).
3. `opacity: 0.x` standing in for a disabled state — appearance without state.
4. Icon-only controls whose accessible name is the glyph itself.
5. Missing `type="button"`, defaulting to `submit`.

### When a member hosts other members

`docs-portal` mounts other members' galleries into its own document, and carries
bare `section` / `h2` / `code` selectors plus generic `.cell` / `.chip` / `.grid`
classes. A member can be entirely inside its own boundary and still style its
neighbours. If yours is a host, **raise it — do not prefix it**. A containment
pass is its own piece of work, not a line in a button diff.

### Verify what you cannot see

Most members hide most of their buttons behind `{#if}`. In the first migration
**six of nine** never rendered without NATS and seven Docker services running.

An agent told to "run the gates and stop" will report success having *seen* three
of nine. **State your visual coverage explicitly** — how many buttons you actually
looked at, and how.

Where a button will not render, the probe technique that works: a throwaway
rsbuild app aliased at the member's real sources, importing the member's own
`app.css`, rendering the components directly with fixture props. Delete it
afterwards.

## Judgement calls that are yours

- **Are the member's chips Buttons?** The first migration answered **yes**, and
  the reasoning generalises: a chip is a button with a variant, a size, a focus
  ring and a disabled state. What makes a chip *row* a separate organ is the
  **group** behaviour — single-selection, roving tabindex, arrow keys — which
  lives in the row. So `FilterChipRow` composes Buttons rather than replacing
  them.

  **Use `aria-pressed`, not `role="tab"`.** Correct tab semantics needs
  `aria-controls`, `role="tabpanel"` and arrow-key handling; half-implemented
  tabs are worse for a screen reader than honest toggle buttons. Full
  radiogroup/tab semantics is a `FilterChipRow` job, not yours.
- **Does anything need an override?** Use rung 2 or 3 if so, and **say so in your
  report.** A recurring override is evidence for a missing variant, which is a
  finding rather than a failure.
- **Can a rung-4 override even reach it?** Mechanical test, check it before you
  start: a member's global class lands at `(0,1,0)`; anything `Button` declares
  inside its own scoped `<style>` lands at `(0,2,0)` after Svelte hashing. **If
  the property you need to change is one `Button` sets, rung 4 via `class=` cannot win (use `style=`)** —
  and the next move is `!important`, which is how a component becomes
  decorative. A control that needs to fight the component is a **missing organ**,
  not a deviation. Say so and move on.
- **Count the properties you would have to override.** Past roughly four, you are
  re-drawing the control. `chat`'s `.command-row` needed eight — `display`,
  `height`, `width`, `text-align`, `white-space`, `padding`, `border-radius`,
  `border` — at which point `Button` contributes only `type="button"`, which the
  element already had.
- **Check the neighbours before committing to `ghost` or `link`.** A role-correct
  variant can still destroy the member's only interactivity cue: one migration
  mapped a dismissal to `ghost` and rendered it indistinguishable from a
  non-interactive muted span doing the same job one section below. Correct by
  role, a regression in fact.

- **Is it actually a row?** This is now the most common holdout in the rollout and
  the single most-cited missing organ. Four members have produced the same shape:
  a full-bleed, left-aligned, **wrapping**, variable-height list row or card that
  someone made into a `<button>` — measured at 39px, 56px, 89px and 93px against a
  32px control height. `Button` is `inline-flex`, `justify-content: center`,
  `white-space: nowrap`, fixed height. Adopting one takes rung-4 overrides for
  height, `justify-content`, `text-align`, `white-space` and `flex`
  *simultaneously* — every geometric property the component contributes, leaving
  behind only a focus ring the federal `*:focus-visible` rule already provides.
  **Leave it raw, put the rationale in the CSS, and raise the organ.** The general
  form of the rule: *if the override would negate the base recipe rather than
  adjust it, it is a different organ.*

- **Is a button actually a link?** `variant="link"` exists; an `<a>` styled as a
  button is a different fix and may be out of scope.

**Rung 0 is not free, and it has its own regression mode.** Three self-inflicted
bugs in one run came from layout fixes, and no gate caught any of them — only the
before/after probe did.

- Making a popover `display: flex; flex-direction: column` to stop Buttons sitting
  inline **crushed every item from 26.8px to 17px**, under the very 24px floor the
  migration exists to fix, because a height-capped column-flex container shrinks
  its items. **Add `flex: 0 0 auto` to the items.**
- `.menu > li { display: flex }` sized rows to content — 179px inside a 210px
  menu. `display: grid` was needed.
- A three-column label grid overflowed a control once the control gained a fixed
  height.

**A rung-0 wrapper may carry CSS.** The examples elsewhere say "a plain div,
usually zero CSS", which reads as a rule. It is not: a wrapper that has to carry
`margin-inline-start: auto` and `align-self: center`, or a new member class like
`.link-remove-slot`, is still rung 0 and still not a deviation. Do not route it to
rung 4 because it needed a declaration.

**A selector that out-specifies the component's base recipe must be REMOVED, not
raised** — whether or not it still matches anything. The delete-what-you-made-dead
rule is binary and misses this case. `.resp-app button` at `(0,1,1)` beats
`.ui-btn` at `(0,1,0)`, so its `border: 0` erases the component's border box
entirely and its `border-radius` makes rungs 2 and 3 dead on arrival in that
member. The rule still *matches* every Button — it is not dead — and leaving it
makes the component decorative.

## Raise, don't chase

You will find things that are wrong and not your job — dead CSS, an `aria-*` that
lies, a swallowed error, a token used against its documented role. **Report them.
Do not fix them.**

Rogue debugging costs three things at once: the commit stops being attributable,
the gate stops meaning what it said, and the finding stops being reviewable
because it arrives already fixed.

**The line:** *if removing it is part of the migration, remove it. If fixing it is
a separate act of repair, raise it and move on.*

For each finding give: **what** (one sentence) · **where** (`path:line`) · **how
found** · **blast radius** (this member, or federation-wide?) · **confidence**
(measured, or suspected?).

## Hard rules

1. **Touch only your member**, plus its `package.json`. Not `packages/`, not
   `shell/`, not another member, not `apps/docs-portal/src/members.ts`.
2. **Do not commit.** Author, run the gates, report. The manager commits — one
   member per commit, so the history stays bisectable across eighteen migrations.
3. **Never a raw value in an override.** A literal is how the 170 phantom
   declarations happened.
4. **Pick tokens by role, not appearance.** A button is `--radius-md` because
   DESIGN.md §Shapes says buttons are, regardless of what looks right to you. This
   is not hypothetical — `chat` has eleven declarations one scale step off because
   someone picked by eye.

## Related

- [[../specs/Component-API-Contract-And-The-Control-Scale]] — the contract
- [[Converge-The-Federated-Design-System]] — the governance loop this serves
- [[../plans/Prove-The-Component-API-On-Request-Reviewer]] — the proof case this generalises
- `packages/shared-ui/src/Button.svelte` — the component, read its header
