import type { ReasonCode, Remedy, ToPass, Verdict } from "@covenant/domain";
import {
  fail,
  isBefore,
  pass,
  tierAtLeast,
  toIsoTimestamp,
} from "@covenant/domain";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";
import {
  belowFloorLine,
  floorToPass,
  quoteToPass,
} from "./to-pass-builders.js";

/** A merchant attestation is P2; a floor, so a user-confirmed quote also clears. */
const SIGNED_QUOTE_TIER_FLOOR = 2;

interface Predicate {
  readonly code: ReasonCode;
  readonly holds: (context: VerdictContext) => boolean;
  readonly toPass: (context: VerdictContext, remedy: Remedy) => ToPass;
  readonly remedy: Remedy;
}

function quotePredicate(
  code: ReasonCode,
  remedy: Remedy,
  holds: (context: VerdictContext) => boolean,
): Predicate {
  return { code, remedy, holds, toPass: quoteToPass };
}

/**
 * §8.4 check 6, in order. Three independently sourced hashes must agree
 * (recomputed, cart-signed, merchant-authorization-signed) and the total must
 * equal the signed quote **exactly** — no tolerance, because a tolerance is a
 * budget a drip-pricing merchant will spend.
 *
 * `QUOTE_BELOW_FLOOR` is the mirror of `CART_EXCEEDS_INTENT_CAP`: the buyer's
 * ceiling is checked against the cart, and the seller's floor is checked
 * against it too, from a declaration this gateway holds rather than from
 * anything the seller's agent said on this request.
 */
const PREDICATES: readonly Predicate[] = [
  quotePredicate(
    "CART_HASH_MISMATCH",
    "renegotiate",
    (context) => context.computedCartHash === context.cart.cart_hash,
  ),
  quotePredicate(
    "CART_HASH_MISMATCH",
    "renegotiate",
    (context) => context.merchantAuth.cartHash === context.cart.cart_hash,
  ),
  quotePredicate(
    "CART_QUOTE_MISMATCH",
    "renegotiate",
    (context) =>
      context.signedQuote !== null &&
      tierAtLeast(context.signedQuote.tier, SIGNED_QUOTE_TIER_FLOOR),
  ),
  quotePredicate(
    "CART_QUOTE_MISMATCH",
    "renegotiate",
    (context) => context.cartTotal.paise === context.signedQuote?.total_paise,
  ),
  {
    code: "QUOTE_BELOW_FLOOR",
    remedy: "request_new_quote",
    holds: (context) => belowFloorLine(context) === null,
    toPass: floorToPass,
  },
  quotePredicate("QUOTE_EXPIRED", "request_new_quote", (context) =>
    isLive(context),
  ),
];

function isLive(context: VerdictContext): boolean {
  const now = toIsoTimestamp(context.now);
  const reservationExpiry =
    context.stockReservation?.expires_at ??
    context.cart.quote.reservation_expires_at;
  return (
    isBefore(now, context.cart.quote.quote_expiry) &&
    isBefore(now, reservationExpiry)
  );
}

/**
 * Drip pricing and an LLM-hallucinated line item die on the same code path.
 * `CART_QUOTE_MISMATCH` feeds `merchant_trust.quote_mismatches`;
 * `STOCK_CONFLICT` is raised in the commit phase, never here, and deliberately
 * does not (§5.2 d) — losing a race for the last unit is not misbehaviour.
 */
export class QuoteMatchCheck implements VerdictCheck {
  readonly id = "quote_match" as const;

  run(context: VerdictContext): Verdict {
    const broken = PREDICATES.find((predicate) => !predicate.holds(context));
    return broken === undefined
      ? pass(this.id)
      : fail(this.id, broken.code, broken.toPass(context, broken.remedy));
  }
}
