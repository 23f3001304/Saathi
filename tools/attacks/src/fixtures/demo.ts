import type { BoundsSpec, EnvelopeDecl } from "../mandates/intent-mandate.js";
import type { CartSpec, LineSpec } from "../mandates/payment-request.js";

/** The demo's golden line: one refundable pair of running shoes at ₹1,899. */
export const DEMO_SKU = "ASC-GC9-UK8";

export const DEMO_UNIT_PAISE = 189_900;

export const DEMO_CAP_PAISE = 200_000;

export const MERCHANT_SLUG = "kolam-run";

export interface CartOptions {
  readonly id: string;
  readonly category: string;
  readonly unitPaise?: number;
  readonly quantity?: number;
  readonly refundPolicy?: string | null;
}

export function demoLine(options: CartOptions): LineSpec {
  return {
    label: "Asics Gel-Contend 9 (UK 8)",
    sku: DEMO_SKU,
    category: options.category,
    quantity: options.quantity ?? 1,
    unitPaise: options.unitPaise ?? DEMO_UNIT_PAISE,
  };
}

export function demoCart(options: CartOptions): CartSpec {
  return {
    id: `urn:covenant:cart:${options.id}`,
    merchantSlug: MERCHANT_SLUG,
    lines: [demoLine(options)],
    refundPolicy:
      options.refundPolicy === undefined ? "14_day_full_refund" : options.refundPolicy,
    currency: "INR",
  };
}

export interface BoundsOptions {
  readonly merchantIss: string;
  readonly category: string;
  readonly maxAmountPaise?: number;
  readonly capPaise?: number;
  readonly skus?: readonly string[] | null;
  readonly humanPresent?: boolean;
  readonly requiresRefundability?: boolean;
  readonly cooloffThresholdPaise?: number;
  readonly cooloffHoldSeconds?: number;
  readonly envelopes?: readonly EnvelopeDecl[];
}

function envelopesOf(options: BoundsOptions): readonly EnvelopeDecl[] {
  return (
    options.envelopes ?? [
      {
        category: options.category,
        period: "month",
        cap_paise: options.capPaise ?? 500_000,
      },
    ]
  );
}

/**
 * The bounds the user signs. `cooloff.threshold_paise` sits above the cart
 * total by default so the golden path approves instead of parking — the
 * cool-off seal is demonstrated by `T-31`'s own flow, not by accident here.
 */
export function demoBounds(options: BoundsOptions): BoundsSpec {
  return {
    maxAmountPaise: options.maxAmountPaise ?? DEMO_CAP_PAISE,
    currency: "INR",
    merchants: [options.merchantIss],
    skus: options.skus === undefined ? [DEMO_SKU] : options.skus,
    requiresRefundability: options.requiresRefundability ?? true,
    userCartConfirmationRequired: false,
    humanPresent: options.humanPresent ?? true,
    envelopes: envelopesOf(options),
    cooloffThresholdPaise: options.cooloffThresholdPaise ?? 5_000_000,
    cooloffHoldSeconds: options.cooloffHoldSeconds ?? 86_400,
    ttlSeconds: 86_400,
  };
}
