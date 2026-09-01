import type {
  CartQuoteRef,
  IntentBounds,
  MemoryEntry,
  PaymentRequest,
  SourceChannel,
  Tier,
} from "@covenant/domain";
import { REFUND_POLICY_KEY, sha256Of } from "@covenant/domain";

export const NOW = new Date("2026-08-31T10:00:00.000Z");

export const TENANT = "tnt_demo";

export const USER_URN = "urn:covenant:user:9f3c0d21-1c7e-4b2a-9d64-6b0f3a5c8e11";

export const MERCHANT_URN = "urn:covenant:merchant:kolam-run";

export const AGENT_URN =
  "urn:covenant:agent:4b21c0de-0000-4000-8000-000000000001";

export const ISSUERS = {
  user: USER_URN,
  merchant: MERCHANT_URN,
  gateway: "urn:covenant:gateway",
} as const;

export const QUOTE_JTI = "urn:uuid:2d55c0de-0000-4000-8000-000000000002";

export const SKU = "ASC-GC9-UK8";

export const CART_TOTAL_PAISE = 189900;

/** The golden cart: one refundable footwear line, quoted and reserved. */
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
        sku: SKU,
        category: "footwear",
        quantity: 1,
      },
    ],
    total: { label: "Total", amount: { currency: "INR", value: "1899.00" } },
    shippingOptions: [],
    modifiers: [
      {
        supportedMethods: "https://razorpay.com/pay",
        data: { [REFUND_POLICY_KEY]: "14_day_full_refund" },
      },
    ],
  },
  options: { requestShipping: false },
};

export const QUOTE: CartQuoteRef = {
  quote_jti: QUOTE_JTI,
  quote_total_paise: CART_TOTAL_PAISE,
  quote_expiry: "2026-08-31T10:15:00.000Z",
  reservation_id: "rsv_stk_c41f",
  reservation_expires_at: "2026-08-31T10:15:00.000Z",
};

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
  skus: [SKU],
  requires_refundability: true,
  user_cart_confirmation_required: false,
  human_present: true,
  intent_expiry: "2026-09-01T12:00:00.000Z",
  envelopes: [{ category: "footwear", period: "month", cap_paise: 500000 }],
  cooloff: { threshold_paise: 500000, hold_seconds: 86400 },
  blackout_hours: null,
  credit_policy: { allow_credit: false, max_apr_bps: 0 },
  share_aggregates: false,
};

interface EntryOverrides {
  readonly id: string;
  readonly tier: Tier;
  readonly channel: SourceChannel;
  readonly content: Readonly<Record<string, unknown>>;
  readonly predicate: string | null;
}

export function memoryEntry(overrides: EntryOverrides): MemoryEntry {
  return {
    id: overrides.id,
    tenantId: TENANT,
    userId: USER_URN,
    type: "fact",
    tier: overrides.tier,
    quarantined: false,
    subject: SKU,
    predicate: overrides.predicate,
    content: overrides.content,
    contentHash: sha256Of(overrides.content),
    entryHash: "",
    sourceChannel: overrides.channel,
    sourceRef: "merchant-2026-08-00000000",
    tValid: "2026-08-31T09:00:00.000Z",
    tInvalid: null,
    tCreated: "2026-08-31T09:00:00.000Z",
    tExpired: null,
    supersededBy: null,
    writeEventId: "ev_seed",
  };
}

/** The P2 merchant price attestation `QuoteMatchCheck` resolves by `quote_jti`. */
export const QUOTE_ENTRY: MemoryEntry = memoryEntry({
  id: "mem_00000000-0000-4000-8000-000000000001",
  tier: 2,
  channel: "merchant_attestation",
  predicate: "price",
  content: {
    quote_jti: QUOTE_JTI,
    sku_id: SKU,
    total_paise: CART_TOTAL_PAISE,
    quote_expiry: QUOTE.quote_expiry,
    reservation_id: QUOTE.reservation_id,
  },
});

export const PREFERENCE_ENTRY: MemoryEntry = memoryEntry({
  id: "mem_00000000-0000-4000-8000-000000000002",
  tier: 1,
  channel: "verified_api",
  predicate: "size",
  content: { shoe_size_uk: 8 },
});

export const GOLDEN_ENTRIES: readonly MemoryEntry[] = [
  QUOTE_ENTRY,
  PREFERENCE_ENTRY,
];
