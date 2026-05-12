---
title: Add a GitHub Pages splash for augment-it
lede: A small Astro site at splash/ that ships to GitHub Pages on push to main, renders the repo's changelog/ and context-v/ alongside curated copy about the six module-federated microfrontends.
publish: true
date_authored_initial_draft: 2026-05-12
date_authored_current_draft: 2026-05-12
date_first_published: 2026-05-12
date_created: 2026-05-12
date_modified: 2026-05-12
at_semantic_version: 0.0.1
status: Beta
augmented_with:
  - Claude Opus 4.7 (1M context)
authors:
  - Michael Staton
tags:
  - Splash
  - GitHub-Pages
  - Astro
  - Pagefind
  - Module-Federation
---

## Why Care?

augment-it now has a public face. Before this, the only artifact a visitor
could land on was the repo README, which describes the tech stack but not
the *shape of the workshop*. The splash exists so a stranger can land at
`lossless-group.github.io/augment-it/` and understand — within fifteen
seconds — what the six microfrontends are, what they do together, and
where the project actually lives.

It's also where the repo's `changelog/` and `context-v/` get rendered.
Versioned context becomes legible to someone who doesn't have the repo
checked out.

## What's New?

- `splash/` — an Astro Knots site, single-project variant. base
  `/augment-it/`, vibrant default mode, magenta-violet brand spine
  lifted from the wordmark gradient.
- The hero is a **module-federation manifest**: a 2×3 grid of the six
  microfrontends as primary content. No traditional centered headline +
  diagram pair. A pipeline rail below names the flow order
  (record → prompt → request → response → highlight → insight).
- **Pagefind** wired by default — header search popover with `/` keyboard
  shortcut, full `/search` page, token-driven UI overrides that pivot
  through vibrant/dark/light modes.
- **Sort controls** on `/changelog/` and `/context-v/` with per-page
  `localStorage` persistence, server-pre-sorted to match the UI default.
- Lenient content schemas + defensive `toDate(unknown)` helper —
  schemas never throw, render code never crashes on legacy entries.
- `.github/workflows/pages.yml` deploys on push to `main` using
  `actions/deploy-pages@v4` and `actions/configure-pages@v5` with
  `enablement: true` so Pages bootstraps itself on first run.
- `changelog/` and `context-v/` scaffolded at the repo root per the
  universal-directory convention.
