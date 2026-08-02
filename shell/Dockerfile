# Production build for the shell — the only one of the three frontend
# Dockerfiles that needs multi-stage (build with the full pnpm workspace
# context, serve only the static output). Root package.json's own "build"
# script (turbo run build) is dead weight — turbo was never actually an
# installed binary in this repo — so this Dockerfile builds via a direct
# pnpm --filter invocation instead of relying on Railpack's turborepo
# auto-detection, which overrides any custom buildCommand unconditionally.
#
# Build context is the repo root (Railway: no rootDirectory set for this
# service, dockerfilePath: shell/Dockerfile).

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
ARG PUBLIC_STRATEGY_CURATOR_REMOTE
ARG PUBLIC_CHAT_REMOTE
ARG PUBLIC_ORG_WORKBENCH_REMOTE
ARG PUBLIC_SEARCH_AND_ADD_REMOTE
ARG PUBLIC_SEARCH_RESULTS_REMOTE
ENV PUBLIC_WS_URL=$PUBLIC_WS_URL
ENV PUBLIC_ID_BASE=$PUBLIC_ID_BASE
ENV PUBLIC_STRATEGY_CURATOR_REMOTE=$PUBLIC_STRATEGY_CURATOR_REMOTE
ENV PUBLIC_CHAT_REMOTE=$PUBLIC_CHAT_REMOTE
ENV PUBLIC_ORG_WORKBENCH_REMOTE=$PUBLIC_ORG_WORKBENCH_REMOTE
ENV PUBLIC_SEARCH_AND_ADD_REMOTE=$PUBLIC_SEARCH_AND_ADD_REMOTE
ENV PUBLIC_SEARCH_RESULTS_REMOTE=$PUBLIC_SEARCH_RESULTS_REMOTE
RUN pnpm --filter @augment-it/shell build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=build /monorepo/shell/dist ./dist
EXPOSE 3100
CMD ["serve", "-s", "dist", "-l", "3100"]
