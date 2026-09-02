import type { CatalogSku, ShelfView, TurnPlan } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { OptionRowData } from "../http/chat-beat.js";
import { askTurn, splitAsk } from "../purchase/ask-step.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";
import { matchCatalog } from "./catalog-match.js";

/** Enough to see what the shop has; more than this is a catalog dump. */
const SHOWN = 4;

/**
 * DECISION: nothing in this file writes a sentence. A catalog miss reaches the
 * model as `matches: 0` on its own tool result (`TurnPlanCollector`), and the
 * model says what that means in the shopper's language. The harness used to
 * append "This shop has nothing like that" here, which in a Hindi voice
 * session was welded, in English, onto the end of the agent's Hindi sentence
 * and read aloud. Harness-authored is a rule about the facts — the labels and
 * the prices below — not about the prose around them.
 */

/**
 * The card row, built from the catalog rather than from merchant prose.
 *
 * `rating` and `deliveryDays` are zero because no shelf this reads — the frozen
 * demo catalog or the merchant's live items — carries either, and inventing a
 * rating for a shoe is exactly the kind of confident fiction this system exists
 * to make impossible.
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

/**
 * A turn the model decided was a look, not a purchase. It signs nothing,
 * quotes nothing and drafts no intent — the only thing that happens is that
 * the shopper is shown what is there.
 *
 * DECISION: the listing goes out as an `options` beat and not as prose. The
 * agent used to write the shop's stock into a sentence — "Kolam Run Gc9 road
 * shoe, UK 8 — ₹1,999 (footwear); cushioned socks, 3 pack — ₹499 (apparel)" —
 * directly above the cards rendering the same rows at the same prices. The
 * cards are the presentation; what the agent says is what it did and what it
 * thinks, never a second reading of the table underneath it. Prices still come
 * off the catalog and merchant prose still never reaches the screen.
 *
 * DECISION: one bubble, and only the model's own sentence. Two beats would be
 * two things said about one act, which is the shape that had every
 * conversational turn printing itself twice.
 */
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

export function browseTurn(
  parts: BrowseParts,
  base: PurchaseResult,
  plan: TurnPlan,
): PurchaseResult {
  const query = plan.query ?? base.request;
  const shelf = parts.shelf.current();
  const found = matchCatalog(shelf, query).slice(0, SHOWN);
  // A sentence that counts the shop wrongly is dropped and the cards stand on
  // their own: they are read off the shelf, so the shopper still sees what is
  // there rather than a number the agent made up about it.
  const whole = plan.reply.trim();
  // Evidence first, ask second. A browse that ends "which one?" reported
  // something true and then wanted an answer, and the two belong on different
  // surfaces: the sentence and the cards in the transcript, the question at
  // the composer, in that order and never the other way round.
  const { said, question } = splitAsk(whole);
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
    query,
    shown: found.length,
  });
  return settle(parts, base, said, question, plan.replies ?? []);
}
