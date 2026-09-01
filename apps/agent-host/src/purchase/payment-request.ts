import type { CatalogSku, IssuedQuote } from "@covenant/agents";
import type { CartLineItem, PaymentRequest } from "@covenant/domain";
import { REFUND_POLICY_KEY } from "@covenant/domain";

export const RAZORPAY_METHOD = "https://razorpay.com/pay";

/** Two decimal places, by string surgery — there is no float path (§A.2). */
export function majorUnits(paise: number): string {
  const digits = Math.abs(paise).toString().padStart(3, "0");
  const sign = paise < 0 ? "-" : "";
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function lineOf(sku: CatalogSku, quote: IssuedQuote): CartLineItem {
  const line = quote.claims.line_items[0];
  const qty = line?.qty ?? 1;
  const unit = line?.unit_paise ?? quote.claims.total_paise;
  return {
    label: sku.label,
    amount: { currency: quote.claims.currency, value: majorUnits(unit) },
    sku: sku.sku,
    category: sku.category,
    quantity: qty,
  };
}

/**
 * The W3C PaymentRequest the Cart Mandate signs over (§6.3). Two properties are
 * load-bearing and neither is decoration:
 *
 * - the line's `unit_paise` comes from the **merchant-signed quote**, never
 *   from the catalog listing, so drip pricing between quote and cart surfaces
 *   as `CART_QUOTE_MISMATCH` rather than as a surprise on the payment link;
 * - the `refund_policy` modifier is present only when the **merchant-signed
 *   quote** attests the SKU is refundable. It used to be read off the catalog
 *   listing, which is an unsigned claim reaching us at P0: a cart is not
 *   entitled to promise the user a refund policy on the strength of a row
 *   nobody signed, and one that does passes the gateway's check and fails the
 *   user.
 */
export function paymentRequestFor(
  sku: CatalogSku,
  quote: IssuedQuote,
  cartId: string,
): PaymentRequest {
  const line = lineOf(sku, quote);
  // The declared total is the merchant's signed total; `cartTotalOf` recomputes
  // it from the lines, and `QuoteMatchCheck` fails the cart if the two differ.
  const total = majorUnits(quote.claims.total_paise);
  return {
    methodData: [
      {
        supportedMethods: RAZORPAY_METHOD,
        data: { mode: "test", merchant_id: quote.claims.merchant_id },
      },
    ],
    details: {
      id: cartId,
      displayItems: [line],
      total: {
        label: "Total",
        amount: { currency: quote.claims.currency, value: total },
      },
      shippingOptions: [],
      modifiers: quote.claims.refundable
        ? [
            {
              supportedMethods: RAZORPAY_METHOD,
              data: { [REFUND_POLICY_KEY]: "14_day_full_refund" },
            },
          ]
        : [],
    },
    options: { requestShipping: false },
  };
}
