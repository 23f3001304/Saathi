import type { PaymentRequest, Sha256Ref } from "@covenant/domain";
import { sha256RefOf } from "@covenant/domain";

/**
 * `cart_hash = sha256(canonicalize(payment_request))` (§6.3). The whole W3C
 * request is hashed, not a projection of it: hashing only the total would let a
 * merchant re-write line items, shipping options or method data after the
 * signature, which is exactly the drip-pricing move `QuoteMatchCheck` kills.
 */
export function cartHashOf(request: PaymentRequest): Sha256Ref {
  return sha256RefOf(request);
}
