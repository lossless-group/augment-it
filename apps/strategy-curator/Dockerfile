# Production build for the strategy-curator federated remote. Same
# rationale as shell/Dockerfile — direct pnpm --filter build instead of
# relying on Railpack's turborepo auto-detection, which overrides any
# custom buildCommand unconditionally and runs the (nonfunctional, turbo
# was never actually installed) root "build" script instead.
#
# Build context is the repo root (Railway: no rootDirectory set for this
# service, dockerfilePath: apps/strategy-curator/Dockerfile).

FROM node:22-alpine AS build
WORKDIR /monorepo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY shell ./shell
RUN pnpm install --frozen-lockfile

ARG PUBLIC_WS_URL
ARG PUBLIC_ID_BASE
ARG PUBLIC_STRATEGY_CURATOR_ASSET_PREFIX
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
ENV PUBLIC_ID_BASE=$PUBLIC_ID_BASE
ENV PUBLIC_STRATEGY_CURATOR_ASSET_PREFIX=$PUBLIC_STRATEGY_CURATOR_ASSET_PREFIX
RUN pnpm --filter @augment-it/strategy-curator build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /monorepo/apps/strategy-curator/dist ./dist
EXPOSE 3017
CMD ["serve", "-s", "dist", "-l", "3017"]
