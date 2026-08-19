---
title: "Federated Design System Architecture"
lede: "The organising specification for augment-it's two-tier, seventeen-member design system."
date_created: 2026-08-01
date_modified: 2026-08-01
semantic_version: 0.0.2.1
status: Reference
tags:
  - Design-System
  - Federation
  - Architecture
  - Tokens
site_uuid: e93f2d43-800c-4161-830e-f31ee5b21c1e
hex_code: aosfgz
date_authored_initial_draft: 2026-08-01
date_authored_current_draft: 2026-08-01
publish: true
---

# Federated Design System Architecture

## 1. The architecture in one paragraph

**One federal token layer, seventeen sovereign member design systems, one shared
`<html>`.** The federal layer owns the token vocabulary — colours, typefaces,
layering, effects, motion — and enforces it through a script rather than a review.
Each member owns its own components, composition patterns, and interaction idioms.
The shared document makes everything global a public API; the two-tier token
architecture makes the cheap change cheap and the expensive change visible.

## 2. Why federation

Sixteen independently-deployed remote micro-frontends mounting into one shell
understood, through measurement, to have:
- 158 button rule-sets
- 13 card recipes
- 34 badge treatments
- 6 spinners
- 35 font sizes
- 25 z-index values with no scheme
- 33 dead fallback colours
- 99 unnamespaced selectors leaking across remote boundaries

A central component library makes every member wait on one queue. They did not
wait. Federation accepts that reality and makes it safe.

## 3. The two-tier token spine

```
Tier 1 — named tokens     --color__magenta-electric  Raw values. Federal.
Tier 2 — semantic tokens  --color-accent             What components read. Federal.
Tier 3 — effect tokens    --fx-card-shadow           Composite values. Federal.
─────────────────────────────────────────────────────────────────────────
Tier 4 — member-local     --resp-col-request         One member's own. Local.
```

Components reference only Tier 2 and Tier 3. To re-skin: re-point a Tier-2 token.
Components never change. Three modes cost one attribute, not seventeen stylesheets.

## 4. The enforcement contract (F1–F11)

| # | Rule |
|---|---|
| F1 | No member declares Tier 1/2/3 tokens |
| F1a | No member consumes Tier 1 directly (`var(--color__*)` or `var(--font__*)`) |
| F2 | Unique prefix and root class per member |
| F3 | Every selector descends from member root class |
| F4 | z-index from `--z-*` tokens only |
| F5 | mount.ts never imports mode-switcher |
| F6 | Every member publishes DESIGN.md |
| F7 | Accessibility floor — contrast, target size, focus |
| F8 | No hardcoded hex/box-shadow/@keyframes outside packages/theme |
| F9 | Deviations declared in member's DESIGN.md |
| F10 | Token layer injected once by the shell |
| F11 | No literal colour in Tier 2 or Tier 3 |

## 5. The enforcement mechanism

`scripts/design-drift.mjs` reads the member registry from DESIGN.md frontmatter,
sweeps every member, and reports every contract violation. The adoption ramp
(warn/fail) controls the exit code. `pnpm design:contrast` measures every
text-on-surface pair against WCAG 4.5:1.

`node scripts/design-drift.mjs --resolve` dumps every Tier-2/3 token resolved
to its final hex value per mode. Diffing two runs proves a token rename changed
no rendered output.

## 6. The three-mode contract

Three modes, always. Switched by `data-mode` on `<html>`, persisted at
`localStorage['augment-it:mode']`, default `dark`. The FOUC guard in the shell's
rsbuild config sets the attribute before any paint.

| Mode | Ramp | Accent |
|---|---|---|
| dark | graphite / mist | `#c75bfb` |
| light | paper / ink | `#9a3fd4` |
| vibrant | void / halo | `#d96bff` |

## 7. The context budget

An agent working in a member reads two files: the member's `.design-context.json`
fragment (~1–3 KB) and the file it is changing. The full DESIGN.md (~180 KB) is
for humans. This is the small-context-window contract.

## 8. Acceptance test

Add a button to `pack-runner`. The agent must produce the correct prefix (`pr`),
root class (`.pr-app`), z-token (`--z-raised`), and token names (`--color-accent`)
from the fragment alone — without reading DESIGN.md.
