---
title: "The Button Rollout, and the Loop That Turned Out to Be the Product"
lede: "Nineteen units, 302 raw buttons, 824 net lines of CSS deleted. The buttons were the easy part — the loop got four revisions from its own engineers' reports and is now the thing worth keeping."
publish: true
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
date_work_started: 2026-09-13
date_work_completed: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
summary: >-
  First full execution of the per-member adoption loop, across all eighteen
  federated micro-frontends and the shell that hosts them. 302 raw button
  elements become 297 shared Button call sites and 39 declared holdouts; CSS drops
  824 net lines. Not one unit needed an override rung above variant-and-size,
  which is the strongest evidence the API is right. The defects the loop surfaced
  were not the ones anyone predicted: controls at 12.5 x 11.8px, a member's bare
  selector that would have made the component decorative, two sign-in forms about
  to stop submitting silently, and a Tier 1 palette collision making dark-mode
  borders measure 1.00:1. The loop revised itself four times mid-flight from
  engineer reports, including after a probe with a silently-ignored config key
  wrote a file into live client data. The buttons are done; the loop is the
  artifact.
site_uuid: d5167411-4b60-487c-9948-b78bd7a335be
hex_code: 3jsx00
files_changed:
  - packages/shared-ui/src/Button.svelte
  - context-v/loops/Adopt-The-Shared-Button-In-One-Member.md
  - context-v/specs/Component-API-Contract-And-The-Control-Scale.md
  - context-v/issues/The-Federation-Has-No-Layout-Layer.md
  - context-v/issues/A-Silently-Ignored-Alias-Pointed-A-Probe-At-Production.md
  - context-v/refactors/Two-Palette-Steps-Share-One-Hex-So-Dark-Mode-Borders-Vanish.md
  - apps/
  - shell/
tags:
  - Changelog
  - Augment-It
  - Design-System
  - Component-Library
  - Accessibility
  - Loop
  - Agent-Safety
---

# The Button Rollout, and the Loop That Turned Out to Be the Product

## Why Care?

The loop ran, end to end, on every unit in the federation. **It worked.** That is
the headline, and it is a bigger result than the buttons.

| | |
|---|---|
| Units migrated | **19** (18 members + `shell`) |
| Raw `<button>` before → after | **302 → 39** |
| `<Button>` call sites | **297** |
| CSS lines, net | **−824** (227 added, 1051 deleted) |
| Files changed | 106 |
| Commits in the arc | 47 |
| Units needing an override rung above `variant`+`size` | **0** |

That last row is the one to read twice. Nineteen independent surfaces — a chat, a
document portal, a curation queue, an org workbench with sixty-one controls, the
federation host itself — and **two enumerations covered every one of them.** No
member needed a token override, a radius modifier, or an escape-hatch class to get
its buttons right.

An API that needs no escapes across nineteen consumers is not a lucky guess. It is
the evidence that [[../context-v/specs/Component-API-Contract-And-The-Control-Scale|the
contract]] was drawn at the right grain.

## What's New?

- **`Button` is adopted federation-wide**, including the shell.
- **39 controls are declared holdouts, not misses.** Each carries its rationale in
  the CSS beside it, and each names the organ it is waiting for.
- **The loop is revised**, four times, from the reports of the engineers running
  it — see below. That is the durable output.
- **Three new context-v documents** from findings that outgrew their migrations.

## The defects were not the ones anyone predicted

The rollout was pitched as cleanup. What it found was live, measured breakage that
had been shipping for months.

**Controls below the WCAG 2.2 target floor, everywhere.** The smallest in the
federation measured **12.5 × 11.8px** — failing on *both* axes simultaneously —
and rendered three times per screen. `org-workbench` alone had 23 distinct
shapes under the 24px floor. `person-enrichment` had four remove buttons at
28.8 × 16px whose accessible name was literally `×`, so a screen reader
announced *"multiplication sign, button."*

