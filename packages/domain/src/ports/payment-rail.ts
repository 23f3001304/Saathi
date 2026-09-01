import type { Money } from "../money.js";

export interface OrderRequest {
  readonly amount: Money;
  /** The payment mandate `jti`: Razorpay rejects a duplicate receipt (§2.5). */
  readonly receipt: string;
  readonly notes: Readonly<Record<string, string>>;
}

export interface OrderRef {
  readonly orderId: string;
  readonly amount: Money;
  readonly receipt: string;
}

export interface PaymentLinkRequest {
  readonly orderId: string;
  readonly amount: Money;
  /** `reference_id`, also the payment mandate `jti`. */
  readonly referenceId: string;
  readonly description: string;
}

export interface PaymentLink {
  readonly linkId: string;
  readonly shortUrl: string;
}

export const PAYMENT_STATES = [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];

export interface PaymentSnapshot {
  readonly paymentId: string;
  readonly orderId: string | null;
  readonly state: PaymentState;
  readonly amount: Money;
  readonly errorCode: string | null;
}

/** The single money egress. Only the gateway process holds an implementation. */
export interface PaymentRail {
  createOrder(request: OrderRequest): Promise<OrderRef>;
  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink>;
  getPayment(paymentId: string): Promise<PaymentSnapshot>;
  /**
   * Every payment attempt booked against an order, newest last. This is the
   * only handle on a checkout **nobody has paid yet**: `getPayment` needs an
   * id that does not exist until someone pays, so a poller holding only a
   * payment id can never start. An empty list is the honest "still waiting".
   */
  paymentsForOrder(orderId: string): Promise<readonly PaymentSnapshot[]>;
}
