import type {
  MandateEnvelope,
  PaymentMandate,
  VerdictSeal,
} from "@covenant/domain";
import { CHECK_IDS, VERDICT_OUTCOMES } from "@covenant/domain";

import {
  array,
  hashRef,
  int,
  nullableStr,
  oneOf,
  record,
  str,
  timestamp,
} from "./subject-fields.js";

export type PaymentSubject = Omit<
  PaymentMandate,
  keyof MandateEnvelope | "kind"
>;

/**
 * §6.4. `user_authorization` is `null` in the draft and on the HNP path, so it
 * is nullable here and its presence is a chain rule, not a schema rule (§6.5).
 */
export function readPaymentSubject(
  raw: Readonly<Record<string, unknown>>,
): PaymentSubject {
  return {
    id: str(raw["id"]),
    cart_mandate_jti: str(raw["cart_mandate_jti"]),
    cart_mandate_hash: hashRef(raw["cart_mandate_hash"]),
    intent_mandate_hash: hashRef(raw["intent_mandate_hash"]),
    memory_digest: hashRef(raw["memory_digest"]),
    amount: int(raw["amount"]),
    currency: str(raw["currency"]),
    merchant_id: str(raw["merchant_id"]),
    payment_token: str(raw["payment_token"]),
    agent_instance_id: str(raw["agent_instance_id"]),
    verdicts: array(raw["verdicts"]).map((entry) => readSeal(entry)),
    execute_not_before: timestamp(raw["execute_not_before"]),
    envelope_reservation_id: nullableStr(raw["envelope_reservation_id"]),
    user_authorization: nullableStr(raw["user_authorization"]),
  };
}

function readSeal(value: unknown): VerdictSeal {
  const raw = record(value);
  return {
    check: oneOf(raw["check"], CHECK_IDS),
    outcome: oneOf(raw["outcome"], VERDICT_OUTCOMES),
  };
}
