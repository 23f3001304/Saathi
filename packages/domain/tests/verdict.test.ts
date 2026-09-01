import { describe, expect, it } from "vitest";
import {
  CHECK_IDS,
  REASON_HUMAN,
  VERDICT_OUTCOMES,
  checkOrder,
  decisionOf,
  fail,
  headlineReasonCode,
  hold,
  isCompletePipeline,
  pass,
  sealOf,
  timed,
  type CheckId,
  type Decision,
  type Verdict,
} from "../src/index.js";

const fullPipeline = (): Verdict[] => CHECK_IDS.map((check) => pass(check));

const decisionTable: readonly (readonly [string, Verdict[], Decision])[] = [
  ["all pass", fullPipeline(), "approve"],
  [
    "one hold",
    fullPipeline().map((verdict) =>
      verdict.check === "cooloff"
        ? hold("cooloff", "COOLOFF_HOLD", null)
        : verdict,
    ),
    "hold",
  ],
  [
    "one fail",
    fullPipeline().map((verdict) =>
      verdict.check === "nonce" ? fail("nonce", "NONCE_BURNED", null) : verdict,
    ),
    "reject",
  ],
  [
    "a fail outranks a hold",
    fullPipeline().map((verdict) => {
      if (verdict.check === "cooloff") {
        return hold("cooloff", "COOLOFF_HOLD", null);
      }
      return verdict.check === "envelope"
        ? fail("envelope", "ENVELOPE_EXCEEDED", null)
        : verdict;
    }),
    "reject",
  ],
];

describe("three-valued verdict", () => {
  it("declares exactly pass, hold and fail", () => {
    expect(VERDICT_OUTCOMES).toEqual(["pass", "hold", "fail"]);
  });

  it("carries no reason code on a pass", () => {
    const verdict = pass("uri_pin");
    expect(verdict.outcome).toBe("pass");
    expect(verdict.reason_code).toBeNull();
    expect(verdict.human).toBeNull();
    expect(verdict.to_pass).toBeNull();
  });

  it("treats a cool-off hold as neither approval nor rejection", () => {
    const verdict = hold("cooloff", "COOLOFF_HOLD", null);
    expect(verdict.outcome).toBe("hold");
    expect(verdict.reason_code).toBe("COOLOFF_HOLD");
    expect(decisionOf([verdict])).toBe("hold");
  });

  it("attaches the frozen human sentence to every non-pass verdict", () => {
    expect(fail("nonce", "NONCE_BURNED", null).human).toBe(
      REASON_HUMAN.NONCE_BURNED,
    );
    expect(hold("risk_data", "COOLOFF_HOLD", null).human).toBe(
      REASON_HUMAN.COOLOFF_HOLD,
    );
  });

  it("reduces to the two fields a payment mandate embeds", () => {
    expect(sealOf(fail("nonce", "NONCE_BURNED", null))).toEqual({
      check: "nonce",
      outcome: "fail",
    });
  });

  it("is timed by the engine, not by the check", () => {
    expect(timed(pass("envelope"), 0.4).ms).toBe(0.4);
  });
});

describe("pipeline vocabulary", () => {
  it("names the eight checks in §8.1 order", () => {
    expect(CHECK_IDS).toEqual([
      "intent_bounds",
      "nonce",
      "uri_pin",
      "risk_data",
      "memory_digest",
      "quote_match",
      "envelope",
      "cooloff",
    ]);
  });

  it("stamps eight seals on every path: the engine never short-circuits", () => {
    expect(isCompletePipeline(fullPipeline())).toBe(true);
    expect(isCompletePipeline(fullPipeline().slice(0, 3))).toBe(false);
  });

  it("rejects a duplicated seal as an incomplete pipeline", () => {
    const duplicated = [...fullPipeline().slice(0, 7), pass("envelope")];
    expect(isCompletePipeline(duplicated)).toBe(false);
  });
});

describe("aggregation", () => {
  it.each(decisionTable)("%s -> %s", (_name, verdicts, expected) => {
    expect(decisionOf(verdicts)).toBe(expected);
  });

  it("headlines the first failure in pipeline order, not evaluation order", () => {
    const verdicts: Verdict[] = [
      fail("envelope", "ENVELOPE_EXCEEDED", null),
      fail("intent_bounds", "CART_EXCEEDS_INTENT_CAP", null),
    ];
    expect(headlineReasonCode(verdicts)).toBe("CART_EXCEEDS_INTENT_CAP");
  });

  it("headlines the held check when nothing failed", () => {
    const verdicts = fullPipeline().map((verdict) =>
      verdict.check === "cooloff"
        ? hold("cooloff", "COOLOFF_HOLD", null)
        : verdict,
    );
    expect(headlineReasonCode(verdicts)).toBe("COOLOFF_HOLD");
  });

  it("has no headline when every check passed", () => {
    expect(headlineReasonCode(fullPipeline())).toBeNull();
  });

  it.each(CHECK_IDS)("orders %s by its pipeline position", (check: CheckId) => {
    expect(checkOrder(check)).toBe(CHECK_IDS.indexOf(check));
  });
});
