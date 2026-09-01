import type { PaymentSnapshot, PaymentState } from "@covenant/domain";
import { DomainError, Money, PAYMENT_STATES } from "@covenant/domain";

/**
 * `GET /v1/payments/:id` response, verified live
 * (`docs/api/payments/fetch-with-id`): the five documented states —
 * `created, authorized, captured, refunded, failed` — are exactly the
 * domain's `PAYMENT_STATES` (§ports/payment-rail.ts), so no translation
 * table is needed, only a membership check.
 */
export interface RazorpayPaymentResponse {
  readonly id: string;
  readonly order_id: string | null;
  readonly status: string;
  readonly amount: number;
  readonly currency: string;
  readonly error_code: string | null;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isRazorpayPaymentResponse(
  value: unknown,
): value is RazorpayPaymentResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    isStringOrNull(v["order_id"]) &&
    typeof v["status"] === "string" &&
    typeof v["amount"] === "number" &&
    typeof v["currency"] === "string" &&
    isStringOrNull(v["error_code"])
  );
}

function isKnownPaymentState(status: string): status is PaymentState {
  return (PAYMENT_STATES as readonly string[]).includes(status);
}

/**
 * `GET /v1/orders/:id/payments` answers a collection envelope rather than a
 * bare array. `count: 0` with an empty `items` is the ordinary answer for an
 * order nobody has paid, so it is a valid response and not a schema violation.
 */
export function isRazorpayPaymentCollection(
  value: unknown,
): value is { readonly items: readonly unknown[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return Array.isArray((value as { items?: unknown }).items);
}

export function toPaymentSnapshot(
  response: RazorpayPaymentResponse,
): PaymentSnapshot {
  if (!isKnownPaymentState(response.status)) {
    throw new DomainError("SCHEMA_VIOLATION");
  }
  try {
    return {
      paymentId: response.id,
      orderId: response.order_id,
      state: response.status,
      amount: Money.fromPaise(response.amount, response.currency),
      errorCode: response.error_code,
    };
  } catch {
    throw new DomainError("SCHEMA_VIOLATION");
  }
}
