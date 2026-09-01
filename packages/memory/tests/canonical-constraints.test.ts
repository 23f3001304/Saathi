// F7 regression guard.
//
// R1, R2 and R5 key on canonical predicates (`max_amount`, `hold_seconds`,
// `merchant`, …) while `POST /covenant/sign` used to file the §6.2 credential
// keys (`allowance`, `cooloff`, `merchants`, …). Three of the five rules
// therefore had no bound to contradict and were dead against a real covenant
// — invisible for as long as the rule tests built their own constraints by
// hand. So this suite never writes a predicate itself: it derives every
// constraint from real IntentBounds through the same `canonicalConstraintsOf`
// the sign route uses, and then proves the rules actually fire.
import { describe, expect, it } from "vitest";
import {
  canonicalConstraintsOf,
  type CanonicalConstraint,
  type IntentBounds,
  type MemoryEntry,
} from "@covenant/domain";
import {
  NumericRelaxationRule,
  ScopeWideningRule,
  UnitMismatchRule,
  type ContradictionRule,
  type RuleOutcome,
} from "../src/index.js";
import { candidate, entryOf } from "./builders.js";

const BOUNDS: IntentBounds = {
  allowance: {
    reason: "one_time",
    max_amount: 200_000,
    currency: "INR",
    expires_at: "2026-09-01T10:00:00.000Z",
    merchant_id: null,
    checkout_session_id: null,
  },
  merchants: ["m_kirana"],
  skus: null,
  requires_refundability: true,
  user_cart_confirmation_required: true,
  human_present: true,
  intent_expiry: "2026-09-01T10:00:00.000Z",
  envelopes: [],
  cooloff: { threshold_paise: 500_000, hold_seconds: 3_600 },
  blackout_hours: null,
  credit_policy: { allow_credit: false, max_apr_bps: 0 },
  share_aggregates: false,
};

/** The sign route files each canonical bound as a P3 constraint memory. */
function constraintsFor(predicate: string): MemoryEntry[] {
  return canonicalConstraintsOf(BOUNDS)
    .filter((c: CanonicalConstraint) => c.predicate === predicate)
    .map((c) => entryOf({ predicate: c.predicate, content: c.content }));
}

/** Exactly how the write gate asks a rule: applies-to, then evaluate. */
function run(
  rule: ContradictionRule,
  predicate: string,
  content: Readonly<Record<string, unknown>>,
  boundOn: string,
): RuleOutcome {
  const context = {
    candidate: candidate({ predicate, subject: "user", content }),
    grantedTier: 1 as const,
    constraints: constraintsFor(boundOn),
    supersedes: [],
  };
  return rule.appliesTo(context) ? rule.evaluate(context) : { verdict: "pass" };
}

describe("canonical constraints — the rules can reach a real covenant", () => {
  it("projects the §6.2 credential keys onto predicates the rules know", () => {
    const predicates = canonicalConstraintsOf(BOUNDS).map((c) => c.predicate);
    // The three that were dead before the fix.
    expect(predicates).toContain("max_amount");
    expect(predicates).toContain("hold_seconds");
    expect(predicates).toContain("merchant");
    // And never the composite credential keys the rules cannot walk into.
    expect(predicates).not.toContain("allowance");
    expect(predicates).not.toContain("cooloff");
    expect(predicates).not.toContain("merchants");
  });
});

describe("the three rules that were dead before F7", () => {
  it("R1 rejects raising the signed cap", () => {
    const verdict = run(
      new NumericRelaxationRule(),
      "max_amount",
      { value: 5_000_000 },
      "max_amount",
    );
    expect(verdict).toMatchObject({
      verdict: "reject",
      reasonCode: "CONSTRAINT_RELAXATION_ATTEMPT",
    });
  });

  it("R1 rejects lowering the signed cool-off floor", () => {
    const verdict = run(
      new NumericRelaxationRule(),
      "hold_seconds",
      { value: 60 },
      "hold_seconds",
    );
    expect(verdict.verdict).toBe("reject");
  });

  // A candidate carrying its own allowlist is declaring a bound, not
  // violating one, so the widening attempt is a *value* the signed list omits.
});

describe("scope and unit, against the signed lists", () => {
  it("R2 rejects a merchant the signed allowlist excludes", () => {
    const verdict = run(
      new ScopeWideningRule(),
      "merchant",
      { value: "m_shady" },
      "merchant",
    );
    expect(verdict).toMatchObject({
      verdict: "reject",
      reasonCode: "SCOPE_WIDENING_ATTEMPT",
    });
  });

  it("R2 still admits a merchant the signed allowlist names", () => {
    const verdict = run(
      new ScopeWideningRule(),
      "merchant",
      { value: "m_kirana" },
      "merchant",
    );
    expect(verdict.verdict).toBe("pass");
  });

  it("R5 rejects a cap restated in a different unit", () => {
    const verdict = run(
      new UnitMismatchRule(),
      "max_amount",
      { value: 2_000, unit: "rupees" },
      "max_amount",
    );
    expect(verdict.verdict).toBe("reject");
  });
});
