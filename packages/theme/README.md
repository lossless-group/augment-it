# @augment-it/theme

The two-tier token system and the light / dark / vibrant three-mode contract,
shared across every augment-it frontend (shell + record-collector +
prompt-template-manager).

- `theme.css` — Tier 1 named tokens, Tier 2 semantic + `--fx-*` tokens, three
  `data-mode` blocks, base body rules. Import as a side effect.
- `mode-switcher.ts` — SSR-safe; sets `data-mode` on `<html>`; persists to
  localStorage; `cycleMode()` advances light → dark → vibrant.

To re-skin: re-point a Tier-2 semantic token at a different Tier-1 named token
in `theme.css`. Components reference only Tier-2 and never change.

Adapted from the Astro Knots blueprint
`astro-knots/context-v/blueprints/Maintain-Themes-Mode-Across-CSS-Tailwind.md`.
See `../../context-v/plans/Impose-Theme-Modes-System.md`.
