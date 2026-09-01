/**
 * The reason-code catalog (§4.6). Every code is machine-actionable, belongs to
 * exactly one family, and pairs with one frozen human sentence
 * (`reason-human.ts`) and one `to_pass` shape (`to-pass.ts`) — N4 becomes a
 * type error rather than a review comment.
 */
export const REASON_FAMILIES = [
  "invalid_request",
  "idempotency_conflict",
  "processing_error",
  "service_unavailable",
  "rate_limit_exceeded",
  "auth",
  "policy",
  "memory_write",
] as const;

export type ReasonFamily = (typeof REASON_FAMILIES)[number];

/** The ACP error-envelope `type` enum (§4.3). */
export const ACP_ERROR_TYPES = [
  "invalid_request",
  "invalid_card",
  "idempotency_conflict",
  "rate_limit_exceeded",
  "processing_error",
  "service_unavailable",
] as const;

export type AcpErrorType = (typeof ACP_ERROR_TYPES)[number];

export const REASON_FAMILY = {
  IDEMPOTENCY_KEY_MISSING: "invalid_request",
  REQUEST_ID_MISSING: "invalid_request",
  API_VERSION_UNSUPPORTED: "invalid_request",
  SCHEMA_VIOLATION: "invalid_request",
  TENANT_MISSING: "invalid_request",
  MANDATE_MALFORMED: "invalid_request",

  IDEMPOTENCY_CONFLICT: "idempotency_conflict",

  LEDGER_WRITE_FAILED: "processing_error",
  LEDGER_FORK_DETECTED: "processing_error",
  RECONCILIATION_DRIFT: "processing_error",
  MEMORY_STORE_ERROR: "processing_error",

  RAZORPAY_UNAVAILABLE: "service_unavailable",
  PAYMENT_PARKED: "service_unavailable",
  GATEWAY_DRAINING: "service_unavailable",

  RATE_LIMITED: "rate_limit_exceeded",
  /** A rail quota that is used up, not busy — retrying can never help. */
  RAIL_QUOTA_EXHAUSTED: "rate_limit_exceeded",

  SIGNATURE_INVALID: "auth",
  SIGNER_UNKNOWN: "auth",
  TIMESTAMP_SKEW: "auth",
  WEBHOOK_SIGNATURE_INVALID: "auth",

  CART_EXCEEDS_INTENT_CAP: "policy",
  CURRENCY_MISMATCH: "policy",
  INTENT_EXPIRED: "policy",
  MERCHANT_NOT_ALLOWED: "policy",
  SKU_NOT_ALLOWED: "policy",
  REFUNDABILITY_REQUIRED: "policy",
  CONFIRMATION_REQUIRED: "policy",
  NONCE_BURNED: "policy",
  URI_DOWNGRADE: "policy",
  RISK_DATA_UNSIGNED: "policy",
  RISK_DATA_OFF_SCHEMA: "policy",
  RISK_BLOCKED: "policy",
  MEMORY_DIGEST_MISMATCH: "policy",
  MEMORY_TIER_VIOLATION: "policy",
  MEMORY_ENTRY_EXPIRED: "policy",
  MEMORY_TENANT_MISMATCH: "policy",
  CART_QUOTE_MISMATCH: "policy",
  QUOTE_BELOW_FLOOR: "policy",
  CART_HASH_MISMATCH: "policy",
  QUOTE_EXPIRED: "policy",
  STOCK_CONFLICT: "policy",
  ENVELOPE_EXCEEDED: "policy",
  ENVELOPE_UNDECLARED_HNP: "policy",
  COOLOFF_HOLD: "policy",
  COOLOFF_EXCEEDS_INTENT_EXPIRY: "policy",
  TXN_ALREADY_FINALIZED: "policy",
  TENANT_MISMATCH: "policy",

  TIER_CLAIM_EXCEEDS_CHANNEL: "memory_write",
  TYPE_REQUIRES_HIGHER_TIER: "memory_write",
  CONSTRAINT_RELAXATION_ATTEMPT: "memory_write",
  SCOPE_WIDENING_ATTEMPT: "memory_write",
  PROTECTED_BOOLEAN_FLIP: "memory_write",
  AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL: "memory_write",
  UNIT_MISMATCH: "memory_write",
  LLM_JUDGE_CONTRADICTION: "memory_write",
  LLM_JUDGE_UNAVAILABLE: "memory_write",
} as const satisfies Record<string, ReasonFamily>;

export type ReasonCode = keyof typeof REASON_FAMILY;

export const REASON_CODES = Object.keys(REASON_FAMILY) as readonly ReasonCode[];

/**
 * `null` = not an error envelope at all: policy rejections and memory-write
 * rejections are successful 200 responses whose body carries the verdict
 * (§4.6). `auth` has no ACP type of its own, so it reports as a malformed
 * request and is separated by its 401 status.
 */
export const ERROR_TYPE_OF: Record<ReasonFamily, AcpErrorType | null> = {
  invalid_request: "invalid_request",
  idempotency_conflict: "idempotency_conflict",
  processing_error: "processing_error",
  service_unavailable: "service_unavailable",
  rate_limit_exceeded: "rate_limit_exceeded",
  auth: "invalid_request",
  policy: null,
  memory_write: null,
};

export const HTTP_STATUS_OF: Record<ReasonFamily, number> = {
  invalid_request: 400,
  idempotency_conflict: 409,
  processing_error: 500,
  service_unavailable: 503,
  rate_limit_exceeded: 429,
  auth: 401,
  policy: 200,
  memory_write: 200,
};

export function familyOf(code: ReasonCode): ReasonFamily {
  return REASON_FAMILY[code];
}

export function errorTypeOf(code: ReasonCode): AcpErrorType | null {
  return ERROR_TYPE_OF[familyOf(code)];
}

export function httpStatusOf(code: ReasonCode): number {
  return HTTP_STATUS_OF[familyOf(code)];
}

/** A blocked attack is a successful gateway response, not an error (§4.6). */
export function isPolicyCode(code: ReasonCode): boolean {
  return familyOf(code) === "policy";
}
