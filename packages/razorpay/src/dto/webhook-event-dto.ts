import { Money } from "@covenant/domain";

/**
 * Typed projection of the three webhook events this adapter's outcome path
 * cares about. Verified live against `docs/webhooks/payments` (payment.
 * captured / payment.failed) and `docs/webhooks/payment-links` (payment_link.
 * paid): the outer envelope is always `{entity:"event", account_id, event,
 * contains, payload, created_at}`; only `event` and `payload` are read here
 * — everything else is Razorpay's to own (§4.4 `.passthrough()` note).
 */
export type RazorpayWebhookEvent =
  | {
      readonly type: "payment.captured";
      readonly paymentId: string;
      readonly orderId: string | null;
      readonly amount: Money;
    }
  | {
      readonly type: "payment.failed";
      readonly paymentId: string;
      readonly orderId: string | null;
      readonly amount: Money;
      readonly errorCode: string | null;
    }
  | {
      readonly type: "payment_link.paid";
      readonly paymentLinkId: string;
      readonly paymentId: string | null;
      readonly orderId: string | null;
      readonly amount: Money;
    };

interface PaymentEntityFields {
  readonly id: string;
  readonly orderId: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly errorCode: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readEntity(container: unknown): Record<string, unknown> | null {
  const wrap = asRecord(container);
  return wrap === null ? null : asRecord(wrap["entity"]);
}

function readPaymentEntity(payload: Record<string, unknown>): PaymentEntityFields | null {
  const e = readEntity(payload["payment"]);
  if (e === null || typeof e["id"] !== "string" || typeof e["amount"] !== "number") {
    return null;
  }
  if (typeof e["currency"] !== "string") {
    return null;
  }
  const orderId = e["order_id"];
  const errorCode = e["error_code"];
  return {
    id: e["id"],
    orderId: typeof orderId === "string" ? orderId : null,
    amount: e["amount"],
    currency: e["currency"],
    errorCode: typeof errorCode === "string" ? errorCode : null,
  };
}

function parsePaymentCaptured(payload: Record<string, unknown>): RazorpayWebhookEvent | null {
  const p = readPaymentEntity(payload);
  if (p === null) {
    return null;
  }
  return {
    type: "payment.captured",
    paymentId: p.id,
    orderId: p.orderId,
    amount: Money.fromPaise(p.amount, p.currency),
  };
}

function parsePaymentFailed(payload: Record<string, unknown>): RazorpayWebhookEvent | null {
  const p = readPaymentEntity(payload);
  if (p === null) {
    return null;
  }
  return {
    type: "payment.failed",
    paymentId: p.id,
    orderId: p.orderId,
    amount: Money.fromPaise(p.amount, p.currency),
    errorCode: p.errorCode,
  };
}

/** A `payment_link.paid` webhook always includes `payment` per its `contains` array; this covers the rest. */
function paymentLinkFallbackAmount(link: Record<string, unknown>): Money {
  const amount = typeof link["amount"] === "number" ? link["amount"] : 0;
  return Money.fromPaise(amount, "INR");
}

function parsePaymentLinkPaid(payload: Record<string, unknown>): RazorpayWebhookEvent | null {
  const link = readEntity(payload["payment_link"]);
  if (link === null || typeof link["id"] !== "string") {
    return null;
  }
  const payment = readPaymentEntity(payload);
  const amount =
    payment === null
      ? paymentLinkFallbackAmount(link)
      : Money.fromPaise(payment.amount, payment.currency);
  return {
    type: "payment_link.paid",
    paymentLinkId: link["id"],
    paymentId: payment?.id ?? null,
    orderId: payment?.orderId ?? null,
    amount,
  };
}

/** `null` for a signature-valid but unrecognised/malformed event — callers ignore, never crash. */
export function parseWebhookEvent(raw: unknown): RazorpayWebhookEvent | null {
  const envelope = asRecord(raw);
  if (envelope === null || typeof envelope["event"] === "undefined") {
    return null;
  }
  const payload = asRecord(envelope["payload"]);
  if (payload === null) {
    return null;
  }
  try {
    switch (envelope["event"]) {
      case "payment.captured":
        return parsePaymentCaptured(payload);
      case "payment.failed":
        return parsePaymentFailed(payload);
      case "payment_link.paid":
        return parsePaymentLinkPaid(payload);
      default:
        return null;
    }
  } catch {
    return null;
  }
}
