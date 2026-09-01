import type { RiskData, RiskDataToPass, RiskSignal } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { RiskDataCheck } from "../../src/index.js";
import type { VerdictContext } from "../../src/index.js";
import { goldenContext } from "../context.js";

const check = new RiskDataCheck();

const SIGNED = {
  signatureValid: true,
  signerRole: "merchant" as const,
  payloadHashMatches: true,
};

function withRisk(
  signals: readonly RiskSignal[],
  attestation = SIGNED,
): VerdictContext {
  const risk_data: RiskData = { signals, attestation: "ey.risk.jws" };
  return goldenContext({
    cart: { risk_data },
    context: { riskAttestation: attestation },
  });
}

const CLEAN: RiskSignal = { type: "velocity", score: 0.1, action: "authorized" };

describe("RiskDataCheck", () => {
  it("passes when risk_data is absent — absent is fine, unsigned is not", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it("passes a signed, schema-exact, unblocked signal set", () => {
    expect(check.run(withRisk([CLEAN])).outcome).toBe("pass");
  });

  it("fails RISK_DATA_UNSIGNED when the attestation does not verify", () => {
    const verdict = check.run(
      withRisk([CLEAN], {
        signatureValid: false,
        signerRole: null,
        payloadHashMatches: false,
      }),
    );
    expect(verdict.reason_code).toBe("RISK_DATA_UNSIGNED");
  });

  it("fails RISK_DATA_UNSIGNED when the signer holds the wrong role", () => {
    const verdict = check.run(
      withRisk([CLEAN], {
        signatureValid: true,
        signerRole: "user" as never,
        payloadHashMatches: true,
      }),
    );
    expect(verdict.reason_code).toBe("RISK_DATA_UNSIGNED");
  });

  it("fails RISK_DATA_UNSIGNED when the hash covers different signals", () => {
    const verdict = check.run(
      withRisk([CLEAN], { ...SIGNED, payloadHashMatches: false }),
    );
    expect(verdict.reason_code).toBe("RISK_DATA_UNSIGNED");
  });

});

describe("RiskDataCheck — the signal schema", () => {
  it("fails RISK_DATA_OFF_SCHEMA on an unknown key", () => {
    const poisoned = { ...CLEAN, threshold_override: 1 } as unknown as RiskSignal;
    const verdict = check.run(withRisk([poisoned]));
    expect(verdict.reason_code).toBe("RISK_DATA_OFF_SCHEMA");
    const toPass = verdict.to_pass as RiskDataToPass;
    expect(toPass.offending_fields.length).toBeGreaterThan(0);
  });

  it("fails RISK_DATA_OFF_SCHEMA on a score outside [0,1]", () => {
    const verdict = check.run(withRisk([{ ...CLEAN, score: 1.5 }]));
    expect(verdict.reason_code).toBe("RISK_DATA_OFF_SCHEMA");
  });

  it("fails RISK_BLOCKED and names the blocked signal types", () => {
    const verdict = check.run(
      withRisk([CLEAN, { type: "chargeback", score: 0.9, action: "blocked" }]),
    );
    expect(verdict.reason_code).toBe("RISK_BLOCKED");
    const toPass = verdict.to_pass as RiskDataToPass;
    expect(toPass.blocked_signal_types).toEqual(["chargeback"]);
  });

  it("holds on manual_review with a zero-second cool-off marker", () => {
    const verdict = check.run(
      withRisk([{ type: "device", score: 0.5, action: "manual_review" }]),
    );
    expect(verdict.outcome).toBe("hold");
    expect(verdict.reason_code).toBe("COOLOFF_HOLD");
  });
});
