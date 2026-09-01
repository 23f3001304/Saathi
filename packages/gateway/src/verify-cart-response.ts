import type { CooloffToPass, TimedVerdict, ToPass } from "@covenant/domain";

import type { DecisionResult } from "./verdict-decision.js";
import type { HoldBlock, VerifyCartResponse } from "./schemas/money-routes.js";

export interface IssuedPaymentMandate {
  readonly jwt: string;
  readonly jti: string;
  readonly jwtHash: string;
  /** True when §6.5's second phase (a user signature) is still outstanding. */
  readonly awaitingUserAuthorization: boolean;
}

export interface ResponseInput {
  readonly txnId: string;
  readonly verdicts: readonly TimedVerdict[];
  readonly result: DecisionResult;
  readonly mandate: IssuedPaymentMandate | null;
  readonly holdUntil: string | null;
}

/**
 * DECISION: on `approve` with `user_cart_confirmation_required`, both
 * `payment_mandate_jwt` and `payment_mandate_draft` carry the same JWS. §4.4
 * says the first is present iff approved and the second iff a
 * `user_authorization` is still required, and both are true at once on the
 * supervised path — the issuer mints one credential, and the second field is
 * the flag that says "this one still needs a user signature" (§6.5).
 */
export function verifyCartBodyOf(input: ResponseInput): VerifyCartResponse {
  const approved = input.result.decision === "approve";
  const mandate = input.mandate;
  const awaiting = mandate?.awaitingUserAuthorization === true;
  return {
    ok: true,
    decision: input.result.decision,
    verdicts: input.verdicts.map(wireVerdictOf),
    txn_id: input.txnId,
    payment_mandate_jwt: approved && mandate !== null ? mandate.jwt : null,
    payment_mandate_draft: awaiting && mandate !== null ? mandate.jwt : null,
    hold: holdBlockOf(input),
    reason_code: input.result.reasonCode,
    human: input.result.human,
    to_pass: toRecord(input.result.toPass),
  };
}

/** A blocked cart is a **successful** gateway response, so this is still 200. */
export function wireVerdictOf(
  verdict: TimedVerdict,
): VerifyCartResponse["verdicts"][number] {
  return {
    check: verdict.check,
    outcome: verdict.outcome,
    reason_code: verdict.reason_code,
    human: verdict.human,
    to_pass: toRecord(verdict.to_pass),
    ms: verdict.ms,
  };
}

function holdBlockOf(input: ResponseInput): HoldBlock | null {
  const until = input.holdUntil;
  if (input.result.decision !== "hold" || until === null) {
    return null;
  }
  const toPass = input.result.toPass as CooloffToPass | null;
  return {
    hold_id: toPass === null ? input.txnId : toPass.hold_id,
    until,
    seconds: Math.max(1, toPass === null ? 1 : toPass.hold_seconds),
    cancel_url: toPass === null ? "" : toPass.cancel_url,
  };
}

function toRecord(toPass: ToPass | null): Record<string, unknown> | null {
  return toPass === null ? null : { ...toPass };
}
