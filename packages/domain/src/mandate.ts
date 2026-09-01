import type { Sha256Hex, Sha256Ref } from "./hash-ref.js";
import type { IntentBounds } from "./intent-bounds.js";
import type { IsoTimestamp } from "./iso-timestamp.js";
import type { MemoryDigestAlg } from "./memory-entry.js";
import type { TierLabel } from "./memory-type.js";
import type { PaymentRequest } from "./payment-request.js";
import type { CartQuoteRef } from "./quote.js";
import type { RiskData } from "./risk-signal.js";
import type { MandateRole } from "./trust-role.js";
import type { VerdictSeal } from "./verdict.js";

/** Registered JWT claims plus what verification established (§6.1, §8.2). */
export interface MandateEnvelope {
  /** `urn:uuid:<uuid v4>` — the jti IS the nonce, one presentation only. */
  readonly jti: string;
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly iat: IsoTimestamp;
  readonly nbf: IsoTimestamp;
  readonly exp: IsoTimestamp;
  readonly kid: string;
  readonly role: MandateRole;
  /** sha256 of the compact JWS — the chain-binding target. */
  readonly jwtHash: Sha256Hex;
  readonly tenant_id: string;
  readonly ap2_extension_uri: string;
}

/** Signed by the **user** key (§6.2). */
export interface IntentMandate extends MandateEnvelope, IntentBounds {
  readonly kind: "intent";
  readonly id: string;
  readonly natural_language_description: string;
  readonly agent_instance_id: string;
}

/** Signed by the **merchant** key (§6.3). */
export interface CartMandate extends MandateEnvelope {
  readonly kind: "cart";
  readonly id: string;
  readonly intent_mandate_jti: string;
  readonly intent_mandate_hash: Sha256Ref;
  readonly payment_request: PaymentRequest;
  readonly cart_hash: Sha256Ref;
  /** Inner AP2 JWT over `cart_hash` (§6.6). */
  readonly merchant_authorization: string;
  readonly memory_digest: Sha256Ref;
  readonly memory_digest_alg: MemoryDigestAlg;
  readonly memory_entry_ids: readonly string[];
  readonly memory_tier_floor: TierLabel;
  readonly risk_data: RiskData | null;
  readonly quote: CartQuoteRef;
  readonly agent_instance_id: string;
}

/** Issued and signed by the **gateway** key after the pipeline runs (§6.4). */
export interface PaymentMandate extends MandateEnvelope {
  readonly kind: "payment";
  readonly id: string;
  readonly cart_mandate_jti: string;
  readonly cart_mandate_hash: Sha256Ref;
  readonly intent_mandate_hash: Sha256Ref;
  readonly memory_digest: Sha256Ref;
  readonly amount: number;
  readonly currency: string;
  readonly merchant_id: string;
  readonly payment_token: string;
  readonly agent_instance_id: string;
  readonly verdicts: readonly VerdictSeal[];
  readonly execute_not_before: IsoTimestamp;
  readonly envelope_reservation_id: string | null;
  /** `null` in the draft and on the HNP path (§6.5). */
  readonly user_authorization: string | null;
}

export type Mandate = IntentMandate | CartMandate | PaymentMandate;

export type MandateKind = Mandate["kind"];

export const MANDATE_STATUSES = [
  "issued",
  "verified",
  "rejected",
  "held",
  "executed",
  "expired",
  "cancelled",
] as const;

export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/** The cart's merchant is its issuer; there is no second place to look. */
export function merchantIdOf(cart: CartMandate): string {
  return cart.iss;
}

export interface MandateVisitor<T> {
  intent(mandate: IntentMandate): T;
  cart(mandate: CartMandate): T;
  payment(mandate: PaymentMandate): T;
}

export function matchMandate<T>(
  mandate: Mandate,
  visitor: MandateVisitor<T>,
): T {
  switch (mandate.kind) {
    case "intent":
      return visitor.intent(mandate);
    case "cart":
      return visitor.cart(mandate);
    case "payment":
      return visitor.payment(mandate);
    default:
      return assertUnreachableMandate(mandate);
  }
}

/** Adding a member to `Mandate` without handling it above is a compile error. */
export function assertUnreachableMandate(mandate: never): never {
  throw new TypeError(`Unhandled mandate kind: ${JSON.stringify(mandate)}`);
}
