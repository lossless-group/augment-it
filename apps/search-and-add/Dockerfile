# Production build for the search-and-add federated remote — the "Augment
# from DB" flow's search surface (pairs with org-workbench). Same rationale
# as apps/chat/Dockerfile: direct pnpm --filter build, no Railpack.
#
# Build context is the repo root (Railway: no rootDirectory set for this
# service, dockerfilePath: apps/search-and-add/Dockerfile).

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
ARG PUBLIC_SEARCH_AND_ADD_ASSET_PREFIX
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
ENV PUBLIC_ID_BASE=$PUBLIC_ID_BASE
ENV PUBLIC_SEARCH_AND_ADD_ASSET_PREFIX=$PUBLIC_SEARCH_AND_ADD_ASSET_PREFIX
RUN pnpm --filter @augment-it/search-and-add build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /monorepo/apps/search-and-add/dist ./dist
EXPOSE 3016
CMD ["serve", "-s", "dist", "-l", "3016"]
