# augment-it · splash

GitHub Pages presence for [`lossless-group/augment-it`](https://github.com/lossless-group/augment-it).
A small Astro site that renders the repo's `changelog/` and `context-v/`
alongside curated copy about the six module-federated microfrontends that
make up the augment-it workshop.

Live URL: **https://lossless-group.github.io/augment-it/**

## What this is

- **Astro** (no React, no JSX) per the Astro Knots conventions.
- **Single-project variant** — augment-it is a turborepo, not a
  pseudomonorepo with submodules, so the splash reads
  `../changelog` and `../context-v` as plain file IO from the parent
  repo's working tree.
- **Pagefind** search built into every deploy. Header popover (`/` to
  focus), full `/search` page. Index built client-side at deploy time.
- **Vibrant default mode** — augment-it's job is to *enrich* data, so the
  vibrant mode (saturated magenta-violet on near-black) is the default
  posture. `dark` is operator mode; `light` is ledger mode.

## Local dev

```bash
cd splash
pnpm install --ignore-workspace
pnpm dev
```

> The `--ignore-workspace` flag matters. The parent `augment-it/`
> directory is a turborepo with its own `package.json`; the splash
> installs deps independently so the two trees don't fight.

Visit `http://localhost:4321/augment-it/` — the configured `base` matters
in dev too.

### Trying search locally

Pagefind builds its index at deploy time (during `astro build`). In
`astro dev` the search box mounts but shows a "not available in dev"
message. To exercise search locally:

```bash
pnpm build && pnpm preview
```

## Where content lives

| Path | What renders |
|---|---|
| `../changelog/*.md` | `/changelog/` list + `/changelog/<slug>/` detail |
| `../context-v/**/*.md` | `/context-v/` list (grouped by top-level subdir) + `/context-v/<slug>/` detail |
| `splash/src/content/feature-highlights/*.md` | The six microfrontend cards on `/` |
| `splash/public/` | Static assets (brand SVGs, favicon) |

Frontmatter conventions:

- `publish: false` skips an entry from the splash (defaults to publish).
- Date fields are tolerant of `"TBD"`, `"~"`, empty strings — see
  `src/lib/date.ts`.
- Schemas are lenient (`safeParse` with raw-frontmatter fallback) — see
  `src/content.config.ts`.

## Deploy

`.github/workflows/pages.yml` builds `splash/` on push to `main` and
publishes via `actions/deploy-pages@v4`. The workflow uses
`actions/configure-pages@v5` with `enablement: true` so Pages bootstraps
itself on the first run; no manual repo-settings dance required.

**One-time setup** in repo settings → Pages:

- **Source**: GitHub Actions (the workflow will set this on first run via
  `enablement: true`, but verify after the first successful deploy).

## Updating the splash

| When | What to do |
|---|---|
| Shipped a coherent chunk of work | Add an entry to `../changelog/` |
| Wrote a spec / habit / prompt / reminder | Add a file under `../context-v/<kind>/` |
| Refreshed brand assets | Drop new files into `splash/public/` |
| Curated card list drifts | Edit `splash/src/content/feature-highlights/` |

## Visual posture

The splash deliberately diverges from sibling Lossless splashes:

- **Default mode**: vibrant (memopop and lfm default light/dark)
- **Type pairing**: monospace-forward — JetBrains Mono display + Space
  Grotesk body
- **Hero composition**: module-federation manifest (2×3 grid is the hero)
- **Card chrome**: ledger-row with corner-tick framing
- **Ornament**: dot grid + radial magenta-violet mesh
- **Brand spine**: magenta + iris + violet, pulled straight from the
  augment-it wordmark gradient

See the parent monorepo's
`context-v/skills/maintain-splash-pages/SKILL.md` for the convention this
follows.

## License

MIT — same as the augment-it repo.
