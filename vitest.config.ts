import { defineConfig } from "vitest/config";

const workspacePackages = [
  "domain",
  "ledger",
  "memory",
  "mandates",
  "gateway",
  "razorpay",
  "agents",
  "recs",
  "browser-drive",
];

const apps = ["gateway-svc", "audit-ui", "merchant-ui", "agent-host"];

export default defineConfig({
  test: {
    projects: [
      ...workspacePackages.map((name) => ({
        test: {
          name,
          root: `./packages/${name}`,
          include: ["tests/**/*.test.ts"],
          // Scaffolded packages have no tests yet; a missing suite must not fail the gate.
          passWithNoTests: true,
        },
      })),
      // Apps carry their own vitest.config.ts (jsdom setup, app-local settings).
      ...apps.map((name) => `./apps/${name}/vitest.config.ts`),
      "./tools/attacks/vitest.config.ts",
    ],
  },
});
