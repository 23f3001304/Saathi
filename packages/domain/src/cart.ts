import { Money } from "./money.js";
import type { PaymentRequest } from "./payment-request.js";

/**
 * One priced line of a cart (§8.2). `unitPaise` is the per-unit price, so a
 * line draws `unitPaise * qty` against an envelope.
 */
export interface CartLine {
  readonly sku: string;
  readonly category: string;
  readonly qty: number;
  readonly unitPaise: number;
}

/**
 * The key under `details.modifiers[].data` that declares a refund policy;
 * `IntentBoundsCheck` predicate 6 reads it when the intent requires
 * refundability (§8.4 check 1).
 */
export const REFUND_POLICY_KEY = "refund_policy";

export function cartCurrency(request: PaymentRequest): string {
  return request.details.total.amount.currency;
}

export function cartLinesOf(request: PaymentRequest): readonly CartLine[] {
  const currency = cartCurrency(request);
  return request.details.displayItems.map((item) => ({
    sku: item.sku,
    category: item.category,
    qty: item.quantity,
    unitPaise: Money.fromMajorUnits(item.amount.value, currency).paise,
  }));
}

export function lineTotalPaise(line: CartLine): number {
  return line.unitPaise * line.qty;
}

/**
 * Recomputed from the line items, never read from `details.total` — a total
 * the merchant asserts is exactly what drip pricing manipulates (§8.2).
 */
export function cartTotalOf(request: PaymentRequest): Money {
  const currency = cartCurrency(request);
  const paise = cartLinesOf(request).reduce(
    (sum, line) => sum + lineTotalPaise(line),
    0,
  );
  return Money.fromPaise(paise, currency);
}

/** What the merchant *claims* the total is; `QuoteMatchCheck` compares them. */
export function declaredTotalOf(request: PaymentRequest): Money {
  const total = request.details.total.amount;
  return Money.fromMajorUnits(total.value, total.currency);
}

export function categoriesOf(request: PaymentRequest): readonly string[] {
  return [...new Set(cartLinesOf(request).map((line) => line.category))];
}

export function categoryDrawPaise(
  lines: readonly CartLine[],
  category: string,
): number {
  return lines
    .filter((line) => line.category === category)
    .reduce((sum, line) => sum + lineTotalPaise(line), 0);
}

export function declaresRefundPolicy(request: PaymentRequest): boolean {
  return request.details.modifiers.some(
    (modifier) =>
      modifier.data !== null &&
      Object.hasOwn(modifier.data, REFUND_POLICY_KEY) &&
      modifier.data[REFUND_POLICY_KEY] !== null,
  );
}
