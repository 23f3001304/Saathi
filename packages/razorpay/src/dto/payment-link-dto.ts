import type { PaymentLink } from "@covenant/domain";

/**
 * `POST /v1/payment_links/` response, verified live
 * (`docs/api/payments/payment-links/create-standard`): only `id` and
 * `short_url` are load-bearing for the domain's `PaymentLink` shape.
 */
export interface RazorpayPaymentLinkResponse {
  readonly id: string;
  readonly short_url: string;
}

export function isRazorpayPaymentLinkResponse(
  value: unknown,
): value is RazorpayPaymentLinkResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return typeof v["id"] === "string" && typeof v["short_url"] === "string";
}

export function toPaymentLink(response: RazorpayPaymentLinkResponse): PaymentLink {
  return { linkId: response.id, shortUrl: response.short_url };
}
