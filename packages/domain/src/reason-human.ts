import type { ReasonCode } from "./reason-code.js";

/**
 * One frozen sentence per reason code (§4.6). The sentence never interpolates:
 * the specifics — amounts, ids, deadlines — travel in `to_pass`, so a caller
 * can render either and the audit trail stores both.
 */
export const REASON_HUMAN: Record<ReasonCode, string> = {
  IDEMPOTENCY_KEY_MISSING: "This request needs an Idempotency-Key header.",
  REQUEST_ID_MISSING: "This request needs a Request-Id header.",
  API_VERSION_UNSUPPORTED: "This API-Version is not one this gateway speaks.",
  SCHEMA_VIOLATION:
    "The request body has fields this endpoint does not accept.",
  TENANT_MISSING: "This request does not name a tenant.",
  MANDATE_MALFORMED: "That mandate could not be read as a signed credential.",

  IDEMPOTENCY_CONFLICT:
    "This Idempotency-Key was already used with different parameters.",

  LEDGER_WRITE_FAILED: "The ledger refused the write, so nothing was done.",
  LEDGER_FORK_DETECTED:
    "The ledger head moved unexpectedly; the chain is held.",
  RECONCILIATION_DRIFT:
    "Replaying the ledger produced a different state, so reads are degraded.",
  MEMORY_STORE_ERROR: "The memory store could not answer, so nothing was done.",

  RAZORPAY_UNAVAILABLE: "The payment rail is not answering right now.",
  PAYMENT_PARKED: "This payment is parked after repeated rail failures.",
  GATEWAY_DRAINING: "The gateway is draining and is not accepting new work.",

  RATE_LIMITED: "Too many requests; retry after a short wait.",
  RAIL_QUOTA_EXHAUSTED:
    "The payment rail's test-mode quota is used up, so no link could be issued. Retrying will not help; the quota is raised on the Razorpay account, not here.",

  SIGNATURE_INVALID: "That signature does not verify.",
  SIGNER_UNKNOWN: "That key is not in the pinned trust ring.",
  TIMESTAMP_SKEW: "That request timestamp is outside the accepted window.",
  WEBHOOK_SIGNATURE_INVALID: "That webhook signature does not verify.",

  CART_EXCEEDS_INTENT_CAP:
    "That cart costs more than the limit you signed for this intent.",
  CURRENCY_MISMATCH:
    "That cart is priced in a different currency than you signed for.",
  INTENT_EXPIRED: "The intent you signed has expired.",
  MERCHANT_NOT_ALLOWED: "That merchant is not on the list you signed for.",
  SKU_NOT_ALLOWED: "That item is not on the list you signed for.",
  REFUNDABILITY_REQUIRED:
    "You asked for refundable purchases; this cart is not.",
  CONFIRMATION_REQUIRED:
    "This purchase needs your confirmation before it can go through.",
  NONCE_BURNED: "That cart mandate has already been presented once.",
  URI_DOWNGRADE:
    "That mandate uses an extension URI this gateway does not accept.",
  RISK_DATA_UNSIGNED:
    "The risk data on that cart carries no valid attestation.",
  RISK_DATA_OFF_SCHEMA:
    "The risk data on that cart does not match the agreed schema.",
  RISK_BLOCKED: "The merchant's own risk signals blocked this payment.",
  MEMORY_DIGEST_MISMATCH:
    "The memories behind this cart are not the ones it was signed over.",
  MEMORY_TIER_VIOLATION:
    "This cart leans on a memory below the trust tier a purchase requires.",
  MEMORY_ENTRY_EXPIRED:
    "This cart leans on a belief the agent had already retired.",
  MEMORY_TENANT_MISMATCH:
    "This cart leans on a memory belonging to another tenant.",
  CART_QUOTE_MISMATCH:
    "The cart total does not match the merchant's signed quote.",
  CART_HASH_MISMATCH:
    "The cart contents do not match the hash the merchant signed.",
  QUOTE_BELOW_FLOOR:
    "That quote is below the lowest price this merchant signed for.",
  QUOTE_EXPIRED: "The merchant's signed quote has expired.",
  STOCK_CONFLICT: "Another buyer claimed the last unit first.",
  ENVELOPE_EXCEEDED: "This purchase would overrun the envelope you set for it.",
  ENVELOPE_UNDECLARED_HNP:
    "Unsupervised spending needs an envelope for every category in the cart.",
  COOLOFF_HOLD: "Your own cooling-off rule is holding this purchase.",
  COOLOFF_EXCEEDS_INTENT_EXPIRY:
    "The cooling-off hold would outlast the intent that authorises it.",
  TXN_ALREADY_FINALIZED:
    "That transaction had already settled when this arrived.",
  TENANT_MISMATCH: "That credential belongs to another tenant.",

  TIER_CLAIM_EXCEEDS_CHANNEL:
    "This write claims more provenance than its channel can grant.",
  TYPE_REQUIRES_HIGHER_TIER:
    "Writing this kind of memory needs a higher provenance tier.",
  CONSTRAINT_RELAXATION_ATTEMPT: "This write tried to widen a limit you set.",
  SCOPE_WIDENING_ATTEMPT: "This write tried to widen a list you set.",
  PROTECTED_BOOLEAN_FLIP:
    "This write tried to flip a setting only you can flip.",
  AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL:
    "This text claimed authority it cannot have on an untrusted channel.",
  UNIT_MISMATCH: "This write uses different units from the limit it touches.",
  LLM_JUDGE_CONTRADICTION: "This write contradicts a constraint you set.",
  LLM_JUDGE_UNAVAILABLE:
    "The contradiction check could not run, so the write failed closed.",
};
