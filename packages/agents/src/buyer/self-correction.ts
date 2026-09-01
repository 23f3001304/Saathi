import type { Remedy } from "@covenant/domain";
import { REMEDIES } from "@covenant/domain";

import type { GatewayBody } from "./gateway-client.js";

export const CORRECTION_ACTIONS = [
  "reduce_cart",
  "reissue_intent",
  "reissue_cart",
  "upgrade_uri",
  "obtain_attestation",
  "recompute_digest",
  "renegotiate",
  "request_quote",
  "wait",
  "retry",
  "escalate_to_user",
] as const;

export type CorrectionAction = (typeof CORRECTION_ACTIONS)[number];

/** x402-style: the rejection says what to change, so the agent changes it. */
const ACTION_OF_REMEDY: Record<Remedy, CorrectionAction> = {
  reduce_cart_or_reissue_intent: "reduce_cart",
  reissue_intent: "reissue_intent",
  reissue_intent_with_later_expiry: "reissue_intent",
  reissue_cart_mandate_with_new_jti: "reissue_cart",
  upgrade_extension_uri: "upgrade_uri",
  obtain_signed_attestation: "obtain_attestation",
  "re-derive_digest": "recompute_digest",
  renegotiate: "renegotiate",
  request_new_quote: "request_quote",
  wait_or_reduce: "wait",
  wait_or_cancel: "wait",
  retry_with_new_idempotency_key: "retry",
  none: "escalate_to_user",
};

export interface GatewayRejection {
  readonly reasonCode: string;
  readonly human: string | null;
  readonly toPass: GatewayBody | null;
}

export interface CorrectionPlan {
  readonly action: CorrectionAction;
  readonly remedy: Remedy | null;
  readonly reasonCode: string;
  /** The paise ceiling the next attempt must respect, when one is derivable. */
  readonly targetPaise: number | null;
  readonly human: string | null;
}

function readRemedy(toPass: GatewayBody | null): Remedy | null {
  const value = toPass?.["remedy"];
  return typeof value === "string" && (REMEDIES as readonly string[]).includes(value)
    ? (value as Remedy)
    : null;
}

function readInt(toPass: GatewayBody, key: string): number | null {
  const value = toPass[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * The ceiling to aim at next. A cap rejection names it outright; a quote
 * mismatch means the merchant's signed number is the only number that will
 * ever pass, so that is the target rather than the one we asked for.
 */
function targetOf(toPass: GatewayBody | null): number | null {
  if (toPass === null) {
    return null;
  }
  return (
    readInt(toPass, "max_amount_paise") ??
    readInt(toPass, "signed_quote_total_paise") ??
    readInt(toPass, "remaining_paise")
  );
}

/**
 * Turns a rejection into the next move. Escalating to the user is the default
 * rather than the last resort: a rejection the agent cannot name a correction
 * for is one it must not silently retry around.
 */
export class SelfCorrector {
  plan(rejection: GatewayRejection): CorrectionPlan {
    const remedy = readRemedy(rejection.toPass);
    return {
      action: remedy === null ? "escalate_to_user" : ACTION_OF_REMEDY[remedy],
      remedy,
      reasonCode: rejection.reasonCode,
      targetPaise: targetOf(rejection.toPass),
      human: rejection.human,
    };
  }
}
