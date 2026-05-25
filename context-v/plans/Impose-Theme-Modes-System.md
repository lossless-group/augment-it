---
title: "Impose the Three-Mode Theme System on augment-it"
lede: "augment-it adopts the Lossless theme religion — the two-tier token system and the light/dark/vibrant three-mode contract from the Astro Knots blueprint — adapted for a non-Astro, non-Tailwind, federated multi-remote app. A shared packages/theme holds one theme.css (named tokens → semantic tokens, three mode blocks) and one SSR-safe mode-switcher; the shell renders a 3-mode toggle in its chrome; every hardcoded hex across the shell and the two remotes is replaced with a semantic var(). The structure is imposed in this work; the user then iterates the actual colours at the named-token tier without touching component code — which is the entire point of the two-tier system."
date_created: 2026-05-21
date_modified: 2026-05-25
date_completed: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-05-25 — Status swept to Shipped; three-mode theme system landed per changelog 2026-05-21_06.
tags:
  - Plan
  - Augment-It
  - Theme-System
  - Three-Mode-Contract
  - Two-Tier-Tokens
  - Light-Dark-Vibrant
  - CSS-Custom-Properties
  - Module-Federation
  - Mode-Switcher
status: Shipped
---

# Impose the Three-Mode Theme System on augment-it

## What this is

augment-it adopts the Lossless Group's theme-and-mode religion: the **two-tier
token system** and the **light / dark / vibrant three-mode contract**, per
[[Maintain-Themes-Mode-Across-CSS-Tailwind]] (the Astro Knots blueprint) and the
`theme-system` skill.

Right now augment-it's colours are **hardcoded hex scattered across five CSS
surfaces**. There is no theme, no mode, no switch. This plan imposes the system.

## augment-it is not an Astro Knots site — the adaptation

The blueprint is written for Astro + Tailwind v4 + a single app. augment-it is
**Svelte 5 + Rsbuild + Module Federation**, no Tailwind, three separately-built
frontends. The religion adapts cleanly; three things change.

| Blueprint assumes | augment-it reality | Adaptation |
|---|---|---|
| Tailwind v4 `@theme` generates utilities from kebab-case tokens | No Tailwind anywhere | **Drop the Tailwind layer entirely.** The two-tier tokens are just CSS custom properties — they work without Tailwind. Components already hand-write CSS; they switch from hex to `var(--color-*)`. |
| One `theme.css`, imported by one `global.css`, one app | Three federated frontends (shell + 2 remotes), each its own build, each runs standalone too | **`theme.css` lives in a shared package** (`packages/theme`). Every remote and the shell import it. One source of truth. |
| Dual axis: brand `theme-*` classes × `data-mode` | augment-it has ONE brand | **Single theme, three modes.** No `theme-*` class axis. The only axis is `data-mode` (light/dark/vibrant). Simpler than Astro Knots. |

Everything else is unchanged: two token tiers, `data-mode` on `<html>`, the
mode-switcher utility (localStorage `mode` key, `mode-change` event, SSR-safe),
the 3-mode toggle in persistent chrome, `--fx-*` effect tokens for vibrant.

## The load-bearing idea (so the rest follows)

Components reference **only semantic tokens** — `var(--color-background)`,
`var(--color-accent)`. They contain **zero mode-specific CSS**. `theme.css`
defines three mode blocks that re-point the semantic tokens:

```css
[data-mode="light"]   { --color-background: var(--color__paper-warm); }
[data-mode="dark"]    { --color-background: var(--color__graphite-1000); }
[data-mode="vibrant"] { --color-background: var(--color__void-violet); }
```

The mode-switcher flips `data-mode` on `<html>`. Every `var()` in every
component — across the shell and both remotes, because they share one document
— re-resolves. No component has a `[data-mode]` selector. That is the whole
elegance: components are mode-agnostic; `theme.css` owns mode.

In a federated app this is especially clean: `<html>` is a single element
shared by the host and every mounted remote. The shell sets `data-mode` once;
the remotes' CSS inherits it for free.

## Token inventory — derived from the current CSS

An audit of the five CSS surfaces turns up 13 hex values and 5 rgba values.
They collapse to this semantic token set (Tier 2 — what components will use):