**A member's own CSS was about to make the component decorative.**
`response-reviewer`'s `.resp-app button` sits at specificity `(0,1,1)`;
`.ui-btn` sits at `(0,1,0)`. With it in place, `border: 0` erases the
component's border box outright and `border-radius` makes two rungs of the
override ladder dead on arrival. The member would have installed `Button` and
gone on drawing its own buttons underneath it.

**Two sign-in forms were one attribute from silently breaking.** `<Button>`
defaults to `type="button"`; the shell's magic-link forms need `submit`. No
gate in the system catches that, on the surface that gates access to the entire
product. It was caught because the engineer rendered `?signedout` *specifically*
on the reasoning that a submit button is the one control a button migration can
break invisibly.

**A layout bug hiding inside a paint rule.** `record-collector`'s
`.rc-app button` carried `margin-right: 0.5rem`, and a bare element selector
reaches into every component mounted beneath it. Found by diffing before/after
screenshots: a header label wrapped across four lines before and two after. Two
icon buttons × half a rem is exactly the 16px the label got back.

**And a Tier 1 palette collision.** `--color__graphite-700` and
`--color__graphite-800` are the *identical hex*. In dark mode that makes
`--color-border` on `--color-surface` measure **1.00:1** — not a faint
hairline, absent. The rule all day had been *two hex declarations are two values
and will drift*; here two names converged on one value, which is worse in a
specific way: the distinction survives in the source, in the docs and in every
review, and evaporates only at paint time.

## What the loop is actually for

A human sweep would have replaced the buttons. It would not have found any of the
above, because **every one of those findings required rendering the member and
measuring it**, and most required rendering it *twice* — once from
`git archive HEAD`, once from the working tree, in the same browser at the same
viewport with the same fixture.

The loop's most valuable instruction turned out to be *"measure the before, don't
compute it."* Arithmetic on deleted CSS is not a measurement, and three findings
this week were invisible to anyone reading a diff.

The second most valuable was **raise, don't chase.** Nineteen engineers found
things worth fixing and fixed none of them, which is why nineteen diffs stayed
reviewable and why the findings accumulated into documents instead of evaporating
into commits.

## The loop revised itself, four times

This is the part that makes the next run cheaper, and it only happened because
each engineer was asked for *playbook gaps* alongside its report.

**Rung 0 — layout is the parent's job.** Seven of the federation's eight
`data-deviation` declarations were about placement, every one saying some version
of *"the ladder has no rung for layout."* The finding was not that members are
sloppy; it was that **the escape hatch was the only door in the building.** A
Deviations catalog listing five margin adjustments teaches its reader to skim,
which is exactly where the one real deviation hides.

**The probe recipe was backwards.** The loop said *"put the probe outside
`apps/`"* — self-defeating, since a probe outside `apps/` cannot resolve
`@augment-it/*` at all, as the loop said two paragraphs earlier. Verified against
the script rather than adjudicated: `findMemberFiles()` walks *only*
`apps/<member>/src`, and the S5 sweep enumerates *only* direct children of
`apps/`. So `apps/<member>/probe/` is invisible to both while inheriting the
member's own `node_modules`.

**Two judgement tests, invented mid-migration and promoted.** The *specificity
test*: a member's global class is `(0,1,0)` and anything `Button` declares in
its scoped style is `(0,2,0)` after hashing, so if the property you need is one
`Button` sets, rung 4 cannot win — and the next move is `!important`, which is
how a component becomes decorative. The *property-count test*: past roughly four
properties you are re-drawing the control. Both are mechanical and both apply
before you start.

**And a new ladder rule with teeth:** a selector that out-specifies the
component's base recipe must be **removed**, not raised, whether or not it still
matches anything. The old guidance was binary — delete what your migration made
dead, raise the rest — and `.resp-app button` fits neither.

## The incident, and what it changed

A verification probe wrote a real file into a live client's corpus.

