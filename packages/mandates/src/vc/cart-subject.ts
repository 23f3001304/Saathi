import type {
  CartMandate,
  CartQuoteRef,
  MandateEnvelope,
  RiskData,
  RiskSignal,
} from "@covenant/domain";
import {
  MEMORY_DIGEST_ALG,
  RISK_SIGNAL_ACTIONS,
  TIER_LABELS,
} from "@covenant/domain";

import {
  array,
  hashRef,
  int,
  malformed,
  nullable,
  num,
  oneOf,
  record,
  str,
  strings,
  timestamp,
} from "./subject-fields.js";
import { readPaymentRequest } from "./payment-request-reader.js";

export type CartSubject = Omit<CartMandate, keyof MandateEnvelope | "kind">;

/**
 * §6.3. `memory_digest_alg` is read as a pinned literal rather than a free
 * string: an unrecognised digest algorithm must not be able to make the
 * gateway's recomputation vacuously agree with the signed value.
 */
export function readCartSubject(
  raw: Readonly<Record<string, unknown>>,
): CartSubject {
  return {
    id: str(raw["id"]),
    intent_mandate_jti: str(raw["intent_mandate_jti"]),
    intent_mandate_hash: hashRef(raw["intent_mandate_hash"]),
    payment_request: readPaymentRequest(raw["payment_request"]),
    cart_hash: hashRef(raw["cart_hash"]),
    merchant_authorization: str(raw["merchant_authorization"]),
    memory_digest: hashRef(raw["memory_digest"]),
    memory_digest_alg: oneOf(raw["memory_digest_alg"], [
      MEMORY_DIGEST_ALG,
    ] as const),
    memory_entry_ids: strings(raw["memory_entry_ids"]),
    memory_tier_floor: oneOf(raw["memory_tier_floor"], TIER_LABELS),
    risk_data: nullable(raw["risk_data"], readRiskData),
    quote: readQuote(record(raw["quote"])),
    agent_instance_id: str(raw["agent_instance_id"]),
  };
}

function readQuote(raw: Record<string, unknown>): CartQuoteRef {
  return {
    quote_jti: str(raw["quote_jti"]),
    quote_total_paise: int(raw["quote_total_paise"]),
    quote_expiry: timestamp(raw["quote_expiry"]),
    reservation_id: str(raw["reservation_id"]),
    reservation_expires_at: timestamp(raw["reservation_expires_at"]),
  };
}

/** AM5: schema-exact. An unknown key is off-schema, not a field to ignore. */
function readRiskData(value: unknown): RiskData {
  const raw = record(value);
  return {
    signals: array(raw["signals"]).map((entry) => readSignal(entry)),
    attestation: str(raw["attestation"]),
  };
}

function readSignal(value: unknown): RiskSignal {
  const raw = record(value);
  if (Object.keys(raw).length !== 3) {
    throw malformed();
  }
  return {
    type: str(raw["type"]),
    score: num(raw["score"]),
    action: oneOf(raw["action"], RISK_SIGNAL_ACTIONS),
  };
}
