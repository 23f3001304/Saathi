import type {
  CartMandate,
  IntentMandate,
  MandateEnvelope,
  PaymentMandate,
  ReasonCode,
  ToPass,
} from "@covenant/domain";
import { DomainError } from "@covenant/domain";

import type { CartSubject } from "./vc/cart-subject.js";
import type { IntentSubject } from "./vc/intent-subject.js";
import type { PaymentSubject } from "./vc/payment-subject.js";

/**
 * A typed result, not an exception: chain verification answers a question the
 * caller asked, and "this credential does not verify" is an answer (§4.6). The
 * gateway turns a rejection into a 200 verdict body with zero seals (§8.1).
 */
export type ChainVerification<T> =
  | { readonly status: "verified"; readonly value: T }
  | {
      readonly status: "rejected";
      readonly reasonCode: ReasonCode;
      readonly toPass: ToPass | null;
    };

export function verified<T>(value: T): ChainVerification<T> {
  return { status: "verified", value };
}

export function rejected<T>(
  reasonCode: ReasonCode,
  toPass: ToPass | null = null,
): ChainVerification<T> {
  return { status: "rejected", reasonCode, toPass };
}

/**
 * Anything that escapes as a non-`DomainError` is a bug, not a policy outcome,
 * so it reports as `MANDATE_MALFORMED` rather than leaking a stack to a caller.
 */
export function rejectedFrom<T>(cause: unknown): ChainVerification<T> {
  return cause instanceof DomainError
    ? rejected(cause.reasonCode, cause.toPass)
    : rejected("MANDATE_MALFORMED");
}

export interface VerifiedChain {
  readonly intent: IntentMandate;
  readonly cart: CartMandate;
}

export function intentMandateOf(
  envelope: MandateEnvelope,
  subject: IntentSubject,
): IntentMandate {
  return { ...envelope, kind: "intent", ...subject };
}

export function cartMandateOf(
  envelope: MandateEnvelope,
  subject: CartSubject,
): CartMandate {
  return { ...envelope, kind: "cart", ...subject };
}

export function paymentMandateOf(
  envelope: MandateEnvelope,
  subject: PaymentSubject,
): PaymentMandate {
  return { ...envelope, kind: "payment", ...subject };
}
