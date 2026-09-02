import type { CatalogSku } from "@covenant/agents";
import { findSku } from "@covenant/agents";

import type { SignedIntent } from "./intent-flow.js";

/** The signed intent names a listing this shelf does not hold. The run fails
 *  rather than approximating: a cart for a neighbouring row is a cart for
 *  something nobody signed for. */
export class UnresolvableDraft extends Error {}

/**
 * The listing the signed intent names, resolved against the turn's shelf.
 *
 * This is the same split `PlanDraftJudge` makes one layer up, held to the
 * end: the model chose *what*, the covenant records it, and the host looks up
 * who sells it. Re-deriving the SKU from the request instead built the quote
 * for one listing while the mandate permitted another, which the gateway
 * answers with `SKU_NOT_ALLOWED` — on a cart whose total was right.
 */
export function listingFor(
  shelf: readonly CatalogSku[],
  intent: SignedIntent,
): CatalogSku {
  for (const named of intent.bounds.skus ?? []) {
    const found = findSku(shelf, named);
    if (found !== null) {
      return found;
    }
  }
  throw new UnresolvableDraft(
    "the signed intent names no listing this shop currently stocks",
  );
}
