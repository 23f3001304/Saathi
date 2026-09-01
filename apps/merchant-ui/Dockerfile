# syntax=docker/dockerfile:1
#
# Multi-stage build for the merchant dashboard.
# Build with: docker build -f apps/merchant-ui/Dockerfile -t covenant-merchant-ui .
# from the REPO ROOT (build context must be the workspace root).
#
# The shopkeeper's app. It reads gateway-svc over HTTP exactly as audit-ui does
# and holds no database of its own, so the image is a static bundle and a server.

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- fetch: populate the pnpm store from the lockfile alone. package.json comes along
# too so corepack can read "packageManager" and activate the pinned pnpm version
# non-interactively. ----
FROM base AS fetch
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch

# ---- build: the Vite bundle ----
FROM fetch AS build
COPY . .
# CI=true: see apps/gateway-svc/Dockerfile for the same --filter-vs-fetch pnpm prompt.
RUN CI=true pnpm install --frozen-lockfile --offline --filter "@covenant/merchant-ui..."
RUN pnpm --filter @covenant/merchant-ui run build

# ---- runtime: zero-dependency static file server (see serve.mjs) ----
FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=build /repo/apps/merchant-ui/dist ./dist
COPY apps/merchant-ui/serve.mjs ./serve.mjs
EXPOSE 5174
CMD ["node", "serve.mjs"]
