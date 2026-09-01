import { CHECK_ID_VALUES } from "../src/buyer/gateway-schemas.js";

export const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl";

export const TXN_ID = "txn_9a2c0b71-4c1e-4e4a-9f2f-0d7f9a8b6c51";

const NOW = "2026-08-31T09:14:02.113Z";

/** Eight passing seals — the §4.4 invariant for anything past stage 0. */
export function allPass(): unknown[] {
  return CHECK_ID_VALUES.map((check) => ({
    check,
    outcome: "pass",
    reason_code: null,
    human: null,
    to_pass: null,
    ms: 0.4,
  }));
}

function failing(check: string, reasonCode: string, toPass: unknown): unknown[] {
  return allPass().map((verdict) =>
    (verdict as { check: string }).check === check
      ? {
          check,
          outcome: "fail",
          reason_code: reasonCode,
          human: "That cart is over the limit you signed for.",
          to_pass: toPass,
          ms: 0.4,
        }
      : verdict,
  );
}

const base = {
  ok: true,
  txn_id: TXN_ID,
  payment_mandate_jwt: null,
  payment_mandate_draft: null,
  hold: null,
  reason_code: null,
  human: null,
  to_pass: null,
};

export const approveUnsupervised = {
  ...base,
  decision: "approve",
  verdicts: allPass(),
  payment_mandate_jwt: JWS,
};

/** Supervised approve: the mandate is issued *and* the draft is still owed. */
export const approveSupervised = {
  ...base,
  decision: "approve",
  verdicts: allPass(),
  payment_mandate_jwt: JWS,
  payment_mandate_draft: JWS,
};

export const capExceeded = {
  ...base,
  decision: "reject",
  verdicts: failing("intent_bounds", "CART_EXCEEDS_INTENT_CAP", {
    max_amount_paise: 200000,
    cart_amount_paise: 340000,
    over_by_paise: 140000,
    currency: "INR",
    remedy: "reduce_cart_or_reissue_intent",
  }),
  reason_code: "CART_EXCEEDS_INTENT_CAP",
  human: "That cart is over the limit you signed for.",
  to_pass: {
    max_amount_paise: 200000,
    cart_amount_paise: 340000,
    over_by_paise: 140000,
    currency: "INR",
    remedy: "reduce_cart_or_reissue_intent",
  },
};

export const quoteMismatch = {
  ...base,
  decision: "reject",
  verdicts: failing("quote_match", "CART_QUOTE_MISMATCH", {
    signed_quote_total_paise: 189900,
    cart_total_paise: 199900,
    delta_paise: 10000,
    quote_jti: "urn:uuid:00000000-0000-4000-8000-000000000001",
    remedy: "renegotiate",
  }),
  reason_code: "CART_QUOTE_MISMATCH",
  human: "The cart total does not match the signed quote.",
  to_pass: {
    signed_quote_total_paise: 189900,
    cart_total_paise: 199900,
    delta_paise: 10000,
    quote_jti: "urn:uuid:00000000-0000-4000-8000-000000000001",
    remedy: "renegotiate",
  },
};

/** Stage-0 rejection: zero seals, which `.length(8)` would make unreadable. */
export const stageZeroReject = {
  ...base,
  decision: "reject",
  verdicts: [],
  reason_code: "NONCE_BURNED",
  human: "That cart mandate has already been presented.",
  to_pass: {
    burned_at: NOW,
    burn_event_id: "evt_41",
    remedy: "reissue_cart_mandate_with_new_jti",
  },
};

export const cooloffHold = {
  ...base,
  decision: "hold",
  verdicts: allPass(),
  hold: {
    hold_id: "urn:uuid:00000000-0000-4000-8000-000000000009",
    until: "2026-09-01T09:14:02.113Z",
    seconds: 86400,
    cancel_url: "/v1/cooloff/urn:uuid:0000/cancel",
  },
  reason_code: "COOLOFF_HOLD",
  human: "Held for 24 hours by your cooling-off rule.",
  to_pass: { remedy: "wait_or_cancel" },
};

export const paymentExecuted = {
  ok: true,
  txn_id: TXN_ID,
  rzp_order_id: "order_R1abcdef",
  payment_link: "https://rzp.io/i/abc123",
  amount: 189900,
  currency: "INR",
  state: "link_issued",
};

export const idempotencyConflict = {
  ok: false,
  error: {
    type: "idempotency_conflict",
    reason_code: "IDEMPOTENCY_CONFLICT",
    human: "This Idempotency-Key was already used with different parameters.",
    to_pass: {
      stored_payload_hash: "a".repeat(64),
      received_payload_hash: "b".repeat(64),
      remedy: "retry_with_new_idempotency_key",
    },
    request_id: "00000000-0000-4000-8000-000000000042",
    ts: NOW,
  },
};
