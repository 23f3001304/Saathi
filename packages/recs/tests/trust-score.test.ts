import { describe, expect, it } from "vitest";

import type { TrustCounters } from "../src/index.js";
import { scoreFor } from "../src/index.js";

const ZERO: TrustCounters = {
  quotesTotal: 0,
  quoteMismatches: 0,
  catalogReads: 0,
  manipulationAttempts: 0,
  refundsRequested: 0,
  refundsHonored: 0,
};

/** Hand-computed against backend-architecture.md section 3.9's formula. */
const CASES: readonly (readonly [string, Partial<TrustCounters>, number])[] = [
  ["no observations at all shrinks fully to the 0.5 prior", {}, 0.5],
  [
    "a spotless merchant with substantial volume approaches 1.0",
    { quotesTotal: 100, catalogReads: 100 },
    (200 * (0.6 + 0.25 + 0.15) + 5 * 0.5) / 205,
  ],
  [
    "every quote mismatched drags the score down, but not to zero",
    { quotesTotal: 20, quoteMismatches: 20 },
    (20 * (0.6 * 0 + 0.25 + 0.15) + 5 * 0.5) / 25,
  ],
  [
    "refund dishonour only touches the 0.15 honor weight",
    {
      quotesTotal: 10,
      refundsRequested: 4,
      refundsHonored: 0,
    },
    (10 * (0.6 + 0.25 + 0.15 * 0) + 5 * 0.5) / 15,
  ],
];

describe("scoreFor: Bayesian-shrunk trust score", () => {
  it.each(CASES)("%s", (_name, partial, expected) => {
    expect(scoreFor({ ...ZERO, ...partial })).toBeCloseTo(expected, 10);
  });

  it("never used a stock_conflicts field: STOCK_CONFLICT cannot move it", () => {
    const counters: TrustCounters = { ...ZERO, quotesTotal: 10, catalogReads: 10 };
    const before = scoreFor(counters);
    // The type itself carries no stock_conflicts input — the fold-level
    // exclusion test lives in merchant-trust-fold.test.ts; this asserts the
    // pure function's own contract has nowhere for that counter to enter.
    expect(Object.keys(counters).sort()).not.toContain("stockConflicts");
    expect(scoreFor(counters)).toBe(before);
  });

  it("is monotonically decreasing in the mismatch rate", () => {
    const low = scoreFor({ ...ZERO, quotesTotal: 50, quoteMismatches: 5 });
    const high = scoreFor({ ...ZERO, quotesTotal: 50, quoteMismatches: 25 });
    expect(high).toBeLessThan(low);
  });
});
