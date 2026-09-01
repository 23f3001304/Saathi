import { describe, expect, it } from "vitest";
import { deriveSealStates, SEAL_ORDER } from "../src/ledger/selectors.ts";
import type { CooloffPayload, VerdictCheckResult } from "../src/ledger/types.ts";

const PASSING_CHECKS: VerdictCheckResult[] = SEAL_ORDER.map((check) => ({ check, passed: true }));

const OPEN_HOLD: CooloffPayload = {
  id: "cooloff-1",
  txn_id: "txn-1",
  amount_paise: 299_900,
  release_at: "2026-09-01T00:00:00.000Z",
  merchant: "sundar-textiles",
  cues: [],
};

describe("deriveSealStates", () => {
  it("renders all eight seals pending before any verdict arrives", () => {
    const seals = deriveSealStates([]);
    expect(seals).toHaveLength(8);
    expect(seals.every((s) => s.state === "pending")).toBe(true);
    expect(seals.map((s) => s.check)).toEqual(SEAL_ORDER);
  });

  it("stamps a passed check", () => {
    const seals = deriveSealStates(PASSING_CHECKS);
    expect(seals.every((s) => s.state === "passed")).toBe(true);
  });

  it("carries the reason code and to_pass object through a failed check", () => {
    const checks: VerdictCheckResult[] = [
      { check: "nonce", passed: false, reason_code: "NONCE_BURNED", to_pass: { required: "a fresh jti" } },
    ];
    const seals = deriveSealStates(checks);
    const nonce = seals.find((s) => s.check === "nonce");
    expect(nonce?.state).toBe("failed");
    expect(nonce?.reasonCode).toBe("NONCE_BURNED");
    expect(nonce?.toPass).toEqual({ required: "a fresh jti" });
  });

  it("D7 — a passed cooloff check with an open hold renders as 'held', not 'passed'", () => {
    const checks: VerdictCheckResult[] = [{ check: "cooloff", passed: true, human_sentence: "held for 24h" }];
    const seals = deriveSealStates(checks, OPEN_HOLD);
    const held = seals.find((s) => s.check === "cooloff");
    expect(held?.state).toBe("held");
    expect(held?.heldUntil).toBe(OPEN_HOLD.release_at);
  });

  it("a passed cooloff check with no open hold still renders as passed", () => {
    const checks: VerdictCheckResult[] = [{ check: "cooloff", passed: true }];
    const seals = deriveSealStates(checks, undefined);
    expect(seals.find((s) => s.check === "cooloff")?.state).toBe("passed");
  });
});
