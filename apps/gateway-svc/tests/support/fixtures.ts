import type {
  CartQuoteRef,
  IntentBounds,
  PaymentRequest,
} from "@covenant/domain";
import { REFUND_POLICY_KEY } from "@covenant/domain";

export const SKU = "ASC-GC9-UK8";

export const CART_TOTAL_PAISE = 189900;

export const TENANT = "tnt_demo";

export const AGENT_URN =
  "urn:covenant:agent:4b21c0de-0000-4000-8000-000000000001";

const HOUR_MS = 60 * 60 * 1000;

function iso(now: Date, offsetMs: number): string {
  return new Date(now.getTime() + offsetMs).toISOString();
}

/** One refundable footwear line, quoted and reserved — the golden cart. */
export function paymentRequestOf(): PaymentRequest {
  return {
    methodData: [
      {
        supportedMethods: "https://razorpay.com/pay",
        data: { mode: "test", merchant_id: "kolam-run" },
      },
    ],
    details: {
      id: "cart_smoke",
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
}

export function quoteOf(now: Date, quoteJti: string): CartQuoteRef {
  return {
    quote_jti: quoteJti,
    quote_total_paise: CART_TOTAL_PAISE,
    quote_expiry: iso(now, HOUR_MS),
    reservation_id: "rsv_stk_smoke",
    reservation_expires_at: iso(now, HOUR_MS),
  };
}

export function boundsOf(now: Date, merchantUrn: string): IntentBounds {
  return {
    allowance: {
      reason: "one_time",
      max_amount: 200000,
      currency: "INR",
      expires_at: iso(now, 24 * HOUR_MS),
      merchant_id: null,
      checkout_session_id: null,
    },
    merchants: [merchantUrn],
    skus: [SKU],
    requires_refundability: true,
    user_cart_confirmation_required: false,
    human_present: true,
    intent_expiry: iso(now, 24 * HOUR_MS),
    envelopes: [{ category: "footwear", period: "month", cap_paise: 500000 }],
    // Above the cart total, so the golden path approves instead of parking.
    cooloff: { threshold_paise: 500000, hold_seconds: 86400 },
    blackout_hours: null,
    credit_policy: { allow_credit: false, max_apr_bps: 0 },
    share_aggregates: false,
  };
}

/** The P2 merchant price attestation `QuoteMatchCheck` resolves by `quote_jti`. */
export function quoteAttestationContent(
  quote: CartQuoteRef,
): Readonly<Record<string, unknown>> {
  return {
    quote_jti: quote.quote_jti,
    sku_id: SKU,
    total_paise: CART_TOTAL_PAISE,
    quote_expiry: quote.quote_expiry,
    reservation_id: quote.reservation_id,
  };
}
