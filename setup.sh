#!/bin/bash
set -e

# Exit if not in the project root
if [ ! -f "package.json" ]; then
  echo "Please run this script from the project root directory"
  exit 1
fi

# Create directory structure
mkdir -p shell
mkdir -p apps/record-collector
mkdir -p apps/prompt-manager
mkdir -p apps/request-reviewer
mkdir -p apps/response-reviewer
mkdir -p apps/highlight-collector
mkdir -p apps/insight-manager

mkdir -p packages/shared
mkdir -p packages/ui
mkdir -p packages/ui/components
mkdir -p packages/config

# Create base package.json for workspaces
: '
cat > package.json << 'EOL'
{
  "name": "augment-it",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*",
    "shell/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "start": "turbo run start",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\""
  },
  "devDependencies": {
    "turbo": "latest",
    "prettier": "latest"
  },
  "packageManager": "pnpm@8.6.0"
}
EOL
'

# Create turbo.json for task management
cat > turbo.json << 'EOL'
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "lint": {},
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
EOL
