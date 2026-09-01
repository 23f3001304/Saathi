import { defineConfig } from "vitest/config";

/**
 * Mirrors `apps/gateway-svc/vitest.config.ts`. The suite spawns a real
 * gateway process on an ephemeral port and drives it over HTTP, so the
 * timeouts are generous and files never run in parallel — two harnesses
 * bootstrapping trust rings into the same temp root would race.
 */
export default defineConfig({
  test: {
    name: "attacks",
    include: ["tests/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
});
