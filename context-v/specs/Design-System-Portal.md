---
title: "Design System Portal"
lede: "Specification for the portal that renders the federated design system — the swatch page, the token catalogue, the member index."
date_created: 2026-08-01
date_modified: 2026-08-01
semantic_version: 0.0.1.0
status: Draft
tags:
  - Design-System
  - Portal
  - Swatch-Page
  - Phase-2a
---

# Design System Portal

## 1. Purpose

The portal is the single surface where every federal token can be seen — in all
three modes, on one page, against every surface it will ever sit on. It is the
answer to "nothing has been seen in a browser."

## 2. Two jobs

1. **The swatch page (Phase 2a, P0).** Render every Tier-2 token against every
   surface, in all three modes. A stylesheet and a loop.

2. **The token catalogue (Phase 2a, post-P0).** The full federal vocabulary,
   with resolved values per mode, the member index, and the deviation registry.
   Generated from `design-manifest.json`.

## 3. Phase 2a — P0 swatch page

### The bare minimum

A single page at `apps/docs-portal` with one stylesheet and one loop.

```svelte
{#each tokens as token}
  <div class="swatch-row">
    <span class="token-name">{token.name}</span>
    {#each surfaces as surface}
      <div class="swatch" style="background: var({surface}); color: var({token.name})">
        {token.name}
      </div>
    {/each}
  </div>
{/each}
```

The token list comes from `design-manifest.json`. The surface list is:
`--color-background`, `--color-surface`, `--color-surface-2`,
`--color-surface-raised`, `--color-bg-elevated`.

### Mode toggle

Three buttons cycling `data-mode` on `<html>`. The portal imports `mode-switcher`
from `@augment-it/theme`.

### What it proves

- Every token resolves in all three modes
- No token disappears on a surface (P2, P3)
- Contrast numbers are visible in context
- Phase 2 can pick typography, spacing and radius values by eye

## 4. Portal v1 (post-P0)

### Pages

| Page | Source |
|---|---|
| Token catalogue | `design-manifest.json` |
| Member index | `design-manifest.json` |
| Deviation registry | `design-manifest.json` |
| Contrast matrix | `design-drift --contrast --json` |

### Generation

The portal build runs `design-drift --json` and reads `design-manifest.json`.
Nothing is hand-maintained. The manifest is generated from the frontmatter of
the 20 documents.

## 5. Deployment

The portal lives at `apps/docs-portal`. It is one more federation remote —
it mounts into the shell like any other member. It imports `theme.css` and
`mode-switcher`, and its `mount.ts` follows F10 (no theme import in the
federated mount).

## 6. Why the portal is load-bearing

The swatch page is the only surface where every token's rendered appearance
can be verified. Until it exists, "108/108 contrast pairs pass" is a number
in a terminal — accurate, but not eye-verified. The portal closes that gap
for colour in Phase 2a, and for typography, spacing and radius in Phase 2.
