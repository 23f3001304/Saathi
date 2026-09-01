import type { PurchaseSpec } from "../flow/purchase.js";
import { DEMO_SKU, DEMO_UNIT_PAISE, demoBounds, demoCart } from "../fixtures/demo.js";
import type { Harness } from "../harness.js";
import type { EnvelopeDecl } from "../mandates/intent-mandate.js";
import type { CartSpec, LineSpec } from "../mandates/payment-request.js";
import type { PurchaseContext, PurchaseScenario } from "./types.js";

const FAMILY = "purchase (verify-cart)";

const DESCRIPTION = "Buy running kit under Rs 2,000, refundable, from Kolam Run.";

function line(sku: string, category: string, unitPaise: number, quantity: number): LineSpec {
  return { label: sku, sku, category, quantity, unitPaise };
}

function cartOf(context: PurchaseContext, lines: readonly LineSpec[], refund = "14_day_full_refund"): CartSpec {
  return {
    id: `urn:covenant:cart:${context.category}`,
    merchantSlug: "kolam-run",
    lines,
    refundPolicy: refund,
    currency: "INR",
  };
}

interface Tuning {
  readonly maxAmountPaise?: number;
  readonly capPaise?: number;
  readonly humanPresent?: boolean;
  readonly skus?: readonly string[] | null;
  readonly cooloffThresholdPaise?: number;
  readonly cooloffHoldSeconds?: number;
  readonly envelopes?: readonly EnvelopeDecl[];
}

function specOf(
  harness: Harness,
  context: PurchaseContext,
  cart: CartSpec,
  tuning: Tuning = {},
): PurchaseSpec {
  return {
    userId: context.userId,
    cart,
    description: DESCRIPTION,
    bounds: demoBounds({
      merchantIss: harness.merchantIss,
      category: context.category,
      ...tuning,
    }),
  };
}

function simple(
  id: string,
  description: string,
  build: (harness: Harness, context: PurchaseContext) => PurchaseSpec,
  extra: Partial<PurchaseScenario> = {},
): PurchaseScenario {
  return { id, family: FAMILY, description, build, ...extra };
}

export const PURCHASE_SCENARIOS: readonly PurchaseScenario[] = [
  simple("E01", "the golden single-line cart", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category })),
  ),
  simple("E02", "three of one item, well inside the cap", (h, c) =>
    specOf(h, c, cartOf(c, [line(DEMO_SKU, c.category, 60_000, 3)])),
  ),
  simple("E03", "two different lines in the same category", (h, c) =>
    specOf(
      h,
      c,
      cartOf(c, [
        line(DEMO_SKU, c.category, 100_000, 1),
        line("KR-SOCK-3PK", c.category, 80_000, 1),
      ]),
      { skus: null },
    ),
  ),
  simple("E04", "a cart exactly at the signed cap", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), {
      maxAmountPaise: DEMO_UNIT_PAISE,
    }),
  ),
  simple("E05", "a cart one paise under the signed cap", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), {
      maxAmountPaise: DEMO_UNIT_PAISE + 1,
    }),
  ),
  simple("E06", "an envelope with room for exactly this cart", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), {
      capPaise: DEMO_UNIT_PAISE,
    }),
  ),
  simple("E07", "an envelope with one paise of headroom", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), {
      capPaise: DEMO_UNIT_PAISE + 1,
    }),
  ),
  simple("E08", "an unsupervised (HNP) purchase inside a declared envelope", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), {
      humanPresent: false,
    }),
  ),
  simple(
    "E09",
    "a merchant re-quote after the previous quote's TTL expired",
    (h, c) => specOf(h, c, demoCart({ id: c.category, category: c.category })),
    { staleQuoteFirst: true },
  ),
  simple("E10", "a legitimate price rise that stays inside the cap", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category, unitPaise: 199_900 })),
  ),
  simple("E11", "a store-credit refund policy instead of a cash refund", (h, c) =>
    specOf(
      h,
      c,
      demoCart({ id: c.category, category: c.category, refundPolicy: "30_day_store_credit" }),
    ),
  ),
  simple("E12", "a cart in one of two declared envelope categories", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), {
      envelopes: [
        { category: c.category, period: "month", cap_paise: 500_000 },
        { category: `${c.category}-apparel`, period: "month", cap_paise: 300_000 },
      ],
    }),
  ),
  simple("E13", "a cart under an intent that restricts no SKUs", (h, c) =>
    specOf(h, c, demoCart({ id: c.category, category: c.category }), { skus: null }),
  ),
  simple(
    "E14",
    "a cart above the cool-off threshold, with §6.2's own 24 h hold on a 24 h intent",
    (h, c) =>
      specOf(h, c, demoCart({ id: c.category, category: c.category }), {
        cooloffThresholdPaise: 100_000,
      }),
    { expectHold: true },
  ),
  simple(
    "E15",
    "the same cart with a one-hour hold that fits inside the intent",
    (h, c) =>
      specOf(h, c, demoCart({ id: c.category, category: c.category }), {
        cooloffThresholdPaise: 100_000,
        cooloffHoldSeconds: 3_600,
      }),
    { expectHold: true },
  ),
];
