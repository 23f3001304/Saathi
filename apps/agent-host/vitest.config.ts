import { defineConfig } from "vitest/config";

/**
 * Mirrors `apps/gateway-svc/vitest.config.ts`: the app carries its own config
 * because the root `vitest.config.ts` names its app projects explicitly and is
 * workspace configuration this task may not edit. `pnpm --filter
 * @covenant/agent-host test` is the command; adding `"agent-host"` to the root
 * file's `apps` array folds it into the repo gate.
 *
 * The e2e boots two real HTTP servers, mints an ES256 trust ring and drives a
 * purchase end to end, so the timeouts are generous and files run serially —
 * two suites racing for the same SQLite file would prove nothing about either.
 */
export default defineConfig({
  test: {
    name: "agent-host",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
