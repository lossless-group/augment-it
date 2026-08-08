---
date_created: 2026-08-06
date_modified: 2026-08-08
title: "Federated tokens get a floor — and React finally leaves the building"
lede: "Ask a hard question about a micro-frontend architecture and you sometimes learn the answer is 'it renders invisible text and tells you everything is fine.' We measured that failure in a browser, then gave every design token a floor so it can't happen."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - packages/theme/token-baseline.css
  - packages/federation/src/index.ts
  - scripts/generate-token-baseline.mjs
  - tsconfig.json
  - tsconfig.base.json
  - shell/src/css.d.ts
  - shell/src/App.svelte
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/row-store/src/handlers.ts
tags:
  - Augment-It
  - Design-System
  - Module-Federation
  - Design-Tokens
  - Accessibility
  - Refactor
---

# Federated tokens get a floor

## Why Care?

augment-it is seventeen micro-frontends that load into one shell at runtime, each built and deployed on its own schedule. That independence is the whole point — but it raises a question we hadn't answered: **the shell owns the design tokens, so what happens to a micro-frontend that ships before the shell catches up?**

The honest answer turned out to be *the worst possible one*. Not an error. Not a fallback. The component renders **black text on a transparent background** and reports success. In production. And you can't see it locally, because your machine has the latest theme.

That's now impossible. Every design token has a floor underneath it.

## What's New?

- **A20 closed** — every federated token is registered with `@property` and an initial value, so a missing or stale shell degrades to a legible dark surface instead of nothing
- **`token-baseline.css` is generated, not hand-written** — `pnpm tokens:baseline` derives it from `theme.css`; `pnpm tokens:check` fails CI if they drift
- **Federated bundles got 3KB smaller** — they carry a 24-token floor instead of the whole theme
- **React is gone** — one config line was its entire footprint, in a codebase that bans it
- **The shell's typecheck passes for the first time**
- **Five services stopped sharing a function name** — `registerHandlers` was ambiguous five ways

## The question that started it

> *"How do we make sure the microfrontends inherit the global federated classes so there's no failure when one thing breaks somewhere?"*

Good question. CSS custom properties inherit down the document, so a member picks up whatever the shell declares. Fine when everyone's current. But token **removal** and token **introduction** are not symmetric:

| Change | Old member, new shell | New member, old shell |
|---|---|---|
| **Remove** a token | Alias it forever. Fine. | n/a |
| **Add** a token | n/a | **Resolves to nothing.** |

"Nothing" is not a metaphor. An undeclared custom property is *invalid at computed-value time* — `color` falls back to inherited, `background-color` to transparent.

## We measured it rather than argued about it

Rather than reason from the spec, we drove the real built stylesheets through a browser in three configurations:

```
healthy (shell theme + member bundle)
  tokens resolve to the shell's values · all three modes distinct ✅

degraded (member bundle ONLY — a stale shell)
  #e8eaf0 on #13151b · contrast 15.17:1 · neither transparent ✅

counterfactual (a token neither declared nor registered)
  rgb(0,0,0) on rgba(0,0,0,0) ← black text, transparent background
```

That third line is the bug, reproduced. It's also why we ran it: without the counterfactual, "the degraded case looked fine" proves nothing — it might have worked for unrelated reasons.

## How the floor works

CSS has had the answer since `@property` shipped. Registering a custom property gives it a **typed initial value** that applies when nothing declares it:

```css
@property --color-surface {
  syntax: '<color>';
  inherits: true;
  initial-value: #13151b;
}
```

Now `var(--color-surface)` can never resolve to nothing. Worst case it's the floor. The shell's real declarations still win whenever they exist — so this costs exactly nothing when the stack is healthy, and saves you when it isn't.

The shell stays the canonical source. Members carry only the floor. Standalone entries still load the full theme, because they have no shell to inherit from.

### Generated, because a hand-maintained copy would drift by Thursday

```bash
pnpm tokens:baseline   # regenerate from theme.css
pnpm tokens:check      # CI: fail if stale
```

The generator flattens each token through its Tier-1 reference to a literal — `initial-value` forbids `var()` — and picks `<color>` or the universal syntax per token. That last part matters: registering a box-shadow as `<color>` invalidates the whole rule and CSS drops it *silently*. Zero dependencies, pure Node.

## Under the hood: three smaller things

**React was one line.** The root `tsconfig.json` set `"jsx": "react-jsx"` — the only React reference anywhere in a repo where React is a hard prohibition, with zero `.tsx` files and no `react` dependency. Scaffold vestige that survived because nothing extends that file, so nobody ever read it. Now `"jsx": "preserve"`: TSX stays legal, no runtime is bound.

**The shell's typecheck had never passed.** Two errors, and the interesting part is *why nobody fixed them*: the shell needed a `css.d.ts` shim, but its tsconfig omitted `src/**/*.d.ts` from `include` — so adding the shim wouldn't have helped. Two halves of one bug. Fixing it also revealed the shell as the **eighteenth** copy of a tsconfig we'd converged earlier that day.

**Five services, one function name.** `registerHandlers` existed five times, once per NATS service, and three of them ranked in the codebase graph's top ten by connectivity — the most-connected symbols in the system were also the least searchable. Now service-qualified.

That last one came with a lesson: our refactor doc said there were *three*, because three was what the graph's top-ten showed. God-node rankings report the top of a distribution, not a census.

## Verified

- 19 packages build · **1,587 files typecheck clean** (up from 1,494 with the shell failing outright) · all suites pass
- `record-collector`'s built CSS is **byte-identical** before and after the federation change — same content hash

## What's Next?

The floor covers the 24 tokens that exist today. Members can still invent tokens *after* a baseline is generated, so the 939 `var()` calls with no inline fallback are worth sweeping — belt and braces.

And the bigger one: 1,386 of 1,392 CSS selectors are unique to a single app. There's almost nothing to deduplicate; there are seventeen independently invented vocabularies. The component library is greenfield extraction, not consolidation.
