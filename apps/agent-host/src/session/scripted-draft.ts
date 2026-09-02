import type { CatalogSku, IntentDraftFields } from "@covenant/agents";

import type { DraftPlanConfig } from "../judge/draft-plan.js";
import { envelopesFor } from "../judge/draft-plan.js";
import { ceilingFor, demandsRefund } from "./scripted-reading.js";

const MAX_DESCRIPTION = 400;

const MAX_REQUEST_ECHO = 240;

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
 * The scripted fake model's draft: the bounds the user is asked to sign when
 * no model is running. Every one of them is a *narrowing*: one merchant, one
 * SKU, one category envelope and a hard cap that is the tighter of the
 * operator's and the sentence's. Live mode drafts from `propose_purchase`
 * instead (`PlanDraftJudge`); nothing here runs there.
 */
export function draftFieldsFor(
  request: string,
  sku: CatalogSku,
  config: DraftPlanConfig,
): IntentDraftFields {
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
