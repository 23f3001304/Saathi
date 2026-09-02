import type { Clock } from "@covenant/domain";

import type { IntentDraft, IntentDraftDefaults } from "./intent-draft-fields.js";
import { expiryAt } from "./intent-draft-fields.js";

/**
 * A draft for one open-web listing, built from the card the shopper tapped
 * rather than judged against the catalog: the catalog judge refused every web
 * product as "no product this catalog sells", which is true and beside the
 * point. The ceiling is the carded price itself, what they saw is exactly
 * what they authorise, and the description names the listing and the shop.
 */
export function listingDraftOf(
  listing: {
    readonly title: string;
    readonly pricePaise: number | null;
    readonly merchant: string;
  },
  defaults: IntentDraftDefaults,
  clock: Clock,
): IntentDraft {
  const cap = listing.pricePaise ?? defaults.maxAmountPaise;
  const rupees = Math.round(cap / 100).toLocaleString("en-IN");
  const expiry = expiryAt(clock, defaults.ttlSeconds);
  return {
    naturalLanguageDescription:
      `${listing.title.slice(0, 200)}: at most ₹${rupees}, ` +
      `on ${listing.merchant}.`,
    bounds: {
      allowance: {
        reason: "one_time",
        max_amount: cap,
        currency: defaults.currency,
        expires_at: expiry,
        merchant_id: null,
        checkout_session_id: null,
      },
      merchants: null,
      skus: null,
      requires_refundability: false,
      user_cart_confirmation_required: defaults.userCartConfirmationRequired,
      human_present: defaults.humanPresent,
      intent_expiry: expiry,
      envelopes: [],
      cooloff: defaults.cooloff,
      blackout_hours: null,
      credit_policy: defaults.creditPolicy,
      share_aggregates: defaults.shareAggregates,
    },
  };
}
