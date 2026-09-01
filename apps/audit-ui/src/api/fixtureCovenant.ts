// The signed covenant the fixture Bench reads: constraints, envelopes and
// cool-off rules as one snapshot. Its own module so the fixture API surface
// stays inside the file-length budget.
// Canned REST snapshots for `dev:fixtures` / `?seed=demo` — the §2.2/§2.3
// mockup numbers, kept internally consistent with the ledger fixtures.
import type { CovenantSnapshot } from "./types.ts";

const CONSTRAINTS: CovenantSnapshot["constraints"] = [
  {
    key: "max_amount",
    label: "Never above",
    value: 200_000,
    unit: "paise",
    signedAt: "14:02",
    amended: false,
  },
  {
    key: "curfew",
    label: "No purchases after",
    value: "23:00",
    unit: "time",
    signedAt: "14:02",
    amended: false,
  },
  {
    key: "cooloff_threshold",
    label: "Cool-off above",
    value: 500_000,
    unit: "paise",
    amended: false,
  },
  {
    key: "max_apr",
    label: "No credit above APR",
    value: 18.0,
    unit: "percent",
    signedAt: "14:02",
    amended: false,
  },
  {
    key: "refundable",
    label: "Refundability required",
    value: true,
    unit: "boolean",
    signedAt: "14:02",
    amended: false,
  },
  {
    key: "share_aggregates",
    label: "Share anonymised aggregates",
    value: false,
    unit: "boolean",
    signedAt: "14:02",
    amended: false,
  },
];

const ENVELOPES: CovenantSnapshot["envelopes"] = [
  {
    category: "groceries",
    capturedPaise: 340_000,
    committedPaise: 0,
    capPaise: 500_000,
  },
  {
    category: "apparel",
    capturedPaise: 129_900,
    committedPaise: 299_900,
    capPaise: 500_000,
  },
  {
    category: "electronics",
    capturedPaise: 0,
    committedPaise: 0,
    capPaise: 800_000,
  },
];

export function covenantSnapshot(): CovenantSnapshot {
  return {
    constraints: CONSTRAINTS,
    envelopes: ENVELOPES,
    cooloffRules: [{ thresholdPaise: 500_000, durationHours: 24 }],
    merchants: ["acme-grocers", "sundar-textiles", "nilgiri-foods"],
    skus: [],
  };
}
