import type { CatalogSku, IntentDraftFields } from "@covenant/agents";

export interface DraftPlanConfig {
  readonly merchantIss: string;
  readonly capPaise: number;
  readonly currency: string;
}

/**
 * A *monthly* envelope sized at twice one cart is not a month's budget, it is
 * a two-purchase limit wearing a month's label, and it read as a bug rather
 * than a bound: three ordinary purchases in, the gateway refused a perfectly
 * legitimate cart with ENVELOPE_EXCEEDED. Ten keeps the envelope a real
 * constraint while letting a month look like a month. It is still narrower
 * than anything the user can sign for themselves.
 */
const ENVELOPE_MULTIPLIER = 10;

/**
 * The one piece of drafting that is host policy in every mode: a listing's
 * category earns a monthly envelope over the ceiling. A live Razorpay item
 * carries no category, `skuOfItem` refuses to invent one, and a category
 * envelope over an empty string is a period budget naming nothing, which
 * `draftSchemaFor` rejects outright. No category, no envelope: the cap and the
 * SKU list still bound the purchase. "uncategorised" still earns its envelope:
 * it is a real monthly bound on a real listing.
 */
export function envelopesFor(
  sku: CatalogSku,
  ceiling: number,
): IntentDraftFields["envelopes"] {
  if (sku.category === "") {
    return [];
  }
  return [
    {
      category: sku.category,
      period: "month",
      cap_paise: ceiling * ENVELOPE_MULTIPLIER,
    },
  ];
}
