/** §12 dependency structure: ports & adapters, dependencies point inward only. */

// The full allowlist. A package may import only from the packages listed here.
const allowedPackageDeps = {
  domain: [],
  ledger: ["domain"],
  memory: ["domain", "ledger"],
  mandates: ["domain", "ledger"],
  gateway: ["domain", "ledger", "mandates", "memory"],
  razorpay: ["domain"],
  agents: ["domain", "memory", "mandates"],
  recs: ["domain", "ledger", "memory"],
  "browser-drive": ["domain"],
};

const packageBoundaryRules = Object.entries(allowedPackageDeps).map(
  ([pkg, deps]) => ({
    name: `${pkg}-imports-only-allowed`,
    comment: `packages/${pkg} may import only: ${deps.length > 0 ? deps.join(", ") : "(nothing)"}`,
    severity: "error",
    from: { path: `^packages/${pkg}/` },
    to: { path: `^packages/(?!(${[pkg, ...deps].join("|")})/)` },
  }),
);

module.exports = {
  forbidden: [
    {
      name: "agents-never-import-razorpay",
      comment:
        "F2: the agent holds no payment rail. Money egress is the gateway HTTP client only.",
      severity: "error",
      from: { path: "^packages/agents/" },
      to: { path: "^packages/razorpay/" },
    },
    {
      name: "recs-never-imports-gateway-or-mandates",
      comment:
        "The flywheel reads the ledger; a recommendation must not be able to influence a verdict.",
      severity: "error",
      from: { path: "^packages/recs/" },
      to: { path: "^packages/(gateway|mandates)/" },
    },
    {
      name: "no-circular",
      comment:
        "Cycles break the inward-only dependency rule and deterministic build order.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-not-to-apps-or-tools",
      comment:
        "Composition roots (apps/) and the attack harness (tools/) are leaves, never imports.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^(apps|tools)/" },
    },
    {
      name: "no-unresolvable",
      comment:
        "An import the resolver cannot follow escapes every boundary rule below.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "attacks-are-black-box",
      comment:
        "An attack harness that imports internals proves nothing — HTTP only (§12).",
      severity: "error",
      from: { path: "^tools/attacks/" },
      to: { path: "^(packages|apps)/" },
    },
    ...packageBoundaryRules,
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "types", "default"],
      mainFields: ["main", "types"],
      extensions: [".ts", ".js", ".mjs", ".cjs", ".json"],
    },
  },
};
