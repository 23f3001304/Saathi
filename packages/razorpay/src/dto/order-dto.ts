import type { OrderRef } from "@covenant/domain";
import { DomainError, Money } from "@covenant/domain";

/**
 * `POST /v1/orders` response, verified live (`docs/api/orders/create`):
 * `{amount, amount_due, amount_paid, attempts, created_at, currency, entity,
 * id, notes, offer_id, receipt, status}`. Only the fields the rail reads are
 * modelled — the rest pass through Razorpay untouched.
 */
export interface RazorpayOrderResponse {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string | null;
  readonly status: string;
}

export function isRazorpayOrderResponse(
  value: unknown,
): value is RazorpayOrderResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["amount"] === "number" &&
    typeof v["currency"] === "string" &&
    typeof v["status"] === "string" &&
    (v["receipt"] === null || typeof v["receipt"] === "string")
  );
}

/** Throws (never leaked past the boundary by the caller) if Razorpay echoes an unusable currency. */
export function toOrderRef(response: RazorpayOrderResponse): OrderRef {
  try {
    return {
      orderId: response.id,
      amount: Money.fromPaise(response.amount, response.currency),
      receipt: response.receipt ?? "",
    };
  } catch {
    throw new DomainError("SCHEMA_VIOLATION");
  }
}
