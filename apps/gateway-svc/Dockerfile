# syntax=docker/dockerfile:1
#
# Multi-stage build for the Mandate Gateway composition root (ARCHITECTURE §10.4).
# Build with: docker build -f apps/gateway-svc/Dockerfile -t covenant-gateway-svc .
# from the REPO ROOT (build context must be the workspace root so pnpm-lock.yaml and
# sibling packages are visible).

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- fetch: populate the pnpm content-addressable store from the lockfile alone, so
# this layer only invalidates when dependencies change, not on every source edit.
# package.json is copied too (not just the lockfile) so corepack can read
# "packageManager" and activate the pinned pnpm version non-interactively. ----
FROM base AS fetch
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch

# ---- build: full workspace install (offline, from the fetched store) + tsc -b, scoped
# to gateway-svc's own project-reference closure (domain/ledger/memory/mandates/gateway/razorpay) ----
FROM fetch AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm exec tsc -b apps/gateway-svc

# ---- prod-deps: same lockfile, pruned to gateway-svc + its workspace deps, prod-only.
# This is the workspace-pruning step: node_modules laid out here is what actually ships. ----
FROM fetch AS prod-deps
COPY . .
# CI=true: pnpm fetch already populated node_modules/.pnpm for the whole workspace;
# narrowing to --filter here makes pnpm want to prune it, which needs a TTY to confirm
# unless CI=true is set (https://pnpm.io/errors#pnpm_err_aborted_remove_modules_dir_no_tty).
RUN CI=true pnpm install --frozen-lockfile --offline --prod --filter "@covenant/gateway-svc..."

# ---- runtime: no build toolchain ----
FROM node:24-slim AS runtime
# node:24-slim, not distroless: packages/ledger (§6) will bring in better-sqlite3's
# native binding, and the healthcheck below needs curl — distroless ships neither a
# shell nor curl, so slim is the pragmatic choice named in the task brief.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production

# Workspace directory layout is preserved so the pnpm-symlinked "@covenant/*" package
# imports still resolve at runtime, exactly as they do in dev.
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/domain ./packages/domain
COPY --from=prod-deps /repo/packages/ledger ./packages/ledger
COPY --from=prod-deps /repo/packages/memory ./packages/memory
COPY --from=prod-deps /repo/packages/mandates ./packages/mandates
COPY --from=prod-deps /repo/packages/gateway ./packages/gateway
COPY --from=prod-deps /repo/packages/razorpay ./packages/razorpay
COPY --from=prod-deps /repo/apps/gateway-svc/package.json ./apps/gateway-svc/package.json
COPY --from=prod-deps /repo/apps/gateway-svc/node_modules ./apps/gateway-svc/node_modules

# Compiled output layered on top of the pruned source tree. packages/*/package.json
# "exports" resolves the "default" condition to ./dist/src/index.js, so plain `node`
# picks up compiled JS here rather than the "types" condition's TS source.
COPY --from=build /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build /repo/packages/ledger/dist ./packages/ledger/dist
COPY --from=build /repo/packages/memory/dist ./packages/memory/dist
COPY --from=build /repo/packages/mandates/dist ./packages/mandates/dist
COPY --from=build /repo/packages/gateway/dist ./packages/gateway/dist
COPY --from=build /repo/packages/razorpay/dist ./packages/razorpay/dist
COPY --from=build /repo/apps/gateway-svc/dist ./apps/gateway-svc/dist

WORKDIR /repo/apps/gateway-svc
EXPOSE 8787
# §10.4 /healthz lands with the composition root; curl above is already wired for it.
CMD ["node", "dist/src/index.js"]