| Semantic token | Role | Current dark value |
|---|---|---|
| `--color-background` | page background | `#0f1115` |
| `--color-surface` | panel / card background | (border + near-transparent) |
| `--color-surface-raised` | shell header, raised chrome | `#0c0d12` |
| `--color-field` | input / code / pre background | `#16181f` |
| `--color-field-focus` | focused input background | `#1a1d27` |
| `--color-border` | all borders, inactive chips | `#232634` |
| `--color-text` | primary text | `#e8eaf0` |
| `--color-text-muted` | secondary text | `#8a8f9b` |
| `--color-accent` | primary accent (magenta-violet) | `#c75bfb` |
| `--color-accent-2` | secondary accent (cyan) | `#5bbcfb` |
| `--color-on-accent` | text on an accent-filled button | `#0f1115` |
| `--color-ok-bg` / `--color-ok-text` | success / open status | `#1b3d2f` / `#a4e3b5` |
| `--color-error-bg` / `--color-error-text` | error / closed / delete | `#3d1b1b` / `#f29a9a` |
| `--color-selected-tint` | selected-row / active-tab wash | `rgba(199,91,251,0.06)` |

Plus a small effect-token set (Tier 2, `--fx-*`):

| Effect token | Role |
|---|---|
| `--fx-accent-glow` | box-shadow / glow on accent elements — `none` in light, soft in dark, loud in vibrant |
| `--fx-card-shadow` | panel elevation |
| `--fx-flash` | the record-collector cell-update flash colour |

~16 colour tokens + 3 effect tokens. Tractable. Each is one line per mode block.

## Architecture

```
packages/theme/                     # NEW shared package
├── package.json                    # exports ./theme.css and ./mode-switcher
├── theme.css                       # Tier 1 named tokens + Tier 2 semantic tokens
│                                    #   + 3 mode blocks + base body/element rules
└── mode-switcher.ts                # SSR-safe; data-mode on <html>; localStorage;
                                     #   mode-change event; cycle light→dark→vibrant

every frontend imports '@augment-it/theme/theme.css' as a side effect:
  shell/src/index.ts
  apps/record-collector/src/index.ts      (standalone)
  apps/record-collector/src/mount.ts      (federated)
  apps/prompt-template-manager/src/index.ts
  apps/prompt-template-manager/src/mount.ts

the shell additionally:
  - imports mode-switcher, boots it on mount
  - renders a 3-mode ModeToggle in its header chrome
```

`theme.css` is imported the same way `app.css` already is — a side-effect
import that style-loader injects. It must load *before* the component CSS so
the `:root` tokens exist when components resolve `var()`; import order in each
entry file handles that.

## Phases

### Phase 1 — the `packages/theme` package

Create `packages/theme/`:

- **`theme.css`**:
  - Tier 1 named tokens in `:root` — the raw palette. Three sub-palettes' worth
    of named tokens (`--color__graphite-1000`, `--color__paper-warm`,
    `--color__void-violet`, `--color__magenta-electric`, …). `__` separator.
  - Tier 2 semantic tokens in three mode blocks: `[data-mode="light"]`,
    `[data-mode="dark"]`, `[data-mode="vibrant"]`. Each re-points the ~16
    colour tokens + 3 `--fx-*` tokens to named tokens.
  - A `:root` default = dark (so a document with no `data-mode` yet still
    renders correctly — no FOUC into unstyled).
  - Base rules: `body { background: var(--color-background); color: var(--color-text); … }`,
    a `*` border-box reset, the `transition: background-color 75ms` theme-swap
    timing from the blueprint.
