import type { CatalogSku, IntentDraftFields } from "@covenant/agents";
import { ceilingFor, demandsRefund } from "@covenant/agents";

export interface DraftPlanConfig {
  readonly merchantIss: string;
  readonly capPaise: number;
  readonly currency: string;
}

const MAX_DESCRIPTION = 400;

const MAX_REQUEST_ECHO = 240;

/**
 * A *monthly* envelope sized at twice one cart is not a month's budget, it is
 * a two-purchase limit wearing a month's label — and it read as a bug rather
 * than a bound: three ordinary purchases in, the gateway refused a perfectly
 * legitimate cart with ENVELOPE_EXCEEDED. Ten keeps the envelope a real
 * constraint while letting a month look like a month. It is still narrower
 * than anything the user can sign for themselves.
 */
const ENVELOPE_MULTIPLIER = 10;

/** Only the bounds this draft actually carries. */
function descriptionOf(
  request: string,
  sku: CatalogSku,
  ceiling: number,
  refundable: boolean,
): string {
  const rupees = Math.round(ceiling / 100).toLocaleString("en-IN");
  const terms = [`at most ₹${rupees}`];
  // "uncategorised" is a shelf's shrug, not a term anybody signed for.
  if (sku.category !== "" && sku.category !== "uncategorised") {
    terms.push(sku.category);
  }
  if (refundable) {
    terms.push("refundable only");
  }
  // The first line is the want; everything after it is conversation. The
  // whole join once baked "i want to revert and choose different product"
  // into a mandate's own description.
  const echo = (request.trim().split("\n")[0] ?? "")
    .trim()
    .slice(0, MAX_REQUEST_ECHO);
  return `${echo}: ${terms.join(", ")}.`.slice(0, MAX_DESCRIPTION);
}

/**
 * A live Razorpay item carries no category — `skuOfItem` refuses to invent one
 * — and a category envelope over an empty string is a period budget naming
 * nothing, which `draftSchemaFor` rejects outright. No category, no envelope:
 * the cap and the SKU list still bound the purchase.
 */
function envelopesFor(
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

/**
 * The bounds the user is asked to sign. Every one of them is a *narrowing*:
 * one merchant, one SKU, one category envelope and a hard cap. Nothing here is
 * derived from catalog prose — the SKU chosen from the request is a pointer to
 * a listing, never a belief taken from one.
 *
 * `requires_refundability` follows the sentence rather than being a literal
 * `true`. Drafted unconditionally it signed a term over requests that never
 * mentioned returns, and then refused every cart from a merchant who attests
 * no returns policy — a refusal about something the shopper never asked for.
 * Asked for, it still binds, and a merchant who will not attest it still loses
 * the sale.
 */
export function draftFieldsFor(
  request: string,
  sku: CatalogSku,
  config: DraftPlanConfig,
): IntentDraftFields {
  // The tighter of what the operator allows and what the shopper said. Drafting
  // the cap alone signed "at most 5000.00 INR" over a request that asked for
  // under 4000 — a mandate looser than the sentence that produced it.
  const ceiling = ceilingFor(request, config.capPaise);
  const refundable = demandsRefund(request);
  return {
    natural_language_description: descriptionOf(
      request,
      sku,
      ceiling,
      refundable,
    ),
    max_amount_paise: ceiling,
    currency: config.currency,
    merchants: [config.merchantIss],
    skus: [sku.sku],
    requires_refundability: refundable,
    envelopes: envelopesFor(sku, ceiling),
  };
}
