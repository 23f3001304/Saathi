# syntax=docker/dockerfile:1
#
# Multi-stage build for the audit trail UI (ARCHITECTURE §5.5, §10.4).
# Build with: docker build -f apps/audit-ui/Dockerfile -t covenant-audit-ui .
# from the REPO ROOT (build context must be the workspace root).
#
# TODO(audit-ui): apps/audit-ui has no "build" script or Vite dependency yet (§10 stack
# table: "React + Vite, single screen"). This Dockerfile already runs the real command
# (`pnpm --filter @covenant/audit-ui build`) it will need once that lands — today
# --if-present turns it into a no-op instead of a hard CI failure, and the fallback below
# writes a placeholder page so the image still serves something in the meantime.

FROM node:24-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- fetch: populate the pnpm store from the lockfile alone. package.json comes along
# too so corepack can read "packageManager" and activate the pinned pnpm version
# non-interactively. ----
FROM base AS fetch
COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch

# ---- build: placeholder until Vite lands (see TODO above) ----
FROM fetch AS build
COPY . .
# CI=true: see apps/gateway-svc/Dockerfile — same --filter-vs-fetch pnpm purge prompt.
RUN CI=true pnpm install --frozen-lockfile --offline --filter "@covenant/audit-ui..."
# --if-present must precede "run" — after the script name, pnpm's --filter form still
# hard-errors with ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT when no selected package has it.
RUN pnpm --if-present --filter @covenant/audit-ui run build
RUN mkdir -p apps/audit-ui/dist && \
    [ -f apps/audit-ui/dist/index.html ] || \
    printf '%s' '<!doctype html><title>Covenant Audit UI</title><body>Scaffold placeholder — the Vite build lands per ARCHITECTURE.md section 10.</body>' \
      > apps/audit-ui/dist/index.html

# ---- runtime: zero-dependency static file server (see serve.mjs) ----
FROM node:24-slim AS runtime
# node:24-slim for consistency with gateway-svc's image; a distroless nodejs24 base
# would work equally well here (no native bindings, no shell needed at runtime) but
# wasn't verified pullable from this build environment, so slim is the safe default.
WORKDIR /app
COPY --from=build /repo/apps/audit-ui/dist ./dist
COPY apps/audit-ui/serve.mjs ./serve.mjs
EXPOSE 5173
CMD ["node", "serve.mjs"]
