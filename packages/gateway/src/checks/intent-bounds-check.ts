import type {
  IntentBoundsToPass,
  ReasonCode,
  Remedy,
  Verdict,
} from "@covenant/domain";
import {
  confirmationSatisfied,
  currencyMatches,
  effectiveExpiry,
  fail,
  merchantAllowed,
  merchantIdOf,
  notExpired,
  pass,
  refundabilitySatisfied,
  skusAllowed,
  toIsoTimestamp,
  withinCap,
} from "@covenant/domain";

import type { VerdictCheck } from "../verdict-check.js";
import type { VerdictContext } from "../verdict-context.js";

type Predicate = {
  readonly code: ReasonCode;
  readonly holds: (context: VerdictContext) => boolean;
};

/**
 * The seven predicates of §8.4 check 1, in the order the reason codes are
 * listed there. Order is the narrative the audit UI reads back, so it is data,
 * not an `if` ladder — and each predicate delegates to `domain/intent-bounds`,
 * which is the only place a bound is interpreted.
 */
const PREDICATES: readonly Predicate[] = [
  {
    code: "CART_EXCEEDS_INTENT_CAP",
    holds: (context) => withinCap(context.intent, context.cartTotal),
  },
  {
    code: "CURRENCY_MISMATCH",
    holds: (context) => currencyMatches(context.intent, context.cartTotal),
  },
  {
    code: "INTENT_EXPIRED",
    holds: (context) =>
      notExpired(
        context.intent,
        context.intent.exp,
        toIsoTimestamp(context.now),
      ),
  },
  {
    code: "MERCHANT_NOT_ALLOWED",
    holds: (context) =>
      merchantAllowed(context.intent, merchantIdOf(context.cart)),
  },
  {
    code: "SKU_NOT_ALLOWED",
    holds: (context) => skusAllowed(context.intent, context.cartLines),
  },
  {
    code: "REFUNDABILITY_REQUIRED",
    holds: (context) =>
      refundabilitySatisfied(context.intent, context.cart.payment_request),
  },
  {
    code: "CONFIRMATION_REQUIRED",
    holds: (context) =>
      confirmationSatisfied(context.intent, context.intent.role === "user"),
  },
];

const REMEDY_OF: Partial<Record<ReasonCode, Remedy>> = {
  CART_EXCEEDS_INTENT_CAP: "reduce_cart_or_reissue_intent",
};

/**
 * AM1 — cart ⊆ intent. Catalog text can never *raise* a bound: this check
 * reads only the signed Intent Mandate and the recomputed cart total, and
 * there is no code path from merchant content to either (§8.4 check 1).
 */
export class IntentBoundsCheck implements VerdictCheck {
  readonly id = "intent_bounds" as const;

  run(context: VerdictContext): Verdict {
    const failures = PREDICATES.filter(
      (predicate) => !predicate.holds(context),
    ).map((predicate) => predicate.code);
    const headline = failures[0];
    if (headline === undefined) {
      return pass(this.id);
    }
    return fail(this.id, headline, toPassFor(context, headline, failures));
  }
}

/** All failures are listed, not just the headline, so one round trip fixes all. */
function toPassFor(
  context: VerdictContext,
  headline: ReasonCode,
  failures: readonly ReasonCode[],
): IntentBoundsToPass {
  const allowance = context.intent.allowance;
  const cartPaise = context.cartTotal.paise;
  return {
    max_amount_paise: allowance.max_amount,
    cart_amount_paise: cartPaise,
    over_by_paise: Math.max(0, cartPaise - allowance.max_amount),
    currency: context.cartTotal.currency,
    expires_at: effectiveExpiry(context.intent, context.intent.exp),
    now: toIsoTimestamp(context.now),
    allowed_merchants: context.intent.merchants,
    allowed_skus: context.intent.skus,
    also_failed: failures.slice(1),
    remedy: REMEDY_OF[headline] ?? "reissue_intent",
  };
}
