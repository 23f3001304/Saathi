import type {
  OrderRef,
  OrderRequest,
  PaymentLink,
  PaymentLinkRequest,
  PaymentRail,
  PaymentSnapshot,
} from "@covenant/domain";
import { DomainError } from "@covenant/domain";
import { isRazorpayOrderResponse, toOrderRef } from "./dto/order-dto.js";
import {
  isRazorpayPaymentLinkResponse,
  toPaymentLink,
} from "./dto/payment-link-dto.js";
import {
  isRazorpayPaymentCollection,
  isRazorpayPaymentResponse,
  toPaymentSnapshot,
} from "./dto/payment-dto.js";
import type { RazorpayClient } from "./razorpay-client.js";

/**
 * Implements the domain's `PaymentRail` port (the contract — read verbatim
 * from `packages/domain/src/ports/payment-rail.ts`, not from memory).
 *
 * `receipt` (createOrder) and `referenceId` (createPaymentLink) are supplied
 * by the caller on `OrderRequest`/`PaymentLinkRequest` — the port already
 * carries them as request fields, so stamping "receipt = mandate nonce" is
 * `ExecutePaymentService`'s job (packages/gateway, out of this package's
 * reach: `razorpay -> domain` only, no `mandates`). This adapter's job is
 * transport + response validation, not mandate semantics.
 */
/**
 * Razorpay caps `reference_id` and `receipt` at 40 characters; a Payment
 * Mandate `jti` is a 45-character `urn:uuid:` URN, so the live rail answered
 * 400 where the fake one accepted anything. Trimming the URN scheme leaves the
 * UUID, which is unique, stable across a retry, and 36 characters. Anything
 * still too long is truncated from the front, keeping the end where ids vary.
 *
 * Nothing is injected into `notes` to compensate: `notes` is the caller's, and
 * the ledger — not Razorpay's metadata — is where the untrimmed id is kept.
 */
const RZP_ID_MAX = 40;

export function railReference(value: string): string {
  const bare = value.replace(/^urn:uuid:/, "").replace(/^urn:[^:]+:/, "");
  return bare.length <= RZP_ID_MAX ? bare : bare.slice(-RZP_ID_MAX);
}

export class RazorpayPaymentRail implements PaymentRail {
  constructor(private readonly client: RazorpayClient) {}

  async createOrder(request: OrderRequest): Promise<OrderRef> {
    const body = {
      amount: request.amount.paise,
      currency: request.amount.currency,
      receipt: railReference(request.receipt),
      notes: request.notes,
    };
    const response = await this.client.request<unknown>(
      "razorpay.orders.create",
      "POST",
      "/orders",
      body,
    );
    if (!isRazorpayOrderResponse(response)) {
      throw new DomainError("SCHEMA_VIOLATION");
    }
    return toOrderRef(response);
  }

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    const body = {
      amount: request.amount.paise,
      currency: request.amount.currency,
      description: request.description,
      reference_id: railReference(request.referenceId),
      // Verified live (`docs/api/payments/payment-links/create-standard`):
      // Payment Links has no `order_id` request field — it is not a
      // sub-resource of Orders. The domain's `orderId` is carried in `notes`
      // instead, so dashboard reconciliation can still find it.
      notes: { covenant_order_id: request.orderId },
    };
    const response = await this.client.request<unknown>(
      "razorpay.payment_links.create",
      "POST",
      "/payment_links/",
      body,
    );
    if (!isRazorpayPaymentLinkResponse(response)) {
      throw new DomainError("SCHEMA_VIOLATION");
    }
    return toPaymentLink(response);
  }

  async getPayment(paymentId: string): Promise<PaymentSnapshot> {
    const response = await this.client.request<unknown>(
      "razorpay.payments.get",
      "GET",
      `/payments/${paymentId}`,
      null,
    );
    if (!isRazorpayPaymentResponse(response)) {
      throw new DomainError("SCHEMA_VIOLATION");
    }
    return toPaymentSnapshot(response);
  }

  async paymentsForOrder(orderId: string): Promise<readonly PaymentSnapshot[]> {
    const response = await this.client.request<unknown>(
      "razorpay.orders.payments",
      "GET",
      `/orders/${orderId}/payments`,
      null,
    );
    if (!isRazorpayPaymentCollection(response)) {
      throw new DomainError("SCHEMA_VIOLATION");
    }
    return response.items.map((item) => {
      if (!isRazorpayPaymentResponse(item)) {
        throw new DomainError("SCHEMA_VIOLATION");
      }
      return toPaymentSnapshot(item);
    });
  }
}
