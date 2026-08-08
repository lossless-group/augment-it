---
date_created: 2026-08-08
date_modified: 2026-08-08
title: "The design system arrives — and gets looked at for the first time"
lede: "Thirty-five design tokens had been verified by arithmetic and never once rendered. We built the page that renders them, and it found three bugs in itself and three in the theme before it had been open a minute."
publish: true
authors:
  - Michael Staton
  - Steven Blake Casio
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - packages/theme/theme.css
  - scripts/design-drift.mjs
  - apps/docs-portal/src/App.svelte
  - design-manifest.json
  - shell/src/DevelopersMenu.svelte
  - shell/src/App.svelte
tags:
  - Augment-It
  - Design-System
  - Design-Tokens
  - Accessibility
  - Module-Federation
---

# The design system arrives

## Why Care?

augment-it is seventeen micro-frontends that load into one shell. Seventeen surfaces, built one at a time, each of which invented its own greys. A design system is the fix, and ours had a real problem: it existed entirely as **documentation and arithmetic**.

Thirty-five tokens. One hundred and eight contrast pairs computed. Eleven enforcement rules. And, by its own author's admission, *"not one change has been rendered in a browser."*

That gap is now closed. The tokens are in the repo, there is a page that shows every one of them on every surface in all three modes, and it is one click from the shell header — signed in or not.

## What's New?

- **The token system landed.** Blake's Phase 0 and Phase 1 — the enforcement script, the colour tier, five accessibility fixes — merged from the laptop they had been stranded on.
- **A design system viewer**, showing 30 colour tokens × 5 surfaces with live measured contrast, in dark, light and vibrant.
- **A Developers menu** in the shell header, replacing a label that said `tiling host · :3100` and nothing else.
- **The viewer opens inside the shell**, and works without signing in.
- **A drift-checker bug fixed** that had been quietly reporting everything as fine.

## The part where the checker wasn't checking

Phase 0's whole point is `design-drift.mjs`: until it existed, the eleven design rules were prose. With the work merged, we ran it. **18 failures**, almost all "no per-member DESIGN.md", which is known Phase 8 work. Looked healthy.

It wasn't. The member list is parsed out of DESIGN.md's frontmatter with a regex, and one capture group was greedy across a comma:

```js
// path: shell, prefix: shell, …   →   path === "shell,"
entry.match(/…path:\s*(\S+)…/)
```

`shell,/src` is not a directory. So the file walker returned **nothing for all nineteen members**, and every check that inspects member files — hardcoded colours, raw z-indexes, illegal token usage — had nothing to look at and passed.

The disguise was good. The one check still firing was the DESIGN.md one, which broke the same way, so it failed for everybody — and "no DESIGN.md at member root" reads as *we haven't done that phase yet*, not as *I am blind*.

Real number, once fixed: **98**.

Blake's own notes name this failure mode — *a checker reporting success because it failed to look* — and document two earlier instances he caught. This was the third.

## What rendering found

The viewer is deliberately shallow: one grid, one loop, its own chrome built only from design tokens so a broken token can't hide behind a colour the page smuggled in. It paints `color: var(--token)` over `background: var(--surface)` and measures the result **from what the browser actually painted**, not from what the stylesheet says.

It found three bugs in itself, none of which a build or a typecheck could see:

- **Every contrast number was blank.** Reading a token's value returns a hex string; the parser expected `rgb()` and silently matched the digits inside the hex.
- **Every reading was taken mid-animation.** The theme transitions colour over 75ms on a mode swap, so measuring two frames later caught colours still moving. It reported the dark background as light grey and every vibrant token as failing.
- **It cried wolf.** Grading all 150 cells produced 75 "failures" — the grid pairs every token with every surface, and most pairings the product never makes.

And two where the page was wrong about the theme rather than the other way round: `--color-thread` graded as text when the spec calls it a line, and `--color-on-accent` graded against surfaces it never touches. It now has its own section testing it on the accent fills, where it passes comfortably — 5.19 to 14.11.

Then, once it was honest, three findings in the theme itself:

| Finding | |
|---|---|
| `--color-border` misses the 3:1 boundary bar on every surface, every mode | confirms a known open question |
| `--color-thread` carries the border value, so the chat rail is below it too | **not previously recorded** |
| `--color-border-strong` fails on all five surfaces in **light** mode | **contradicts a documented fix** |

That last one matters. The border question was deferred as a brand decision because changing it changes the look of everything — and `--color-border-strong` was the compliant escape hatch you reach for when a boundary must actually meet the bar. If it doesn't clear 3:1 either, there is no escape hatch.

## Under the hood

The viewer is a federated remote that also runs standalone. The two entries differ on purpose: mounted in the shell it loads only the token floor, because the shell is the canonical injector and supplies all three mode blocks; standalone it loads the full theme, because there is no shell to inherit from and a one-mode swatch page would be pointless.

Its token list is generated from the stylesheet rather than hand-kept, with a check that fails if the two drift apart. That check earned itself immediately: merging Phase 1 changed the theme, and it caught the staleness before anything else did.

It renders **outside the sign-in wall**. Brand guidelines and a token contract are not client data, and gating them costs a developer the one reference they need while debugging a themed surface — including the case where what's broken is why they can't get past the wall.

## What's Next?

The numbers now say what to do. The border tokens need a brand decision, and it is a narrower decision than it looked: not "what colour is our border" but "what is the compliant line, given the one we designated does not clear the bar in light mode."

And with a surface to look at, Phase 2 can finally pick typography, spacing and radius **by eye** — which was always the only way to pick them.
