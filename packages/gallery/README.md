# `@augment-it/gallery`

The component-library runtime for the federated design system. One runtime,
seventeen sovereign catalogs.

Spec: [`context-v/specs/Federated-Component-Libraries.md`](../../context-v/specs/Federated-Component-Libraries.md).
Reference implementation: `apps/corpora-curator/src/gallery/`.

This package knows nothing about any member. Prefix, root class, origin,
sections and fixtures all arrive as data, so the same runtime renders every
member's library and the member keeps sole ownership of its contents.

## Adding a library to a member

**1 — depend on it**

```jsonc
// apps/<member>/package.json
"dependencies": { "@augment-it/gallery": "workspace:*" }
```

**2 — declare the catalog** (`src/gallery/catalog.ts`)

```ts
import { defineGallery } from '@augment-it/gallery';
import Thing from '../Thing.svelte';

export default defineGallery({
  member: 'pack-runner',
  prefix: 'pr',                 // from DESIGN.md's member registry
  rootClass: 'pr-app',          // without the dot — wraps every frame
  origin: 'http://localhost:3009',
  exemptClasses: ['active'],    // state hooks that carry no prefix
  sections: [
    {
      id: 'components',
      title: 'Components',
      entries: [
        {
          id: 'thing',
          name: 'Thing',
          kind: 'component',
          source: 'apps/pack-runner/src/Thing.svelte',
          summary: 'What it is, and when to reach for it.',
          usage: '<Thing label="…" />',
          tokens: ['--color-accent', '--color-border'],
          component: Thing,
          controls: { label: { kind: 'text', value: 'Fire' } },
          fixtures: [
            { id: 'rest', name: 'Rest' },
            { id: 'empty', name: 'Empty', props: { items: [] }, note: 'Why this state matters.' },
          ],
        },
      ],
    },
  ],
});
```

**3 — expose it** (`src/gallery/mount.ts`)

```ts
import { makeGalleryMount } from '@augment-it/gallery';
import '../app.css';
import catalog from './catalog';

export const mountPackRunnerGallery = makeGalleryMount(catalog);
```

> **Import order is load-bearing.** `@augment-it/gallery` carries
> `token-baseline.css` — the `@property` floor that keeps a member legible when
> it outruns the deployed shell (see `packages/federation/src/index.ts`). It
> must evaluate before `../app.css`, whose rules read those tokens. ES module
> imports evaluate in declaration order. Swap the two lines and the specimens
> render unstyled.

**4 — federate it** (`rsbuild.config.ts`)

```ts
exposes: {
  './mount': './src/mount.ts',
  './gallery': './src/gallery/mount.ts',
},
```

**5 — route it standalone** (`src/index.ts`)

```ts
import { galleryRequested, mountGalleryStandalone } from '@augment-it/gallery';

if (galleryRequested()) {
  // Dynamic: the fixtures have no business in the product bundle.
  void import('./gallery/catalog').then(({ default: catalog }) => {
    mountGalleryStandalone(catalog, target);
  });
} else {
  mount(App, { target });
}
```

**6 — index it** — one entry in `apps/docs-portal/src/members.ts`, plus the
remote in that app's `rsbuild.config.ts`.

## Entry kinds

- **`component`** — a real Svelte component, rendered from its own module.
- **`pattern`** — a class-based recipe with no component behind it, supplied as
  a snippet exported from a `<script module>` block. The federation-wide
  measurement found 158 button rule-sets and 34 badge treatments, none of them
  components; a gallery that listed only `.svelte` files would show none of it.

## Fixtures with an ambient dependency

`fixture.setup()` runs at frame init, before the specimen renders, and
`teardown()` on destroy. It exists for components that read a runes singleton
rather than taking props — the house convention in this codebase.

A fixture that needs `setup` is telling you the component has an ambient
dependency. That is legal, the Usage tab says so out loud, and a prop-driven
fixture is the better one wherever it is achievable.

## URLs

```
#/gallery                                     the index
#/gallery/<entry>                             an entry, first fixture
#/gallery/<entry>/<fixture>                   one fixture
#/gallery/<entry>/<fixture>?iso=1             just that fixture, no chrome
?modes=all                                    dark, light and vibrant at once
?mode=light                                   one named mode
?surface=--color-surface-raised               which surface to render over
?w=420                                        frame width
```

`iso=1` is the review link: one specimen, no chrome, on the member's own origin
— screenshottable, iframeable, openable on a phone against the LAN address, and
requiring neither the shell nor the repo.

Hash routing is **opt-in** (`mountGalleryStandalone` on, `makeGalleryMount`
off). Federated, the document hash belongs to the shell.

## The audit

Measured from the painted DOM after every render, never from
`design-manifest.json` — the same rule the swatch page follows, for the same
reason.

| Section | What it measures |
|---|---|
| Contrast | Every text node against its *composited* background |
| Target size | WCAG 2.5.8 — interactive elements under 24×24 |
| Names | Controls with no text, `aria-label`, `title`, `alt` or `placeholder` |
| Focus | Controls no `:focus-visible` rule matches |
| Federal contract | F1a Tier-1 reads · F4 bare z-index · F8 colour literals · F2/F3 unprefixed classes |
| Token provenance | Every token a matched rule reads, diffed against the catalog's declaration |

The contract checks come from the CSSOM rules that actually matched *this
specimen*. `pnpm design:drift` sweeps files and reports per member; this reports
per component, at render time, in the mode on screen.

## Not a member

The chrome is prefixed `agx-`, uses Tier-2 tokens only, and is not in the
DESIGN.md member registry. It documents the system rather than consuming it as
a product surface — the same carve-out `apps/docs-portal` has.
