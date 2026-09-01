// The gateway answers in predicates, basis points and seconds; the screens read
// sentences. These fixtures are verbatim bodies from a running gateway-svc, so
// a wire change breaks this file rather than quietly emptying a screen.
import { describe, expect, it } from "vitest";

import { mapCovenant, type RawCovenant } from "../src/api/mapCovenant.ts";
import {
  mapFoldSummary,
  mapMerchantTrust,
  type RawFoldSummary,
} from "../src/api/mapFolds.ts";
import { formatConstraintValue } from "../src/covenant/formatConstraintValue.ts";

const COVENANT: RawCovenant = {
  constraints: [
    {
      id: "mem_1",
      predicate: "allowance",
      content: { allowance: { max_amount: 200000, currency: "INR" } },
    },
    {
      id: "mem_2",
      predicate: "max_amount",
      content: { currency: "INR", unit: "paise", value: 200000 },
    },
    {
      id: "mem_3",
      predicate: "hold_seconds",
      content: { unit: "seconds", value: 86400 },
    },
    {
      id: "mem_4",
      predicate: "max_apr_bps",
      content: { unit: "bps", value: 1800 },
    },
    { id: "mem_5", predicate: "merchant", content: { allow: ["kolam-run"] } },
    {
      id: "mem_6",
      predicate: "requires_refundability",
      content: { value: true },
    },
  ],
  envelopes: [{ category: "apparel", period: "month", cap_paise: 400000 }],
  cooloff_rules: { threshold_paise: 800000, hold_seconds: 86400 },
  merchants: ["urn:covenant:merchant:kolam-run"],
  skus: ["ST-KURTA-NAVY-M"],
};

const FOLDS: RawFoldSummary = {
  events: 63,
  memories: 19,
  mandates: 6,
  txns: 2,
  folds: [
    { name: "memory", last_seq: 63, state_hash: "" },
    { name: "merchant_trust", last_seq: 63, state_hash: "" },
  ],
  last_materialized_at: "2026-08-31T10:38:48.702Z",
};

function ruleFor(key: string): string {
  const snapshot = mapCovenant(COVENANT);
  const found = snapshot.constraints.find((c) => c.key === key);
  if (found === undefined) throw new Error(`no constraint for ${key}`);
  return formatConstraintValue(found);
}

describe("the covenant, as the Rules screen reads it", () => {
  it("drops the composite that restates a scalar it already shows", () => {
    const keys = mapCovenant(COVENANT).constraints.map((c) => c.key);
    expect(keys).not.toContain("allowance");
    expect(keys).toContain("max_amount");
  });

  it("quotes money, rates, and waits in the reader's units", () => {
    expect(ruleFor("max_amount")).toBe("₹2,000.00");
    expect(ruleFor("max_apr_bps")).toBe("18.0%");
    expect(ruleFor("hold_seconds")).toBe("24 hours");
  });

  it("answers a boolean rule as an answer", () => {
    expect(ruleFor("requires_refundability")).toBe("Yes");
  });

  it("reads an allow-list as the list it is", () => {
    expect(ruleFor("merchant")).toBe("kolam-run");
  });

  it("carries the envelope's ceiling and the cool-off rule across", () => {
    const snapshot = mapCovenant(COVENANT);
    expect(snapshot.envelopes[0]?.capPaise).toBe(400000);
    expect(snapshot.cooloffRules[0]).toEqual({
      thresholdPaise: 800000,
      durationHours: 24,
    });
  });
});

const TRUST = {
  merchant_id: "kolam-run",
  trust_score: 0.82,
  quotes_total: 10,
  quote_mismatches: 2,
  manipulation_attempts: 1,
  refunds_honored: 1,
};

describe("the folds, as the Ledger screen reads them", () => {
  it("names each fold and says how far it is folded", () => {
    const tiles = mapFoldSummary(FOLDS);
    expect(tiles[0]).toEqual({
      fold: "Memory",
      headline: "19 memories",
      detail: "current to event 63",
    });
    expect(tiles[1]?.fold).toBe("Merchant trust");
  });

  it("reports merchant trust as shares of what was actually quoted", () => {
    const [row] = mapMerchantTrust([TRUST]);
    expect(row?.honouredFraction).toBeCloseTo(0.8);
    expect(row?.mismatchFraction).toBeCloseTo(0.2);
    expect(row?.quoteMismatch).toBe("2 of 10");
    expect(row?.flagged).toBe(true);
  });

  it("does not divide by a merchant nobody has quoted yet", () => {
    const [row] = mapMerchantTrust([
      {
        ...TRUST,
        quotes_total: 0,
        quote_mismatches: 0,
        manipulation_attempts: 0,
      },
    ]);
    expect(row?.honouredFraction).toBe(0);
    expect(row?.flagged).toBe(false);
  });
});
