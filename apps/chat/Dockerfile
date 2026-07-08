# Production build for the chat federated remote (didi). Same rationale
# as shell/Dockerfile — direct pnpm --filter build instead of relying on
# Railpack's turborepo auto-detection, which overrides any custom
# buildCommand unconditionally and runs the (nonfunctional, turbo was
# never actually installed) root "build" script instead.
#
# Build context is the repo root (Railway: no rootDirectory set for this
# service, dockerfilePath: apps/chat/Dockerfile).

FROM node:22-alpine AS build
WORKDIR /monorepo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY shell ./shell
RUN pnpm install --frozen-lockfile

ARG PUBLIC_WS_URL
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
RUN pnpm --filter @augment-it/chat build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /monorepo/apps/chat/dist ./dist
EXPOSE 3006
CMD ["serve", "-s", "dist", "-l", "3006"]
