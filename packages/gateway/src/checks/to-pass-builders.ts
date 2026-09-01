import type {
  CartLine,
  EnvelopeState,
  EnvelopeToPass,
  MemoryDigestToPass,
  PriceFloorToPass,
  QuoteMatchToPass,
  Remedy,
  RiskDataToPass,
  TierLabel,
} from "@covenant/domain";
import {
  CART_CONSTRUCTION_TIER_FLOOR,
  RISK_ATTESTATION_ROLES,
  RISK_SCHEMA_REF,
  belowFloorLine as lineBelowFloor,
  cartCurrency,
  floorFor,
  remainingPaise,
  tierLabel,
} from "@covenant/domain";

import type { VerdictContext } from "../verdict-context.js";

/**
 * `to_pass` construction, shared by the checks that build one. Kept out of the
 * check classes so each check file reads as its predicate list (§4.7 is the
 * contract these satisfy, and it is one table, not eight).
 */
export function riskToPass(
  remedy: Remedy,
  offending: readonly string[],
  blocked: readonly string[],
): RiskDataToPass {
  return {
    required_signer_roles: RISK_ATTESTATION_ROLES,
    schema_ref: RISK_SCHEMA_REF,
    offending_fields: offending,
    blocked_signal_types: blocked,
    remedy,
  };
}

export function memoryToPass(
  context: VerdictContext,
  remedy: Remedy,
  offending: readonly string[],
): MemoryDigestToPass {
  const byId = new Map(context.memory.entries.map((e) => [e.id, e.tier]));
  return {
    expected_digest: context.cart.memory_digest,
    computed_digest: context.memory.recomputedDigest,
    missing_ids: context.memory.missingIds,
    extra_ids: context.memory.extraIds,
    required_tier: tierLabel(CART_CONSTRUCTION_TIER_FLOOR),
    offending_entry_ids: offending,
    their_tiers: offending.map((id) => tiersOf(byId.get(id))),
    remedy,
  };
}

function tiersOf(tier: number | undefined): TierLabel {
  return tier === undefined ? "P0" : tierLabel(tier as 0 | 1 | 2 | 3);
}

export function quoteToPass(
  context: VerdictContext,
  remedy: Remedy,
): QuoteMatchToPass {
  const quote = context.cart.quote;
  const signedTotal =
    context.signedQuote?.total_paise ?? quote.quote_total_paise;
  return {
    signed_quote_total_paise: signedTotal,
    cart_total_paise: context.cartTotal.paise,
    delta_paise: context.cartTotal.paise - signedTotal,
    quote_jti: quote.quote_jti,
    quote_expiry: quote.quote_expiry,
    remedy,
  };
}

/** The cart line its merchant's own declaration forbids, if there is one. */
export function belowFloorLine(context: VerdictContext): CartLine | null {
  return lineBelowFloor(
    context.cartLines,
    context.priceFloors,
    cartCurrency(context.cart.payment_request),
  );
}

const NO_FLOOR = {
  merchant_id: "",
  sku_id: "",
  floor_paise: 0,
  list_paise: 0,
  currency: "",
  declared_at: "",
  declared_by: "",
} as const;

/**
 * The band, and how far under it the quote went. `sku_id` comes from the
 * recomputed cart lines, so the remedy names the line the merchant's own
 * declaration forbade rather than whatever the quote called itself.
 */
export function floorToPass(
  context: VerdictContext,
  remedy: Remedy,
): PriceFloorToPass {
  const line = belowFloorLine(context);
  const floor = floorFor(context.priceFloors, line?.sku ?? "") ?? NO_FLOOR;
  const quoted = line?.unitPaise ?? 0;
  return {
    sku_id: floor.sku_id,
    floor_paise: floor.floor_paise,
    list_paise: floor.list_paise,
    quoted_unit_paise: quoted,
    below_by_paise: Math.max(0, floor.floor_paise - quoted),
    currency: cartCurrency(context.cart.payment_request),
    declared_at: floor.declared_at,
    remedy,
  };
}

export function envelopeToPass(
  envelope: EnvelopeState,
  requestedPaise: number,
  remedy: Remedy,
): EnvelopeToPass {
  return {
    category: envelope.category,
    cap_paise: envelope.capPaise,
    committed_spent_paise: envelope.committedPaise,
    open_reservations_paise: envelope.openReservedPaise,
    remaining_paise: remainingPaise(envelope),
    requested_paise: requestedPaise,
    period_resets_at: envelope.resetsAt,
    oldest_reservation_expires_at: envelope.oldestReservationExpiresAt,
    remedy,
  };
}

/** An undeclared category has no envelope row, so the HNP failure reports zeroes. */
export function undeclaredEnvelopeToPass(
  category: string,
  requestedPaise: number,
  resetsAt: string,
): EnvelopeToPass {
  return {
    category,
    cap_paise: 0,
    committed_spent_paise: 0,
    open_reservations_paise: 0,
    remaining_paise: 0,
    requested_paise: requestedPaise,
    period_resets_at: resetsAt,
    oldest_reservation_expires_at: null,
    remedy: "reissue_intent",
  };
}
