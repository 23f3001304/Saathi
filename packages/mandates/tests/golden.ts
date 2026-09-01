import { AP2_EXTENSION_URI, W3C_CREDENTIALS_CONTEXT } from "@covenant/domain";

import {
  AGENT_URN,
  BOUNDS,
  MEMORY_DIGEST,
  MERCHANT_URN,
  PAYMENT_REQUEST,
  QUOTE,
  TENANT,
  USER_URN,
} from "./fixtures.js";
import { ALL_PASS } from "./issue-helpers.js";

/** The `SequenceIdGenerator` nth value, so a golden `jti` is a literal. */
export function seqUuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-${hex}`;
}

export const CONTEXTS = [W3C_CREDENTIALS_CONTEXT, AP2_EXTENSION_URI];

/** §6.2 credential subject, field for field. */
export const GOLDEN_INTENT_SUBJECT = {
  id: USER_URN,
  tenant_id: TENANT,
  ap2_extension_uri: AP2_EXTENSION_URI,
  natural_language_description:
    "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
  allowance: BOUNDS.allowance,
  merchants: [MERCHANT_URN],
  skus: null,
  requires_refundability: true,
  user_cart_confirmation_required: true,
  human_present: true,
  intent_expiry: "2026-09-01T12:00:00.000Z",
  envelopes: [{ category: "footwear", period: "month", cap_paise: 500000 }],
  cooloff: { threshold_paise: 500000, hold_seconds: 86400 },
  blackout_hours: { tz: "Asia/Kolkata", from: "23:00", to: "06:00" },
  credit_policy: { allow_credit: false, max_apr_bps: 0 },
  share_aggregates: false,
  agent_instance_id: AGENT_URN,
};

/** §6.3 credential subject; `merchant_authorization` is key-dependent. */
export function goldenCartSubject(
  intentHash: string,
  merchantAuthorization: string,
  cartHash: string,
): Record<string, unknown> {
  return {
    id: "urn:covenant:cart:5e88",
    tenant_id: TENANT,
    ap2_extension_uri: AP2_EXTENSION_URI,
    intent_mandate_jti: seqUuid(0),
    intent_mandate_hash: intentHash,
    payment_request: PAYMENT_REQUEST,
    cart_hash: cartHash,
    merchant_authorization: merchantAuthorization,
    memory_digest: MEMORY_DIGEST,
    memory_digest_alg: "covenant-md-1",
    memory_entry_ids: ["mem_0a1", "mem_9f2", "mem_3c7"],
    memory_tier_floor: "P1",
    risk_data: null,
    quote: QUOTE,
    agent_instance_id: AGENT_URN,
  };
}

/** §6.4 credential subject; `user_authorization` is null in the draft. */
export function goldenPaymentSubject(
  cartHash: string,
  intentHash: string,
  userAuthorization: string | null,
): Record<string, unknown> {
  return {
    id: "urn:covenant:payment:a904",
    tenant_id: TENANT,
    ap2_extension_uri: AP2_EXTENSION_URI,
    cart_mandate_jti: seqUuid(2),
    cart_mandate_hash: cartHash,
    intent_mandate_hash: intentHash,
    memory_digest: MEMORY_DIGEST,
    amount: 189900,
    currency: "INR",
    merchant_id: MERCHANT_URN,
    payment_token: "pt_9f2c",
    agent_instance_id: AGENT_URN,
    verdicts: ALL_PASS,
    execute_not_before: "2026-08-31T10:03:00.000Z",
    envelope_reservation_id: "rsv_env_77aa",
    user_authorization: userAuthorization,
  };
}

export const REGISTERED_CLAIM_ORDER = {
  intent: ["iss", "sub", "aud", "iat", "nbf", "exp", "jti", "vc"],
  cart: ["iss", "sub", "aud", "iat", "nbf", "exp", "jti", "vc"],
  payment: ["iss", "sub", "aud", "iat", "exp", "jti", "vc"],
};

export const VC_CLAIM_ORDER = {
  intent: ["@context", "type", "issuer", "validFrom", "credentialSubject"],
  cart: ["@context", "type", "issuer", "credentialSubject"],
  payment: ["@context", "type", "issuer", "credentialSubject"],
};
