# syntax=docker/dockerfile:1
#
# Multi-stage build for the agent host — the process that actually RUNS the buyer
# and merchant agents against a live gateway (ARCHITECTURE §2.7, §10.4).
# Build with: docker build -f apps/agent-host/Dockerfile -t covenant-agent-host .
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
# to agent-host's own project-reference closure (domain/ledger/memory/mandates/agents) ----
FROM fetch AS build
COPY . .
RUN pnpm install --frozen-lockfile --offline
RUN pnpm exec tsc -b apps/agent-host

# ---- prod-deps: same lockfile, pruned to agent-host + its workspace deps, prod-only.
# This is the workspace-pruning step: node_modules laid out here is what actually ships. ----
FROM fetch AS prod-deps
COPY . .
# CI=true: pnpm fetch already populated node_modules/.pnpm for the whole workspace;
# narrowing to --filter here makes pnpm want to prune it, which needs a TTY to confirm
# unless CI=true is set (https://pnpm.io/errors#pnpm_err_aborted_remove_modules_dir_no_tty).
RUN CI=true pnpm install --frozen-lockfile --offline --prod --filter "@covenant/agent-host..."

# ---- runtime: no build toolchain ----
FROM node:24-slim AS runtime
# node:24-slim, not distroless: packages/memory pulls better-sqlite3's native binding
# through packages/ledger, and the healthcheck below needs curl — distroless ships
# neither a shell nor curl, so slim is the pragmatic choice, same as gateway-svc.
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
COPY --from=prod-deps /repo/packages/agents ./packages/agents
COPY --from=prod-deps /repo/apps/agent-host/package.json ./apps/agent-host/package.json
COPY --from=prod-deps /repo/apps/agent-host/node_modules ./apps/agent-host/node_modules

# Compiled output layered on top of the pruned source tree. packages/*/package.json
# "exports" resolves the "default" condition to ./dist/src/index.js, so plain `node`
# picks up compiled JS here rather than the "types" condition's TS source.
COPY --from=build /repo/packages/domain/dist ./packages/domain/dist
COPY --from=build /repo/packages/ledger/dist ./packages/ledger/dist
COPY --from=build /repo/packages/memory/dist ./packages/memory/dist
COPY --from=build /repo/packages/mandates/dist ./packages/mandates/dist
COPY --from=build /repo/packages/agents/dist ./packages/agents/dist
COPY --from=build /repo/apps/agent-host/dist ./apps/agent-host/dist

WORKDIR /repo/apps/agent-host
EXPOSE 8788
# The trust ring is read, never minted (see src/wiring/key-wiring.ts), so this
# container shares gateway-svc's key volume and starts after it.
ENV COVENANT_GATEWAY_URL=http://gateway-svc:8787
# No ANTHROPIC_API_KEY: the default `scripted` mode runs the whole demo with zero
# credentials. Set COVENANT_AGENT_MODE=live plus a key to hand the wheel to Claude.
CMD ["node", "dist/src/index.js"]
