# Production build for the org-workbench federated remote — the first
# surface of the "Augment from DB" flow (Stephenie's workbench). Same
# rationale as apps/chat/Dockerfile: direct pnpm --filter build, no
# Railpack auto-detection.
#
# Build context is the repo root (Railway: no rootDirectory set for this
# service, dockerfilePath: apps/org-workbench/Dockerfile).

FROM node:22-alpine AS build
WORKDIR /monorepo
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Every app tsconfig `extends: ../../tsconfig.base.json`. Without it in the
# image the build dies at `Tsconfig not found /monorepo/tsconfig.base.json` —
# which is what every frontend deploy has been doing since 2026-08-03.
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY shell ./shell
RUN pnpm install --frozen-lockfile

ARG PUBLIC_WS_URL
ARG PUBLIC_ID_BASE
ARG PUBLIC_ORG_WORKBENCH_ASSET_PREFIX
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
ENV PUBLIC_ID_BASE=$PUBLIC_ID_BASE
ENV PUBLIC_ORG_WORKBENCH_ASSET_PREFIX=$PUBLIC_ORG_WORKBENCH_ASSET_PREFIX
RUN pnpm --filter @augment-it/org-workbench build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /monorepo/apps/org-workbench/dist ./dist
EXPOSE 3014
CMD ["serve", "-s", "dist", "-l", "3014"]
