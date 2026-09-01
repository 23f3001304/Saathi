import type {
  CartQuoteRef,
  IntentBounds,
  PaymentRequest,
} from "@covenant/domain";

import {
  CredentialEnvelope,
  Es256Signer,
  Es256Verifier,
  KeyStore,
  MandateChainBinder,
  MandateChainVerifier,
  MerchantAuthorization,
  PinnedJwkResolver,
  UserAuthorization,
  generateKeyMaterial,
} from "../src/index.js";
import type { GeneratedKeyMaterial } from "../src/index.js";
import { FixedClock, SequenceIdGenerator } from "./doubles.js";

export const NOW = new Date("2026-08-31T10:00:00.000Z");

export const TENANT = "tnt_demo";

export const USER_URN =
  "urn:covenant:user:9f3c0d21-1c7e-4b2a-9d64-6b0f3a5c8e11";

export const MERCHANT_URN = "urn:covenant:merchant:kolam-run";

export const AGENT_URN =
  "urn:covenant:agent:4b21c0de-0000-4000-8000-000000000001";

export const ISSUERS = {
  user: USER_URN,
  merchant: MERCHANT_URN,
  gateway: "urn:covenant:gateway",
} as const;

export interface Harness {
  readonly material: GeneratedKeyMaterial;
  readonly clock: FixedClock;
  readonly ids: SequenceIdGenerator;
  readonly signer: Es256Signer;
  readonly verifier: Es256Verifier;
  readonly resolver: PinnedJwkResolver;
  readonly envelope: CredentialEnvelope;
  readonly binder: MandateChainBinder;
  readonly merchantAuth: MerchantAuthorization;
  readonly userAuth: UserAuthorization;
  readonly chain: MandateChainVerifier;
}

/** Real ES256 keys, real signatures — the suite mocks no crypto anywhere. */
export async function buildHarness(): Promise<Harness> {
  const material = await generateKeyMaterial(ISSUERS, NOW);
  const clock = new FixedClock(NOW);
  const ids = new SequenceIdGenerator();
  const signer = new Es256Signer(new KeyStore(material.privateKeys));
  const resolver = new PinnedJwkResolver(material.trustRing, clock);
  const verifier = new Es256Verifier(resolver, clock);
  const merchantAuth = new MerchantAuthorization(signer, verifier, ids);
  const binder = new MandateChainBinder();
  return {
    material,
    clock,
    ids,
    signer,
    verifier,
    resolver,
    envelope: new CredentialEnvelope(clock, ids),
    binder,
    merchantAuth,
    userAuth: new UserAuthorization(signer, verifier, ids),
    chain: new MandateChainVerifier(verifier, binder, merchantAuth),
  };
}

export const BOUNDS: IntentBounds = {
  allowance: {
    reason: "one_time",
    max_amount: 200000,
    currency: "INR",
    expires_at: "2026-09-01T12:00:00.000Z",
    merchant_id: null,
    checkout_session_id: null,
  },
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
};

export const PAYMENT_REQUEST: PaymentRequest = {
  methodData: [
    {
      supportedMethods: "https://razorpay.com/pay",
      data: { mode: "test", merchant_id: "kolam-run" },
    },
  ],
  details: {
    id: "cart_5e88",
    displayItems: [
      {
        label: "Asics Gel-Contend 9 (UK 8)",
        amount: { currency: "INR", value: "1899.00" },
        sku: "ASC-GC9-UK8",
        category: "footwear",
        quantity: 1,
      },
    ],
    total: {
      label: "Total",
      amount: { currency: "INR", value: "1899.00" },
    },
    shippingOptions: [],
    modifiers: [],
  },
  options: { requestShipping: false },
};

export const QUOTE: CartQuoteRef = {
  quote_jti: "urn:uuid:2d55c0de-0000-4000-8000-000000000002",
  quote_total_paise: 189900,
  quote_expiry: "2026-08-31T10:15:00.000Z",
  reservation_id: "rsv_stk_c41f",
  reservation_expires_at: "2026-08-31T10:15:00.000Z",
};

export const MEMORY_DIGEST =
  "sha256:c07e6f4b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b";
