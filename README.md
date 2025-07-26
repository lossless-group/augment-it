# Module Federation Vite Monorepo

A monorepo project using Turborepo and vite-plugin-federation to demonstrate micro-frontend architecture with React and Vite.

## Project Structure

```
module-federation-vite/
├── apps/
│   ├── host/                 # Main host application (port 3000)
│   ├── micro-frontend-1/     # Card A component (port 4173)
│   ├── micro-frontend-2/     # Card B component (port 4174)
│   └── prompt-manager/       # Prompt Manager component (port 4175)
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
  - Imports CardA, CardB, and PromptManager from micro-frontends
  - Uses shared UI components from `@module-federation-vite/ui`
  - Runs in development mode with hot reload

### Card A (`apps/micro-frontend-1`)
- **Port**: 4173
- **Purpose**: Exposes CardA component via module federation
- **Exposed**: `./src/components/CardA.tsx` as `cardA/Card`
- **Development**: Uses `vite build --watch` + `vite preview` for development

### Card B (`apps/micro-frontend-2`)
- **Port**: 4174
- **Purpose**: Exposes CardB component via module federation
- **Exposed**: `./src/components/CardB.tsx` as `cardB/Card`
- **Development**: Uses `vite build --watch` + `vite preview` for development

### Prompt Manager (`apps/prompt-manager`)
- **Port**: 4175
- **Purpose**: Exposes PromptManagerCard component via module federation
- **Exposed**: `./src/components/PromptManagerCard.tsx` as `promptManager/PromptManagerCard`
- **Features**: Includes Tailwind CSS styling and markdown editor functionality
- **Development**: Uses `vite build --watch` + `vite preview` for development

## Packages

### UI Package (`packages/ui`)
- **Purpose**: Shared React components
- **Components**: Button component with variants
- **Usage**: Imported by all apps in the monorepo

## Development Architecture

### Development Pipeline

The project uses a hybrid development approach:

1. **Host App**: Runs in standard Vite dev mode with hot reload
2. **Micro-frontends**: Use `vite build --watch` + `vite preview` for development
   - This approach ensures the federated modules are properly built and available
   - Changes trigger rebuilds automatically via the watch mode
   - Preview server serves the built assets

### Module Federation Configuration

#### Host App Configuration
The host app imports remote components from:
- `cardA`: `http://localhost:4173/assets/remoteEntry.js`
- `cardB`: `http://localhost:4174/assets/remoteEntry.js`
- `promptManager`: `http://localhost:4175/assets/remoteEntry.js`

#### Micro-frontend Configuration
All micro-frontends:
- Expose their components via module federation
- Share React and React-DOM dependencies
- Use vite-plugin-federation for module federation
- Configure CORS headers for cross-origin requests

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

# This command runs `turbo run dev` under the hood, which starts all apps in parallel:
# - Host: vite dev (port 3000)
# - Card A: vite build --watch + vite preview (port 4173)
# - Card B: vite build --watch + vite preview (port 4174)
# - Prompt Manager: vite build --watch + vite preview (port 4175)

# You can also start individual apps if needed:
npm run dev --filter=@module-federation-vite/host
npm run dev --filter=@module-federation-vite/card-a
npm run dev --filter=@module-federation-vite/card-b
npm run dev --filter=prompt-manager-bare
```

### Build
```bash
# Build all apps
npm run build

# Build individual apps
npm run build --filter=@module-federation-vite/host
npm run build --filter=@module-federation-vite/card-a
npm run build --filter=@module-federation-vite/card-b
npm run build --filter=prompt-manager-bare
```

### Linting
```bash
npm run lint
```

### Type Checking
```bash
npm run typecheck
```

### Clean Build Artifacts
```bash
npm run clean
```

## Development Workflow

1. Start all development servers:
   ```bash
   npm run dev
   ```

2. Access the applications:
   - Host: http://localhost:3000
   - Card A: http://localhost:4173
   - Card B: http://localhost:4174
   - Prompt Manager: http://localhost:4175

3. The host app will load CardA, CardB, and PromptManager components from their respective micro-frontends

4. Development workflow:
   - **Host app**: Edit files in `apps/host/src/` - changes reflect immediately with hot reload
   - **Micro-frontends**: Edit files in respective `apps/micro-frontend-*/src/` - changes trigger rebuilds and are served via preview servers
   
   **For hot loading micro-frontends**: Open a new terminal window and run `npm run dev:watch` in the specific micro-frontend module you want to hot reload. This will enable watch mode for that specific module while keeping the preview server running.

## Technologies Used

- **Turborepo**: Monorepo build system
- **Vite**: Build tool and dev server
- **React**: UI framework
- **TypeScript**: Type safety
- **vite-plugin-federation**: Module federation for Vite
- **Tailwind CSS**: Utility-first CSS framework (used in prompt-manager)
- **Workspaces**: npm workspaces for package management

## Scripts

### Root Level Scripts
- `dev`: Start development servers for all apps
- `build`: Build all applications
- `lint`: Run linting across all packages
- `typecheck`: Run TypeScript type checking
- `clean`: Clean build artifacts

### Individual App Scripts
Each app has its own scripts:
- `dev`: Start development server (varies by app)
- `dev:watch`: Start watch mode for micro-frontends
- `build`: Build the application
- `preview`: Start preview server
- `lint`: Run linting
- `clean`: Clean build artifacts
- `typecheck`: Run TypeScript type checking

## Module Federation Notes

- The development setup uses `vite build --watch` for micro-frontends to ensure proper module federation in development
- CORS is configured on micro-frontend servers to allow cross-origin requests
- Shared dependencies (React, React-DOM) are configured to prevent duplication
- The host app uses `dev.enabled: true` in federation config for development mode 