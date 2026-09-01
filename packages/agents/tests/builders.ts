import type { IntentBounds, PaymentRequest } from "@covenant/domain";

const METHOD = "https://razorpay.com/pay";

export function paymentRequest(
  overrides: {
    value?: string;
    currency?: string;
    sku?: string;
    refundable?: boolean;
  } = {},
): PaymentRequest {
  const currency = overrides.currency ?? "INR";
  const value = overrides.value ?? "1899.00";
  const sku = overrides.sku ?? "ASC-GC9-UK8";
  return {
    methodData: [{ supportedMethods: METHOD, data: null }],
    details: {
      id: "cart_1",
      total: { label: "Total", amount: { currency, value } },
      displayItems: [
        {
          label: "Kolam Run Gc9 road shoe, UK 8",
          amount: { currency, value },
          sku,
          category: "footwear",
          quantity: 1,
        },
      ],
      shippingOptions: [],
      modifiers:
        overrides.refundable === false
          ? []
          : [{ supportedMethods: METHOD, data: { refund_policy: "30_day" } }],
    },
    options: { requestShipping: false },
  };
}

export function intentBounds(
  overrides: Partial<IntentBounds> = {},
): IntentBounds {
  return {
    allowance: {
      reason: "one_time",
      max_amount: 200000,
      currency: "INR",
      expires_at: "2026-09-01T09:00:00.000Z",
      merchant_id: null,
      checkout_session_id: null,
    },
    merchants: ["kolam-run"],
    skus: null,
    requires_refundability: true,
    user_cart_confirmation_required: true,
    human_present: true,
    intent_expiry: "2026-09-01T09:00:00.000Z",
    envelopes: [{ category: "footwear", period: "month", cap_paise: 500000 }],
    cooloff: { threshold_paise: 500000, hold_seconds: 86400 },
    blackout_hours: null,
    credit_policy: { allow_credit: false, max_apr_bps: 0 },
    share_aggregates: true,
    ...overrides,
  };
}

export const QUOTE_REF = {
  quote_jti: "urn:uuid:00000000-0000-4000-8000-000000000001",
  quote_total_paise: 189900,
  quote_expiry: "2026-08-31T09:24:02.113Z",
  reservation_id: "resv_1",
  reservation_expires_at: "2026-08-31T09:34:02.113Z",
};
