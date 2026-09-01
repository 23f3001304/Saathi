import { defineConfig } from "vitest/config";

/**
 * DECISION: the app carries its own vitest config instead of joining the root
 * `vitest.config.ts` project list. Why: the root file is shared workspace
 * configuration this task may not edit, and `apps/audit-ui` already sets the
 * precedent that an app runs its own suite. `pnpm --filter @covenant/gateway-svc test`
 * is the command; the root gate is unchanged.
 */
export default defineConfig({
  test: {
    name: "gateway-svc",
    include: ["tests/**/*.test.ts"],
    // The smoke boots a real server, mints ES256 keys and drives HTTP.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
