---
title: "Adopt CardRow and a SelectWrapper in one member"
lede: "The pilot executor. Three members answer the open decisions with evidence; everything mechanical is inherited from the Button loop."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Untested
tags:
  - Loop
  - Augment-It
  - Design-System
  - CardRow
  - Layout
site_uuid: 1da3bb82-af4c-4be2-9679-21f4e410797e
hex_code: 7w3eyb
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Adopt CardRow and a SelectWrapper in one member

## This is a PILOT, not a rollout

Three members, chosen to disagree with each other. **Your job is as much to
produce evidence as to produce a diff.** Several decisions in
[[../decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection]] are
deliberately open, and the pilots are how they get answered.

**If the API does not fit your member, that is a RESULT, not a failure.** Say so
loudly and precisely. Do not contort the member to fit, and do not reach for
rung 4 to paper over a bad API — an escape hatch used on the first try means the
API is wrong.

## Inherited, not repeated

Everything mechanical comes from
[[Adopt-The-Shared-Button-In-One-Member]] — the probe recipe, `resolve.alias`
(**never** `source.alias`) with the mandatory sentinel grep, measure-the-before,
gate capture, raise-don't-chase, and the ladder. Read it in full.

**Rung 4 is `style=`, not `class=`** — corrected today. A member class is
(0,1,0) and loses to the component's (0,2,0), while rendering perfectly and
looking like it worked.

## What you are adopting

- `CardRow` — one object in the list. A `<div>`, no onclick, not a control.
- `SelectWrapper--ClickBody` — clicking anywhere selects. Needs a positioned
  ancestor (CardRow is one) and **console-errors if a sibling control would be
  buried under its overlay**.
- `SelectWrapper--ClickPrimary` — only the primary label selects. No overlay.

## The open decisions you are evidence for

| | question | what your member should report |
|---|---|---|
| **D1** | one component or many? | did the thin base fit, or did you need a `CardRow--<Kind>` wrapper? If you wrote one, paste it — three identical wrappers means promote |
| **D2** | naming | did any name need explaining to you? Name the one that did |
| **D3** | which SelectWrapper | which variant, and **why the other one was wrong here** |
| **D6** | is the pilot set right? | what your member has that the other two do not |

## Rules

1. Touch ONLY your member's `src/**`. **Never `packages/`** — if the primitive
   is wrong, say so; do not fix it. Three members editing `shared-ui` in parallel
   is how a component gets three incompatible APIs in one evening.
2. **Do NOT commit.** Report; the lead commits.
3. Raise, don't chase.
4. Delete your probe before the final gate.
5. **Additive where you can.** There is a demo on Tuesday. A member that ends the
   night half-migrated is worse than one not started — if you run short, finish
   fewer surfaces completely and say which you left.

## Gates

```
node scripts/design-drift.mjs --member <prefix>    # read the prefix from DESIGN.md
node scripts/design-drift.mjs                      # 71 now; moves for reasons not yours
pnpm --filter <pkg> check                          # 0 errors
pnpm --filter <pkg> build
```

## Deliver

Gate output verbatim · before/after counts · which SelectWrapper and why · **visual
coverage stated explicitly** (how many rows rendered and measured, and how) · an
a11y delta led by target size and the overlay's sibling-reachability, then
contrast, then aria · findings raised not chased · and **answers to the four
questions above**, which are the point.

## Related

- [[../decisions/The-List-Surface-Paradigm-CardRow-ListContainer-And-Selection]]
- [[Adopt-The-Shared-Button-In-One-Member]] · [[Adopt-The-Shared-Chip-In-One-Member]]
- [[../specs/Component-API-Contract-And-The-Control-Scale]]
