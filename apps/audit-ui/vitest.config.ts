import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Package-local Vitest config (frontend-screens.md is silent on this; the
// root vitest.config.ts only projects packages/*, so audit-ui runs its own
// suite via `pnpm --filter @covenant/audit-ui test`, same pattern the app
// already uses for its own build/dev scripts).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    css: true,
    // Node keeps `EventSource` behind `--experimental-eventsource`, which the
    // repo gate does not pass, so the live suites exercise the polling half of
    // both transports. The SSE half is covered by asserting the servers' wire
    // framing directly (tests/live-sse-wire.test.ts) rather than by shipping a
    // polyfill and then testing the polyfill.
    // Two suites racing for the same ephemeral ports and temp SQLite files
    // would prove nothing about either.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
