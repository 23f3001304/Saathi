import type { EventPayload } from "@covenant/domain";
import { floorFor } from "@covenant/domain";

import type { VerdictContext } from "./verdict-context.js";

/**
 * What a settlement inside a declared band actually was: what the buyer asked,
 * what the merchant signed, what the cart settled at, and the floor it was
 * measured against.
 *
 * `null` when there is nothing to record — no declared band, or a line that
 * simply settled at list. A merchant reading their ledger should find a row
 * only where their floor did something, and a buyer reading it should be able
 * to see the settled price never moved upward.
 *
 * Every number here is a gateway-held fact or a merchant-attested one: the
 * band comes from the floor store, the ask from the P2 quote attestation, and
 * the settled price from lines recomputed out of the payment request.
 */
export function negotiationPayload(
  context: VerdictContext,
): EventPayload | null {
  const settled = context.cartLines
    .map((line) => ({ line, floor: floorFor(context.priceFloors, line.sku) }))
    .find(
      (row) => row.floor !== null && row.line.unitPaise < row.floor.list_paise,
    );
  const floor = settled?.floor;
  if (settled === undefined || floor === undefined || floor === null) {
    return null;
  }
  const line = settled.line;
  return {
    merchant_id: floor.merchant_id,
    sku_id: line.sku,
    qty: line.qty,
    currency: context.cartTotal.currency,
    list_paise: floor.list_paise,
    floor_paise: floor.floor_paise,
    asked_unit_paise: context.signedQuote?.asked_unit_paise ?? null,
    settled_unit_paise: line.unitPaise,
    saved_paise: (floor.list_paise - line.unitPaise) * line.qty,
    cleared_floor: line.unitPaise >= floor.floor_paise,
    quote_jti: context.cart.quote.quote_jti,
    floor_declared_at: floor.declared_at,
  };
}