- **`mode-switcher.ts`** — adapted from the blueprint's `ModeSwitcher`:
  - `light | dark | vibrant`, persisted to `localStorage` under `mode`.
  - `applyMode()` sets `data-mode` on `document.documentElement`.
  - `cycleMode()` — light → dark → vibrant → light (the 3-mode toggle).
  - SSR-safe (guards `document`/`window`/`localStorage`).
  - Dispatches a `mode-change` event on `window`.
  - Default mode: **dark** (augment-it's current look is already dark).
- **`package.json`** — `@augment-it/theme`, `exports` for `./theme.css` and
  `./mode-switcher`.

**Check:** the package builds; `theme.css` is valid CSS; mode-switcher
typechecks.

### Phase 2 — wire theme.css into every frontend

Add `@augment-it/theme` as a dependency of `shell`, `record-collector`,
`prompt-template-manager`. Import `'@augment-it/theme/theme.css'` at the top of
each entry (`index.ts`) and each `mount.ts` — before the existing `app.css`
import. Delete the `STANDALONE_BODY_CSS` hacks in the two `index.ts` files and
the `:global(body)` rule in the shell — `theme.css`'s base rules replace them.

**Check:** `docker`/dev servers still boot; pages render (still dark, since
that's the default mode and the tokens still resolve to the current values).

### Phase 3 — replace every hardcoded hex with semantic `var()`

Five surfaces, mechanical:

- `shell/src/App.svelte` `<style>` block
- `apps/record-collector/src/app.css`
- `apps/prompt-template-manager/src/app.css`
- (the two `index.ts` body blocks — deleted in Phase 2)

Every `#rrggbb` and `rgba(...)` → the matching `var(--color-*)` / `var(--fx-*)`.
The audit table above is the mapping. After this, **grep for `#` in those files
returns nothing** (except maybe in comments) — that is the acceptance check.

The dark-mode values stay byte-identical to today's hex, so Phase 3 is a
visual no-op in dark mode. Light and vibrant become reachable.

### Phase 4 — the 3-mode toggle in the shell chrome

- A `ModeToggle.svelte` in the shell — a single cycle button (light → dark →
  vibrant) with inline sun / moon / star SVGs, icon visibility driven by
  `html[data-mode="…"]` CSS. Calls `cycleMode()` from the mode-switcher.
- Rendered in the shell header, right side, persistent across both tabs.
- The shell's `index.ts` boots the mode-switcher (imports it; the singleton
  applies the stored/default mode on load).
- Standalone remotes (`:3002`, `:3003`) also boot the mode-switcher in their
  own `index.ts` so they theme correctly when run alone — but they do **not**
  render a toggle (the toggle is shell chrome; standalone just picks up the
  persisted mode).

**Check:** the toggle cycles; `data-mode` flips on `<html>`; all three modes
render across both tabs.

### Phase 5 — verify and tune

Click through light / dark / vibrant on both the Record Collector and Prompt
Templates tabs. Confirm: no unstyled flashes, no stuck hex, status colours and
accents legible in all three modes, the selected-row / active-tab tints work.

Then **the user tunes**. Phases 1–4 impose the *structure* and a *first-pass
palette*. Adjusting the actual look — "vibrant's accent should be louder", "the
light-mode border is too heavy" — is a one-line re-point at the named-token
tier per the blueprint's client-iteration motion. That iteration is expected
and is the system working as designed; it is not rework.

## What this plan does vs. what the user does

- **This plan wires the machine**: the package, the switcher, the toggle, the
  token tiers, every hex → `var()`. After it lands, all three modes *work*.
- **The user owns the palette**: the named-token values for light and vibrant
  especially. Dark is pinned to today's look as the safe baseline. The user
  edits `packages/theme/theme.css`'s Tier-1 named tokens; nothing else moves.

## Out of scope

- A `/brand-kit` or `/design-system` reference page (the blueprint's §5.1).
  Worth doing later; not needed to ship the three modes.
- The mode-aware brand-mark component (blueprint §8) — augment-it has no
  raster wordmark in the chrome yet, just the text "augment-it". Revisit if a
  logo lands.
- A Vitest theme/mode integration suite (blueprint §6). The mode-switcher is
  small and SSR-guarded; a test suite is good hygiene but not a blocker.
- Per-app brand themes (the `theme-*` axis). augment-it is one brand.

## Open questions

- **`packages/theme` vs folding into `packages/config`.** `packages/config`
  exists as an empty stub. A dedicated `packages/theme` is more self-documenting
  and the import path (`@augment-it/theme/theme.css`) reads correctly. This plan
  assumes a new `packages/theme`.
- **Vibrant palette direction.** augment-it's accent is already a magenta-violet
  (`#c75bfb`). Vibrant should push that — louder accent, a gradient or two, real
  `--fx-accent-glow`. The first pass will be a reasonable loud-dark; the user
  tunes from there.
- **FOUC on first paint.** The mode-switcher applies `data-mode` on script run;
  there's a sub-frame window where `:root`'s default (dark) shows before a
  stored `light`/`vibrant` is applied. Astro Knots solves this with an inline
  head script. augment-it's remotes are JS-mounted (no SSR), so the gap is tiny;
  if it flickers, an inline pre-mount script in each `index.html` template is
  the fix. Noted, not pre-solved.

## See also

- [[Maintain-Themes-Mode-Across-CSS-Tailwind]] — the Astro Knots blueprint this
  adapts. The two-tier rationale, the mode-switcher behaviour, the `--fx-*`
  convention all come from there.
- `theme-system` skill — the firm-wide three-mode contract.
- [[Augment-It-Workspace-Walking-Skeleton]], [[Prompt-Template-Manager-Walking-Skeleton]]
  — the walking skeletons this themes.
