---
title: "Light, dark, vibrant — augment-it adopts the Lossless theme religion"
lede: "augment-it had its colours hardcoded as hex scattered across five CSS surfaces. Now it has a theme system: a shared @augment-it/theme package with one theme.css holding a two-tier token architecture and three mode blocks, a mode-switcher, and a sun/moon/star toggle in the shell chrome. Light, dark, and vibrant all work across both federated remotes — switched by one data-mode attribute on a shared <html>. The Astro Knots theme blueprint, adapted for a non-Astro, non-Tailwind, federated app."
publish: true
date_created: 2026-05-21
date_modified: 2026-05-21
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Theme-System
  - Three-Mode-Contract
  - Two-Tier-Tokens
  - Light-Dark-Vibrant
  - CSS-Custom-Properties
  - Module-Federation
  - Design-Tokens
files_changed:
  - context-v/plans/Impose-Theme-Modes-System.md
  - packages/theme/package.json
  - packages/theme/theme.css
  - packages/theme/mode-switcher.ts
  - packages/theme/README.md
  - shell/package.json
  - shell/src/App.svelte
  - shell/src/index.ts
  - shell/src/ModeToggle.svelte
  - apps/record-collector/package.json
  - apps/record-collector/src/app.css
  - apps/record-collector/src/index.ts
  - apps/record-collector/src/mount.ts
  - apps/prompt-template-manager/package.json
  - apps/prompt-template-manager/src/app.css
  - apps/prompt-template-manager/src/index.ts
  - apps/prompt-template-manager/src/mount.ts
  - pnpm-lock.yaml
---

## Why Care?

Every Lossless Group site ships with three visual modes — **light, dark, vibrant** — and a two-tier design-token system. It's a firm-wide convention: nerds pick dark, traditionalists pick light, design-forward stakeholders pick vibrant, and the toggle ends the argument before it starts. augment-it didn't have it. Its colours were thirteen hex values and five rgba values, hardcoded and scattered across the shell and both remotes. One look, no switch, no system.

Now it has the religion. Open the shell, and the header carries a sun/moon/star toggle that cycles **light → dark → vibrant**. Both federated tabs — Record Collector and Prompt Templates — re-theme instantly when you click it. The mode persists across reloads.

Two reasons this matters beyond "augment-it looks nicer now":

1. **It's a client-facing demo, and the client gets to pick.** augment-it exists partly to show a 26-product client what a real microservices-plus-microfrontends architecture feels like. "Can we see it in light mode?" now has an answer that isn't a code change.
2. **The two-tier token system means re-skinning is a one-line change.** When the look needs adjusting — and it will — you re-point a semantic token at a different named token in one file. No component touches. That's the whole point of the architecture, and it's now in place.

## What's New?

- **`packages/theme`** — a new shared package, the single source of truth for colour across all three federated frontends. Two files:
  - **`theme.css`** — Tier-1 named tokens (the raw palette), Tier-2 semantic + `--fx-*` effect tokens, three `data-mode` blocks (light / dark / vibrant), and the base `body` rules.
  - **`mode-switcher.ts`** — SSR-safe; sets `data-mode` on `<html>`; persists to localStorage; `cycleMode()` advances light → dark → vibrant; dispatches a `mode-change` event.
- **A mode toggle in the shell chrome** — `ModeToggle.svelte`, a single cycle button with inline sun / moon / star SVGs, in the header, visible on every tab.
- **Every hardcoded colour is gone.** The shell's `<style>` block and both remotes' `app.css` files now reference only semantic `var(--color-*)` / `var(--fx-*)` tokens. `grep` for a hex value in those files returns nothing.
- **The `STANDALONE_BODY_CSS` hacks are deleted.** Both remotes used to inject body styling via a hand-rolled `<style>` tag. `theme.css`'s base rules replace all of it.

## The religion, and how it adapts to a non-Astro app

The Lossless theme convention is documented in the Astro Knots blueprint (`astro-knots/context-v/blueprints/Maintain-Themes-Mode-Across-CSS-Tailwind.md`). But that blueprint assumes Astro + Tailwind v4 + a single app. augment-it is Svelte 5 + Rsbuild + Module Federation — no Tailwind, three separately-built frontends. The religion adapts; three things change.

| Blueprint assumes | augment-it | Adaptation |
|---|---|---|
| Tailwind v4 `@theme` generates utilities | no Tailwind | **Drop the Tailwind layer.** The tokens are plain CSS custom properties — they work without it. |
| one `theme.css`, one app | three federated frontends | **`theme.css` lives in a shared package**; every remote imports it. One source of truth. |
| dual axis: brand `theme-*` × `data-mode` | one brand | **Single theme, three modes.** Only the `data-mode` axis. |

What carried over unchanged: the two-tier tokens, the three-mode contract, `data-mode` on `<html>`, the mode-switcher, the chrome toggle, the `--fx-*` effect-token convention for mode-scaled visual intensity.

