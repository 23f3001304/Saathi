import { defineConfig } from "vitest/config";

// Pure modules only (spring math, lines, sound state, copy rules): no DOM
// environment, so the suite stays fast and honest about what it proves.
export default defineConfig({
  test: {
    name: "landing",
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
