import type { CatalogSku, ShelfView, TurnPlan } from "@covenant/agents";
import { findSku } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { OptionRowData } from "../http/chat-beat.js";
import { askTurn, splitAsk } from "../purchase/ask-step.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";

/**
 * DECISION: nothing in this file writes a sentence, and nothing in it judges
 * one. The shell used to pick the rows itself, by token overlap over the
 * shopper's own words, and showed those regardless of what the model chose
 * to say. Now the model reads the shelf through `see_shelf` and names the
 * skus it would show; the cards are those rows, in that order, and the
 * collector already refuses a sku the shelf does not hold or a count over
 * the schema's bound before this file ever sees the plan.
 */

/**
 * The card row, built from the catalog rather than from merchant prose.
 *
 * `rating` and `deliveryDays` are zero because no shelf this reads carries
 * either, and inventing a rating for a shoe is exactly the kind of confident
 * fiction this system exists to make impossible.
 */
export function browseRows(
  found: readonly CatalogSku[],
  merchantId: string,
): readonly OptionRowData[] {
  return found.map((item) => ({
    id: item.sku,
    sku: item.sku,
    title: item.label,
    pricePaise: item.listPricePaise,
    rating: 0,
    deliveryDays: 0,
    merchant: merchantId,
    ...(item.imageUrl === null ? {} : { imageUrl: item.imageUrl }),
  }));
}

export interface BrowseParts {
  readonly hub: BeatHub;
  readonly shelf: ShelfView;
  readonly merchantId: string;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/** The rows the model named, in the order it named them. A sku the shelf does
 *  not hold is skipped: the collector already refused it, so this is the
 *  defensive half of one rule, not a second judgement. */
function rowsFor(
  shelf: readonly CatalogSku[],
  skus: readonly string[],
): readonly CatalogSku[] {
  return skus.flatMap((sku) => {
    const row = findSku(shelf, sku);
    return row === null ? [] : [row];
  });
}

/** A browse that asked ends parked; one that did not ends answered. Either
 *  way the sentence it did commit is the transcript's. */
function settle(
  parts: BrowseParts,
  base: PurchaseResult,
  said: string,
  question: string | null,
  replies: readonly string[],
): PurchaseResult {
  const transcript = said.length > 0 ? [said] : [];
  if (question !== null) {
    const parked = askTurn(parts, base, question, replies);
    return { ...parked, transcript: [...transcript, question] };
  }
  parts.hub.emit({
    kind: "outcome",
    state: "answered",
    txnId: null,
    detail: "browse",
  });
  return { ...base, status: "answered", transcript };
}

/**
 * A turn the model decided was a look, not a purchase. It signs nothing,
 * quotes nothing and drafts no intent: the only thing that happens is that
 * the shopper is shown the rows the model chose.
 *
 * Evidence first, ask second. A browse that ends "which one?" reported
 * something true and then wanted an answer, and the two belong on different
 * surfaces: the sentence and the cards in the transcript, the question at
 * the composer, in that order and never the other way round.
 */
export function browseTurn(
  parts: BrowseParts,
  base: PurchaseResult,
  plan: TurnPlan,
): PurchaseResult {
  const skus = plan.skus ?? [];
  const found = rowsFor(parts.shelf.current(), skus);
  const { said, question } = splitAsk(plan.reply.trim());
  if (said.length > 0) {
    parts.hub.emit({ kind: "message", text: said });
  }
  if (found.length > 0) {
    parts.hub.emit({
      kind: "options",
      options: browseRows(found, parts.merchantId),
    });
  }
  parts.logger.info("purchase.browsed", {
    run_id: base.runId,
    named: skus.length,
    shown: found.length,
  });
  return settle(parts, base, said, question, plan.replies ?? []);
}
