import type {
  CartMandate,
  IntentMandate,
  MemoryEntry,
  Sha256Ref,
} from "@covenant/domain";
import {
  AP2_EXTENSION_URI,
  MEMORY_DIGEST_ALG,
  PINNED_CONTEXT_URIS,
  cartLinesOf,
  cartTotalOf,
  declaredTotalOf,
  sha256RefOf,
} from "@covenant/domain";

import { computeDigest } from "../src/index.js";
import type { VerdictContext } from "../src/index.js";
import {
  AGENT_URN,
  BOUNDS,
  GOLDEN_ENTRIES,
  MERCHANT_URN,
  NOW,
  PAYMENT_REQUEST,
  QUOTE,
  TENANT,
  USER_URN,
} from "./fixtures.js";

const INTENT_JTI = "urn:uuid:11111111-1111-4111-8111-111111111111";
const CART_JTI = "urn:uuid:22222222-2222-4222-8222-222222222222";
const INTENT_JWT_HASH = "a".repeat(64);
const CART_JWT_HASH = "b".repeat(64);

export const GOLDEN_INTENT: IntentMandate = {
  ...BOUNDS,
  kind: "intent",
  id: "urn:covenant:intent:1",
  jti: INTENT_JTI,
  iss: USER_URN,
  sub: USER_URN,
  aud: "urn:covenant:gateway",
  iat: "2026-08-31T09:00:00.000Z",
  nbf: "2026-08-31T09:00:00.000Z",
  exp: "2026-09-01T12:00:00.000Z",
  kid: "user-2026-08-00000000",
  role: "user",
  jwtHash: INTENT_JWT_HASH,
  tenant_id: TENANT,
  ap2_extension_uri: AP2_EXTENSION_URI,
  natural_language_description: "One pair of running shoes under Rs 2,000.",
  agent_instance_id: AGENT_URN,
};

export const GOLDEN_CART: CartMandate = {
  kind: "cart",
  id: "urn:covenant:cart:1",
  jti: CART_JTI,
  iss: MERCHANT_URN,
  sub: USER_URN,
  aud: "urn:covenant:gateway",
  iat: "2026-08-31T09:59:00.000Z",
  nbf: "2026-08-31T09:59:00.000Z",
  exp: "2026-08-31T10:15:00.000Z",
  kid: "merchant-2026-08-00000000",
  role: "merchant",
  jwtHash: CART_JWT_HASH,
  tenant_id: TENANT,
  ap2_extension_uri: AP2_EXTENSION_URI,
  intent_mandate_jti: INTENT_JTI,
  intent_mandate_hash: `sha256:${INTENT_JWT_HASH}`,
  payment_request: PAYMENT_REQUEST,
  cart_hash: sha256RefOf(PAYMENT_REQUEST),
  merchant_authorization: "ey.merchant.auth",
  memory_digest: computeDigest(GOLDEN_ENTRIES),
  memory_digest_alg: MEMORY_DIGEST_ALG,
  memory_entry_ids: GOLDEN_ENTRIES.map((entry) => entry.id),
  memory_tier_floor: "P1",
  risk_data: null,
  quote: QUOTE,
  agent_instance_id: AGENT_URN,
};

const IDENTITY = {
  now: NOW,
  tenantId: TENANT,
  userId: USER_URN,
  requestId: "req-1",
  txnId: "txn_1",
  payloadHash: "c".repeat(64),
  idempotencyKey: "key-1",
  riskAttestation: {
    signatureValid: false,
    signerRole: null,
    payloadHashMatches: false,
  },
} as const;

const SIGNED_QUOTE = {
  quote_jti: QUOTE.quote_jti,
  sku_id: "ASC-GC9-UK8",
  total_paise: QUOTE.quote_total_paise,
  quote_expiry: QUOTE.quote_expiry,
  reservation_id: QUOTE.reservation_id,
  asked_unit_paise: null,
  signed_by: "merchant-2026-08-00000000",
  tier: 2,
} as const;

const FULL_ENVELOPE = {
  category: "footwear",
  period: "month",
  capPaise: 500000,
  committedPaise: 0,
  openReservedPaise: 0,
  resetsAt: "2026-09-01T00:00:00.000Z",
  oldestReservationExpiresAt: null,
} as const;

export interface ContextOverrides {
  readonly intent?: Partial<IntentMandate>;
  readonly cart?: Partial<CartMandate>;
  readonly entries?: readonly MemoryEntry[];
  readonly context?: Partial<VerdictContext>;
}

/**
 * A `VerdictContext` built by hand, because a check is a pure function over
 * facts: the check tests need no database, no keys and no clock beyond the one
 * instant they name.
 */
export function goldenContext(
  overrides: ContextOverrides = {},
): VerdictContext {
  const intent = { ...GOLDEN_INTENT, ...overrides.intent };
  const cart = { ...GOLDEN_CART, ...overrides.cart };
  const entries = overrides.entries ?? GOLDEN_ENTRIES;
  return {
    ...IDENTITY,
    intent,
    cart,
    cartContexts: [...PINNED_CONTEXT_URIS],
    merchantAuth: { merchantIss: MERCHANT_URN, cartHash: cart.cart_hash },
    cartTotal: cartTotalOf(cart.payment_request),
    declaredCartTotal: declaredTotalOf(cart.payment_request),
    cartLines: cartLinesOf(cart.payment_request),
    computedCartHash: sha256RefOf(cart.payment_request) as Sha256Ref,
    nonceState: null,
    memory: {
      entries,
      recomputedDigest: computeDigest(entries),
      minTier: 1,
      missingIds: [],
      extraIds: [],
    },
    signedQuote: SIGNED_QUOTE,
    priceFloors: [],
    stockReservation: null,
    envelopes: [FULL_ENVELOPE],
    cooloffRule: intent.cooloff,
    blackout: null,
    pinnedUris: [...PINNED_CONTEXT_URIS],
    apiVersion: "2026-08-31",
    cancelUrlBase: "/v1/cooloff",
    ...overrides.context,
  };
}
