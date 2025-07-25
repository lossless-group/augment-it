# Module Federation Vite Monorepo

A monorepo project using Turborepo and vite-plugin-federation to demonstrate micro-frontend architecture with React and Vite.

## Project Structure

```
module-federation-vite/
├── apps/
│   ├── host/                 # Main host application
│   ├── micro-frontend-1/     # Card A component (port 4173)
│   └── micro-frontend-2/     # Card B component (port 4174)
├── packages/
│   └── ui/                   # Shared UI components
├── package.json              # Root workspace configuration
├── turbo.json               # Turborepo pipeline configuration
└── tsconfig.json            # Root TypeScript configuration
```

## Apps

### Host App (`apps/host`)
- **Port**: 3000
- **Purpose**: Main application that consumes federated components
- **Features**: 
  - Uses React.lazy and Suspense to load remote components
  - Imports CardA and CardB from micro-frontends
  - Uses shared UI components from `@module-federation-vite/ui`

### Card A (`apps/micro-frontend-1`)
- **Port**: 4173
- **Purpose**: Exposes CardA component via module federation
- **Exposed**: `./src/components/CardA.tsx` as `cardA/Card`

### Card B (`apps/micro-frontend-2`)
- **Port**: 4174
- **Purpose**: Exposes CardB component via module federation
- **Exposed**: `./src/components/CardB.tsx` as `cardB/Card`

## Packages

### UI Package (`packages/ui`)
- **Purpose**: Shared React components
- **Components**: Button component with variants
- **Usage**: Imported by all apps in the monorepo

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm 10+

### Installation
```bash
npm install
```

### Development
```bash
# Start all apps in development mode from the root directory
npm run dev

# This command runs `turbo run dev` under the hood, which starts all apps in parallel
# You can also start individual apps if needed:
npm run dev --filter=@module-federation-vite/host
npm run dev --filter=@module-federation-vite/card-a
npm run dev --filter=@module-federation-vite/card-b
```

### Build
```bash
# Build all apps
npm run build

# Build individual apps
npm run build --filter=@module-federation-vite/host
npm run build --filter=@module-federation-vite/card-a
npm run build --filter=@module-federation-vite/card-b
```

### Linting
```bash
npm run lint
```

### Type Checking
```bash
npm run typecheck
```

## Module Federation Configuration

### Host App Configuration
The host app imports remote components from:
- `cardA`: `http://localhost:4173/assets/remoteEntry.js`
- `cardB`: `http://localhost:4174/assets/remoteEntry.js`

### Micro-frontend Configuration
Both micro-frontends:
- Expose their Card components
- Share React and React-DOM dependencies
- Use vite-plugin-federation for module federation

## Development Workflow

1. Start all development servers:
   ```bash
   npm run dev
   ```

2. Access the applications:
   - Host: http://localhost:3000
   - Card A: http://localhost:4173
   - Card B: http://localhost:4174

3. The host app will load CardA and CardB components from their respective micro-frontends

## Technologies Used

- **Turborepo**: Monorepo build system
- **Vite**: Build tool and dev server
- **React**: UI framework
- **TypeScript**: Type safety
- **vite-plugin-federation**: Module federation for Vite
- **Workspaces**: npm workspaces for package management

## Scripts

- `dev`: Start development servers
- `build`: Build all applications
- `lint`: Run linting across all packages
- `typecheck`: Run TypeScript type checking
- `clean`: Clean build artifacts 