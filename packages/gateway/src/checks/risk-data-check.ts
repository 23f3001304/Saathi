import type { CooloffToPass, RiskData, Verdict } from "@covenant/domain";
import {
  RISK_ATTESTATION_ROLES,
  blockedSignalTypes,
  fail,
  hasBlockedSignal,
  hasManualReview,
  hold,
  pass,
  toIsoTimestamp,
} from "@covenant/domain";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";
import { offendingFields, riskSignalsSchema } from "./risk-signal-schema.js";
import { riskToPass } from "./to-pass-builders.js";

/**
 * AM5 — `risk_data` must be schema-exact and carry a trust-ring-signed
 * attestation. Absent is fine; unsigned is not. Signed-sources-only: the
 * attestation has to verify as ES256 against a pinned kid whose role is
 * `merchant` or `gateway`, and the hash it signs has to cover exactly the
 * `signals` array presented — otherwise a merchant could sign one signal set
 * and ship another.
 */
export class RiskDataCheck implements VerdictCheck {
  readonly id = "risk_data" as const;

  run(context: VerdictContext): Verdict {
    const data = context.cart.risk_data;
    if (data === null) {
      return pass(this.id);
    }
    return (
      this.attestation(context) ??
      this.schema(data) ??
      this.blocked(data) ??
      this.review(context, data)
    );
  }

  private attestation(context: VerdictContext): Verdict | null {
    const facts = context.riskAttestation;
    const roleTrusted =
      facts.signerRole !== null &&
      RISK_ATTESTATION_ROLES.includes(facts.signerRole);
    if (facts.signatureValid && roleTrusted && facts.payloadHashMatches) {
      return null;
    }
    return fail(
      this.id,
      "RISK_DATA_UNSIGNED",
      riskToPass("obtain_signed_attestation", [], []),
    );
  }

  private schema(data: RiskData): Verdict | null {
    const parsed = riskSignalsSchema.safeParse(data.signals);
    if (parsed.success) {
      return null;
    }
    return fail(
      this.id,
      "RISK_DATA_OFF_SCHEMA",
      riskToPass("obtain_signed_attestation", offendingFields(parsed.error), []),
    );
  }

  private blocked(data: RiskData): Verdict | null {
    return hasBlockedSignal(data)
      ? fail(
          this.id,
          "RISK_BLOCKED",
          riskToPass("none", [], blockedSignalTypes(data)),
        )
      : null;
  }

  /**
   * `manual_review` passes the check and turns the verdict into a `hold` with a
   * zero-second cool-off marker, so the audit trail records that a human was
   * asked (§8.4 check 4). Reusing the hold state here is the test that the
   * third outcome is a real concept and not a cooling-off special case.
   */
  private review(context: VerdictContext, data: RiskData): Verdict {
    return hasManualReview(data)
      ? hold(this.id, "COOLOFF_HOLD", manualReviewMarker(context))
      : pass(this.id);
  }
}

function manualReviewMarker(context: VerdictContext): CooloffToPass {
  const nowIso = toIsoTimestamp(context.now);
  return {
    hold_id: context.cart.jti,
    hold_seconds: 0,
    executes_at: nowIso,
    cancel_url: `${context.cancelUrlBase}/${context.cart.jti}/cancel`,
    blackout_window: null,
    intent_expires_at: context.intent.exp,
    remedy: "wait_or_cancel",
  };
}