## The two-tier token system

Tokens come in two tiers, distinguished by naming.

**Tier 1 — named tokens.** The raw palette, `__` separator: `--color__graphite-950: #0f1115`, `--color__magenta-loud: #d96bff`. These are "the things we have." Components never read them.

**Tier 2 — semantic tokens.** What components consume, kebab-case: `--color-background`, `--color-accent`, `--color-error-text`. Each is wired to a named token via `var()`, and re-wired per mode.

```css
/* Tier 1 — named tokens (top of theme.css) */
:root {
  --color__graphite-950: #0f1115;
  --color__paper-50:      #faf9f6;
  --color__void-950:      #0c0814;
}

/* Tier 2 — three mode blocks re-point the semantic token */
:root, [data-mode='dark'] { --color-background: var(--color__graphite-950); }
[data-mode='light']       { --color-background: var(--color__paper-50); }
[data-mode='vibrant']     { --color-background: var(--color__void-950); }
```

The augment-it audit collapsed thirteen hex + five rgba values down to **sixteen semantic colour tokens plus three `--fx-*` effect tokens**. Each is one line per mode block. The tints (`--color-selected-tint`, `--color-danger-tint`) use `color-mix()` against the accent, so they follow the accent automatically across all three modes.

## The load-bearing mechanism

Components reference **only semantic tokens** and contain **zero mode-specific CSS**. `theme.css` owns mode entirely. The mode-switcher flips one attribute — `data-mode` on `<html>` — and every `var()` in every component re-resolves.

In a federated app this is unusually clean. `<html>` is a *single element* shared by the shell host and every mounted remote. The shell sets `data-mode` once; the remotes' CSS — record-collector's `.rc-app`, prompt-template-manager's `.ptm-app` — inherits it for free, because it's all one document. No cross-remote message passing, no shared state. One attribute, one document, three modes.

## Effect tokens — visual intensity scales with the mode

Colour tokens handle text and surfaces. Effects — glows, shadows — need their own tokens because their *intensity* should scale with the mode. The `--fx-*` tier does this:

```css
[data-mode='light']   { --fx-accent-glow: none; }
[data-mode='dark']    { --fx-accent-glow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent); }
[data-mode='vibrant'] { --fx-accent-glow: 0 0 20px color-mix(in srgb, var(--color-accent) 45%, transparent); }
```

Light is minimal, dark is moderate, vibrant is loud — and a component that uses `box-shadow: var(--fx-accent-glow)` (the mode toggle does, on hover) gets the right intensity for free.

## What's pinned, what's a first pass

- **Dark mode is pinned to the old look.** Every dark-mode token resolves to the exact hex augment-it shipped with. Imposing the system was a visual no-op in dark — by design, so the change couldn't regress the known-good state.
- **Light and vibrant are a reasonable first pass.** Warm paper / dark ink for light; violet-tinted near-black with a louder magenta for vibrant. They render coherently but they're untuned.
- **Tuning is now a one-file job.** Adjusting any mode's palette means editing `packages/theme/theme.css` — the Tier-1 named tokens, or a Tier-2 re-point. No component changes, ever. That iteration is the system working as designed.

## Files Worth Knowing About

- `packages/theme/theme.css` — the whole token system in one file. Tier 1 at the top, three mode blocks below, base rules last. This is the file to edit to re-skin.
- `packages/theme/mode-switcher.ts` — the `data-mode` + localStorage + event machinery. ~70 lines, SSR-guarded.
- `shell/src/ModeToggle.svelte` — the cycle button. Pure chrome: reads `getMode()`, calls `cycleMode()`, tracks the `mode-change` event.
- `context-v/plans/Impose-Theme-Modes-System.md` — the plan, including the token audit table (the literal hex → token mapping) and the federated-app adaptation rationale.

## What's Next

- **Tune the palette.** Light and vibrant want a real design pass. One file.
- **FOUC on first paint.** The mode-switcher applies `data-mode` on script run; there's a sub-frame window where dark (the `:root` default) shows before a stored `light`/`vibrant` applies. augment-it's remotes are JS-mounted with no SSR, so the gap is tiny — but if it flickers, an inline pre-mount script in the HTML template is the fix.
- **A `/brand-kit` page.** The blueprint calls for a reference page surfacing all tokens and modes. Worth doing once the palette settles.
- **The enrichment refinements** still queued from the prior entries — clean-output hardening, full-set runs, the lineage view.

## See also

- [[Impose-Theme-Modes-System]] — the plan this executed.
- `astro-knots/context-v/blueprints/Maintain-Themes-Mode-Across-CSS-Tailwind.md` — the Astro Knots blueprint this adapts; the two-tier rationale and `--fx-*` convention come from there.
- [[2026-05-21_05_Prompt-Template-Manager-UI]] — the prior entry; the UI this now themes.
