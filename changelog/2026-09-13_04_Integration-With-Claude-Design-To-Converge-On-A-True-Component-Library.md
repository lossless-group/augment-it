---
title: "Integration with Claude Design to Refactor Frontend and Converge on a True Component Library"
lede: "Nobody had ever seen the eleven status pills next to each other. Put on one canvas, the promotion argument makes itself in about four seconds."
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
  Stands up the federated design-system convergence loop and its first sweep, then
  renders the result as a Claude Design canvas — four artboards of real UI
  specimens drawn from each member's own CSS, side by side. Four read-only
  scanners inventoried 24 organs across 19 micro-frontends and the platform layer.
  The clearest promotion candidate is one nobody nominated: 17 of 19 packages
  observe the same connection_status and render it eleven ways. The sweep also
  found the reason the duplication exists — the federal layer never shipped
  --space-*, --radius-* or --z-*, so 170 declarations across ten members reach for
  tokens that do not exist. Buttons and badges are therefore deliberately NOT
  promoted yet.
site_uuid: a3bd6861-76d1-49ff-a22f-d351288a228e
hex_code: e7fz47
files_changed:
  - context-v/loops/Converge-The-Federated-Design-System.md
  - context-v/specs/Design-System-Convergence.md
  - context-v/refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z.md
  - context-v/refactors/The-Sort-Filter-Lens-Containment-Breach.md
  - scripts/organ-drift.mjs
  - design-organ-ledger.json
  - package.json
  - .gitignore
  - changelog/2026-09-13_04_Integration-With-Claude-Design-To-Converge-On-A-True-Component-Library.md
---

# Integration with Claude Design to Converge on a True Component Library

::image{src="https://ik.imagekit.io/xvpgfijuw/augment-it/claude-design-component-library-convergence/Claude-Design__Divergence-Collector--Full-Canvas_20260913T180450Z.jpg" alt="Claude Design canvas titled Augment-It Divergence Collector showing four dark artboards side by side — 01 Connection status, 02 Buttons, 03 Badges and 04 Root cause — each a wall of real UI specimens rendered from member CSS, with two yellow sticky notes at upper left explaining how to read the tags" caption="Four artboards on one canvas. Every specimen is the member's own CSS copied verbatim from its app.css — not a redrawing."}

## Why Care?

We used to run design through Figma. Agentic engineering ended that — everyone
goes straight to code now, and the tool went with it. **What we lost was not the
drawing. It was the shared visual reference that made disagreement visible before
it was committed.**

Going straight to code did not remove the disagreement. It moved it downstream,
where it shows up as sixteen ways to draw a button.

`augment-it` is heading toward one repo per app, owned by teams of one to three.
The architecture is already shaped for it. **The moment a member leaves the
monorepo, cross-member duplication stops being greppable** — everything not
converged before the split is converged never.

So the question was never "can we enforce conformance." It was: *can a platform
team see divergence early enough to have an opinion about it, without becoming a
gate that kills the speed small teams are for?*

A canvas turns out to be the answer, and for a duller reason than expected.
**Drift is a visual phenomenon.** The registry we built is a table of file paths,
and a table has never once made anyone say *"wait, those are the same thing."*

## What's New?

- **The convergence loop** — two channels, five verdicts, and a fingerprint ledger
- **The organ registry** — 24 organs, 17 with cross-member evidence, each with a verdict
- **`pnpm organ:drift`** — generates the duplication table instead of asserting it
- **The Divergence Collector** — four artboards rendering the actual product CSS
- **Two refactor docs** for the federal defects the sweep surfaced

## The governance model, in one rule

Creativity stays the default. The federation contract already says so in as many
words — *"What a local system may do without asking: Everything else."* A platform
team that reviews every component kills the thing that makes small teams fast.

So the loop is not an approval gate. It is an instrument, plus a vocabulary for
deciding, that includes *"nothing, this is fine, write down why."*

> **The difference between purposeful variation and drift is not a property of the
> code. It is whether a human wrote it down.** Two members deliberately diverging
> is healthy and gets recorded as `sanctioned`. The same two diverging by accident
> is drift. **The code is identical in both cases.** Only the registry
> distinguishes them.

That makes the registry the governance mechanism rather than a report. Five
verdicts give every finding somewhere to land — **PROMOTE · CONVERGE · SANCTION ·
DEMOTE · WATCH** — and `SANCTION` matters most, because it is how the instrument
says *"these differ on purpose"* without pretending the difference is a defect.

## What four scanners found

Four read-only agents swept 19 members and the platform layer. The unit of
analysis is the **organ** — a recurring UI concept, not a file. One organ may be a
component in one member, inline markup in a second, and a CSS class recipe in a
third; a sweep that compares filenames finds the easy half and reports clean.

**The strongest promotion candidate is one nobody nominated.** 17 of 19 packages
depend on `@augment-it/workspace` and observe the *same* `connection_status`
value — then render it **eleven different ways**. Five are byte-identical apart
from the class prefix. Two members that need the signal render nothing at all, so
a dead surface is indistinguishable from an empty one. And **zero of the eleven
are accessible**: no `role="status"`, no `aria-live`, no accessible name anywhere
in the set.

That is the whole promotion argument, and on the canvas it takes about four
seconds instead of a meeting.

## The finding that changed the plan

::image{src="https://ik.imagekit.io/xvpgfijuw/augment-it/claude-design-component-library-convergence/Claude-Design__Divergence-Collector--Buttons-Artboard_20260913T180450Z.jpg" alt="The Buttons artboard expanded, headed One button 158 rule-sets, listing four secondary button dialects and five primary ones from different micro-frontends beside the member and CSS class that produced each, with annotations flagging a raw hex white and two phantom radius tokens, above a table showing six border-radius values and five paddings in use against no federal token" caption="Nine live buttons, each labelled with the member and class that produced it, over the geometry tabulated — six radii and five paddings in use, against zero federal tokens for either."}

