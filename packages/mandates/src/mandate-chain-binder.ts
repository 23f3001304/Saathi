import type { MandateEnvelope, ReasonCode, Sha256Ref } from "@covenant/domain";
import { sha256Hex, toSha256Ref } from "@covenant/domain";

import { cartHashOf } from "./cart-hash.js";
import type { CartSubject } from "./vc/cart-subject.js";
import type { PaymentSubject } from "./vc/payment-subject.js";

/**
 * The hash links intent→cart→payment (+ digest). Every link is a hash of the
 * **compact JWS**, not of the decoded body: re-serialising a body to check a
 * link would reintroduce the canonicalisation ambiguity the chain exists to
 * remove (§6.3, §6.4).
 */
export class MandateChainBinder {
  jwtHashRef(compactJws: string): Sha256Ref {
    return toSha256Ref(sha256Hex(compactJws));
  }

  /** Cart must name the intent it was built from, by jti and by hash. */
  cartToIntent(cart: CartSubject, intent: MandateEnvelope): ReasonCode | null {
    if (cart.intent_mandate_jti !== intent.jti) {
      return "MANDATE_MALFORMED";
    }
    if (cart.intent_mandate_hash !== toSha256Ref(intent.jwtHash)) {
      return "MANDATE_MALFORMED";
    }
    return null;
  }

  /**
   * `cart_hash` must equal `sha256(canonicalize(payment_request))`; the third
   * value, `merchant_authorization.cart_hash`, is checked where that inner JWT
   * is verified (§6.6).
   */
  cartHashBinding(cart: CartSubject): ReasonCode | null {
    return cart.cart_hash === cartHashOf(cart.payment_request)
      ? null
      : "CART_HASH_MISMATCH";
  }

  /** Payment must carry the cart's identity, both hashes and the same digest. */
  paymentToCart(
    payment: PaymentSubject,
    cart: CartSubject,
    cartEnvelope: MandateEnvelope,
  ): ReasonCode | null {
    const bound =
      payment.cart_mandate_jti === cartEnvelope.jti &&
      payment.cart_mandate_hash === toSha256Ref(cartEnvelope.jwtHash) &&
      payment.intent_mandate_hash === cart.intent_mandate_hash &&
      payment.memory_digest === cart.memory_digest;
    return bound ? null : "MANDATE_MALFORMED";
  }

  /** A cart signed for one tenant cannot be spent inside another (§4.5). */
  tenantBinding(
    left: MandateEnvelope,
    right: MandateEnvelope,
  ): ReasonCode | null {
    return left.tenant_id === right.tenant_id ? null : "TENANT_MISMATCH";
  }
}
