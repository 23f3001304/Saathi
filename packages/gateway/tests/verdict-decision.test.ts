import type { CheckId, TimedVerdict, VerdictOutcome } from "@covenant/domain";
import { CHECK_IDS, fail, hold, pass, timed } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { VerdictDecision, VerdictEngine } from "../src/index.js";
import type { VerdictCheck } from "../src/index.js";
import { goldenContext } from "./context.js";
import { NoopTracer } from "./fakes.js";

const decision = new VerdictDecision();

function verdicts(
  overrides: Partial<Record<CheckId, VerdictOutcome>>,
): readonly TimedVerdict[] {
  return CHECK_IDS.map((check) => {
    const outcome = overrides[check] ?? "pass";
    if (outcome === "fail") {
      return timed(fail(check, "SCHEMA_VIOLATION", null), 0);
    }
    return timed(
      outcome === "hold" ? hold(check, "COOLOFF_HOLD", null) : pass(check),
      0,
    );
  });
}

class StaticCheck implements VerdictCheck {
  constructor(readonly id: CheckId) {}

  run(): ReturnType<typeof pass> {
    return pass(this.id);
  }
}

describe("VerdictDecision", () => {
  it("approves when every seal passes", () => {
    const result = decision.of(verdicts({}));
    expect(result.decision).toBe("approve");
    expect(result.reasonCode).toBeNull();
    expect(result.complete).toBe(true);
  });

  it("holds when nothing failed but something held", () => {
    expect(decision.of(verdicts({ cooloff: "hold" })).decision).toBe("hold");
  });

  it("rejects when anything failed, even alongside a hold", () => {
    const result = decision.of(verdicts({ cooloff: "hold", envelope: "fail" }));
    expect(result.decision).toBe("reject");
  });

  it("takes the headline from pipeline order, not evaluation order", () => {
    const shuffled = [...verdicts({ envelope: "fail", nonce: "fail" })].reverse();
    const result = decision.of(shuffled);
    // `nonce` is check 2 and `envelope` is check 7, so bounds-first order wins.
    expect(result.reasonCode).toBe("SCHEMA_VIOLATION");
    const headline = shuffled.find((v) => v.check === "nonce");
    expect(result.human).toBe(headline?.human);
  });

  it("reports an incomplete pipeline rather than pretending eight seals", () => {
    const partial = verdicts({}).slice(0, 3);
    expect(decision.of(partial).complete).toBe(false);
  });

  it("carries one seal per check into the Payment Mandate", () => {
    const result = decision.of(verdicts({ uri_pin: "fail" }));
    expect(result.seals).toHaveLength(8);
    expect(result.seals.find((s) => s.check === "uri_pin")?.outcome).toBe(
      "fail",
    );
  });
});

describe("VerdictEngine", () => {
  it("runs every registered check and never short-circuits", () => {
    const engine = new VerdictEngine(
      CHECK_IDS.map((id) => new StaticCheck(id)),
      new NoopTracer(),
    );
    const run = engine.run(goldenContext());
    expect(run.map((verdict) => verdict.check)).toEqual([...CHECK_IDS]);
    expect(run.every((verdict) => verdict.ms >= 0)).toBe(true);
  });
});
