import { REFUND_POLICY_KEY } from "../protocol.js";

export interface LineSpec {
  readonly label: string;
  readonly sku: string;
  readonly category: string;
  readonly quantity: number;
  readonly unitPaise: number;
}

export interface CartSpec {
  readonly id: string;
  readonly merchantSlug: string;
  readonly lines: readonly LineSpec[];
  /** `null` means the cart declares no refund policy at all. */
  readonly refundPolicy: string | null;
  readonly currency: string;
}

/** Integer paise to the W3C decimal string; string surgery, never a float. */
export function majorUnitsOf(paise: number): string {
  const digits = Math.abs(paise).toString().padStart(3, "0");
  const sign = paise < 0 ? "-" : "";
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * The total the gateway recomputes: `sum(unitPaise * qty)`. A total the
 * merchant merely asserts is exactly what drip pricing manipulates (§8.2), so
 * the harness derives it the same way rather than carrying it as a field.
 */
export function totalPaiseOf(lines: readonly LineSpec[]): number {
  return lines.reduce((sum, line) => sum + line.unitPaise * line.quantity, 0);
}

function modifiersOf(spec: CartSpec): readonly unknown[] {
  if (spec.refundPolicy === null) {
    return [];
  }
  return [
    {
      supportedMethods: "https://razorpay.com/pay",
      data: { [REFUND_POLICY_KEY]: spec.refundPolicy },
    },
  ];
}

function lineOf(line: LineSpec, currency: string): Readonly<Record<string, unknown>> {
  return {
    label: line.label,
    amount: { currency, value: majorUnitsOf(line.unitPaise) },
    sku: line.sku,
    category: line.category,
    quantity: line.quantity,
  };
}

/** W3C `PaymentRequest` — no custom cart schema anywhere (§6.3, A.2). */
export function paymentRequestOf(spec: CartSpec): Readonly<Record<string, unknown>> {
  const total = totalPaiseOf(spec.lines);
  return {
    methodData: [
      {
        supportedMethods: "https://razorpay.com/pay",
        data: { mode: "test", merchant_id: spec.merchantSlug },
      },
    ],
    details: {
      id: spec.id,
      displayItems: spec.lines.map((line) => lineOf(line, spec.currency)),
      total: {
        label: "Total",
        amount: { currency: spec.currency, value: majorUnitsOf(total) },
      },
      shippingOptions: [],
      modifiers: modifiersOf(spec),
    },
    options: { requestShipping: false },
  };
}
