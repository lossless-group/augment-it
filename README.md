![Augment-It Working Banner Image](https://i.imgur.com/JFdSlQt.png)
***

# Augment It

A web app with tooling to augment data with AI.

# Tech Stack

### Build

- [x] Docker
- [x] Turbo
- [x] RS Build
    - [x] Module Federation
- [x] TypeScript

## UI

- [x] React
- [x] Next.js

### AI

- [x] Perplexity


### Module Federation

- [x] Apps
- [x] Packages
- [x] Shell

# App structure
```zsh
/augment-it/
├── apps/                    # Microfrontend applications
│   ├── record-collector/
│   ├── prompt-manager/
│   ├── request-reviewer/
│   ├── response-reviewer/
│   ├── highlight-collector/
│   └── insight-manager/
├── packages/                # Shared code
│   ├── shared/             # Shared utilities and types
│   ├── ui/                 # Shared UI components
│   └── config/             # Shared configurations
├── shell/                  # Main shell application
│   ├── src/
│   ├── rsbuild.config.mjs
│   └── package.json
├── package.json            # Root package.json
└── rsbuild.config.mjs      # Root RS Build config
```

# Rsbuild project details

## Setup

Install the dependencies:

```bash
pnpm install
```

## Get started

Start the dev server, and the app will be available at [http://localhost:3000](http://localhost:3000).

```bash
pnpm dev
```

Build the app for production:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

## Learn more

To learn more about Rsbuild, check out the following resources:

- [Rsbuild documentation](https://rsbuild.rs) - explore Rsbuild features and APIs.
- [Rsbuild GitHub repository](https://github.com/web-infra-dev/rsbuild) - your feedback and contributions are welcome!