A federation-wide measurement counted **158 button rule-sets and 34 badge
treatments, none of them components**. `response-reviewer` alone holds sixteen
distinct ways to draw a button.

The obvious move is to promote a `Button`. **We deliberately did not**, and the
Buttons artboard is why. Look at the bottom table: the colours are token-pure
almost everywhere — it is the **geometry** that drifted. Six border-radius values
and five paddings in active use, against a federal token count of zero for both.

All four scanners then reached the same root cause independently, without being
asked about tokens:

```
--space-*    0 declarations in packages/theme/theme.css
--radius-*   0 declarations
--z-*        0 declarations
```

Members needed them. The vocabulary did not have them. So they **invented the
names they expected to exist** and let the CSS fallback carry the value —
**170 declarations across 10 of 19 members now reference tokens that do not
exist**, each shipping its literal identically in all three modes.

**This is not a discipline failure.** Three members' own file headers assert that
these families come from `@augment-it/theme`; they were written by people who
believed the scale existed. A related consequence: **`F4` is currently
unsatisfiable** — it forbids raw `z-index` and mandates `--z-*` tokens, of which
there are zero, enforced in two separate places. A rule nobody can obey teaches
people to ignore the checker.

> **Promoting a Button today would bake the drift in.** A promoted component must
> pick one radius and one padding. Picking them from that table — rather than from
> a named scale — makes one member's accident into federal law. The token families
> come first.

## When Claude Design earns its place

Worth stating, because the timing is the whole recommendation:

- **Diagnostic use is ready now.** The variant wall depicts reality, broken parts
  included. It needs no decisions and no fixed token layer.
- **Generative use is blocked** until the scales ship. Designing against a
  vocabulary with holes expresses every decision as a *number*, because there is
  no name to reach for — manufacturing the exact drift we just measured, with
  visual authority behind it.

**Claude Design's value is proportional to the completeness of the token layer.**
A design tool without a design system produces pictures, and pictures do not
converge anything.

The mechanic matters too: the artboards are HTML and CSS, so they are drawn with
the product's *actual* `theme.css` and the *actual* component markup. It is not a
redrawing of the component — it can be the component. That is the property Figma
never had, and it is what makes a decision made on the canvas mean something in
code. The round trip is still manual: Claude Code drafts, a human refines
visually, Claude Code transcribes back into Svelte. There is no automatic sync.

## The push channel already existed

The strongest evidence for the governance model was not in the CSS. It was in the
comments. Teams were **already flagging their own duplication**, in the commit, at
the time — one cites the tracking issue by number:

> *"ResultRow/ResultsList copy-adapted from search-and-add (spec D7: per-remote
> copies, no shared runtime; **knowingly more fuel for the component library,
> gh #22**)."*

Three separate members name the file they copied and the debt they took on.
Nobody was careless. **There was simply no registry for that declaration to land
in**, so it stayed in a comment nobody aggregates.

The push channel does not need building. It needs somewhere to write to.

## One thing measured that we had backwards

`DESIGN.md` recorded four "byte-identical" promotion candidates on 2026-07-30. The
first read of the re-measurement was *"two of them drifted while sitting in a
queue meant to catch drift."*

**That was wrong, and the truth is worse.** `git show` at birth, at 2026-07-30 and
at HEAD says `ColumnMapper` and `RecordCard` were **never byte-identical at any
commit in the repository's history**, and neither has changed since. Both were
copy-pasted at birth — the copy happened in a clipboard, not in version control.

Nothing drifted. **The list was wrong the day it was written**, because
byte-identity was asserted rather than measured, and every reader inherited the
error for six weeks. That is a better argument for the tooling than the original
one: the fix is not *re-measure more often*, it is **never hand-write the
measurement**. `pnpm organ:drift` generates that table, which is why it can be
trusted and the prose above it cannot.

## What is not done

Being clear-eyed: **nothing in the design system was fixed.** The 170 phantom
declarations are still there. `sort-filter-lens` still leaks 61 unnamespaced
classes that collide with `.error`, `.row` and `.muted` across 16, 19 and 14 other
surfaces. No component was promoted. No organ converged.

This shipped **a plan and an instrument**, not a fix. The queue:

1. **Ship the missing token families** — unblocks Button and Badge promotion
2. **Add the global `:focus-visible`** — one declaration, whole-federation effect
3. **Promote the connection-status pill** — the evidence is already overwhelming
4. **Contain `sort-filter-lens`** — mechanical, verifiable, one afternoon

> **Where the canvas lives.** The artboard sources are working files under
> `design-canvas/` and are **gitignored** — the published Artifact is the
> deliverable, and re-seeding regenerates the page from those sources. They are
> build inputs, not repo content, on the same reasoning that keeps
> `.image-staging/` out of git.

## Related

- [Converge-The-Federated-Design-System.md](../context-v/loops/Converge-The-Federated-Design-System.md) — the loop
- [Design-System-Convergence.md](../context-v/specs/Design-System-Convergence.md) — the organ registry
- [The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z.md](../context-v/refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z.md) — the root cause
- [The-Sort-Filter-Lens-Containment-Breach.md](../context-v/refactors/The-Sort-Filter-Lens-Containment-Breach.md) — the live F3 breach
- [No-Component-Library-UI-Improvised-Not-Component-Based.md](../context-v/issues/No-Component-Library-UI-Improvised-Not-Component-Based.md) — the 2026-07-24 admission that seeded this