**The engineer did not ignore the safety rule.** It had aliased
`@augment-it/workspace` to a fixture stub precisely so that no write could reach
anything real. **`rsbuild` 2.x accepts `source.alias`, ignores it, and reports
a successful build.** The correct key is `resolve.alias`. So the probe bundled
the real workspace client, found a live service on the machine, and a click-path
written to exercise buttons fired `corpus.add` against a real record.

Blast radius was one file and one NATS event — `corpus.ts` makes no database
calls, verified rather than assumed. The file is removed and the submodule is
clean.

**Three engineers hit this**, and the reason it got past them is worth stating
plainly: every other probe trap produces an empty page or an error. *This one
produces production.* One probe reported 866 buttons from a four-row fixture.
Another rendered 1,982 real responses and caught it only because the numbers were
too round. The third's click-path, variant mapping and measurements were all
correct — and all taken against production. No gate could see it; drift,
`svelte-check` and the contrast gate pass identically either way.

The rule that came out of it generalises past this probe:

> **A sandbox that is not asserted is not a sandbox.**

"Alias the workspace to a fixture" states an intent and verifies nothing, and a
config key that is accepted and ignored is indistinguishable from one that worked
— right up until it writes to a client. The fix is a sentinel string in the stub,
grepped out of the built bundle *before any number is trusted*. It is the only
check that fails loudly and the only one that does not depend on getting a config
key right.

## One question that had never been answered

**Does the federation host leak CSS into the remotes it mounts?** Highest blast
radius in the system, and nobody had measured it.

Measured now: the shell's production bundle carries **141 selectors, every one of
them hashed**. The only six unhashed selectors in the entire bundle originate in
`packages/theme` and are federal by design. Every style block in `shell/src` is
scoped; there is no `<style global>`; there is no `app.css`. Its two
`:global()` escapes both target a class no member renders.

The host is clean. `docs-portal`, which also hosts, is not — it carries bare
`section` / `h2` / `code` selectors and mounts other members' galleries into
its own document. That is filed, not fixed.

## What is not done

- **The theme fixes are queued, deliberately.** The palette collision, the
  `destructive` variant's missing boundary (1.02–1.32:1 against a 3:1 floor), and
  `ghost`'s invisible hover on a tinted host. All filed as **#106**. Editing
  `theme.css` while four agents were mid-flight would have moved the federation
  number under them and silently invalidated every contrast measurement they had
  taken — a hazard invisible in any member's diff. No agents are in flight now.
- **Seven layout `data-deviation` declarations remain** in three members migrated
  *before* rung 0 landed. They are stale annotations, not defects.
- **The federation has no layout layer at all**, filed as **#105** and
  deliberately deferred. `padding: var(--space-*)` appears **zero** times against
  912 raw paddings; `shared-ui` holds three components and **not one of them is a
  box**. This is a *nothing-yet*, not a mess — nineteen members solved a problem
  the platform never posed, so there is no candidate to promote and the
  convergence verdicts do not apply.
- **The recurring holdout is a list-row organ**, sighted in five members. It is
  over the three-member promotion threshold already.
- **`F7` has no mechanical check.** Every control-boundary finding this week was
  caught by an engineer with a browser, not a gate. The contrast gate walks 30
  *text* pairs and passes 30 of 30 through all of them.

## Related

- [[../context-v/loops/Adopt-The-Shared-Button-In-One-Member]] — the loop, four revisions richer
- [[../context-v/specs/Component-API-Contract-And-The-Control-Scale]] — the contract that needed no escapes
- [[../context-v/issues/A-Silently-Ignored-Alias-Pointed-A-Probe-At-Production]] — the incident
- [[../context-v/refactors/Two-Palette-Steps-Share-One-Hex-So-Dark-Mode-Borders-Vanish]] — the theme queue
- [[../context-v/issues/The-Federation-Has-No-Layout-Layer]] — the deferred arc
- [[2026-09-13_04_Integration-With-Claude-Design-To-Converge-On-A-True-Component-Library]] — where this started
