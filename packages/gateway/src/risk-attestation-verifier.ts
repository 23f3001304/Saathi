import type { MandateVerifier, RiskData } from "@covenant/domain";
import {
  GATEWAY_AUDIENCE,
  roleOfKid,
  sha256RefOf,
} from "@covenant/domain";
import { readProtectedHeader } from "@covenant/mandates";

import type { RiskAttestationFacts } from "./verdict-context.js";
import { NO_RISK_ATTESTATION } from "./verdict-context.js";

/**
 * DECISION: the claim carrying the attested hash is `signals_hash`, a
 * `sha256:` reference over `canonicalize(risk_data.signals)`. §8.4 check 4
 * specifies the value but not the claim name; naming it here (once) is better
 * than each side guessing, and the `sha256:` prefix matches every other hash
 * reference that crosses a signature boundary (§6.1).
 */
export const RISK_SIGNALS_HASH_CLAIM = "signals_hash";

/**
 * Resolves `risk_data.attestation` into facts **before** the write transaction.
 * Verification is asynchronous (key resolution, ES256) and there is no `await`
 * inside a transaction (§5.3); it is also I/O-shaped, and deviation D1 keeps
 * every port out of the checks. `RiskDataCheck` then reads a frozen answer.
 */
export class RiskAttestationVerifier {
  constructor(private readonly verifier: MandateVerifier) {}

  async factsFor(data: RiskData | null): Promise<RiskAttestationFacts> {
    if (data === null) {
      return NO_RISK_ATTESTATION;
    }
    const role = this.roleClaimed(data.attestation);
    if (role === null) {
      return NO_RISK_ATTESTATION;
    }
    try {
      const verified = await this.verifier.verify(data.attestation, {
        role,
        audience: GATEWAY_AUDIENCE,
        issuer: null,
      });
      const claim = (verified.claims as Record<string, unknown>)[
        RISK_SIGNALS_HASH_CLAIM
      ];
      return {
        signatureValid: true,
        signerRole: verified.role,
        payloadHashMatches: claim === sha256RefOf(data.signals),
      };
    } catch {
      // A failed verification is an answer, not an exception: the check turns it
      // into RISK_DATA_UNSIGNED and the other seven checks still run.
      return NO_RISK_ATTESTATION;
    }
  }

  /**
   * The role is read from the kid so the expectation can be role-bound; the
   * signature then decides, and `RiskDataCheck` re-tests the role against the
   * allowlist. Reading it here selects a candidate key, nothing more.
   */
  private roleClaimed(attestation: string): "merchant" | "gateway" | null {
    try {
      const role = roleOfKid(readProtectedHeader(attestation).kid);
      return role === "merchant" || role === "gateway" ? role : null;
    } catch {
      return null;
    }
  }
}
