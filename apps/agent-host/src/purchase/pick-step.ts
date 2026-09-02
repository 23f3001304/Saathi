import type { TurnPlan } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { WebListingView } from "../browser/web-listing.js";
import type { BeatHub } from "../http/beat-hub.js";
import { askedBy, askTurn } from "./ask-step.js";
import type { PurchaseResult } from "./purchase-result.js";

export interface PickParts {
  readonly hub: BeatHub;
  /** The cards on the table for this conversation, as the shell carded them. */
  readonly offered: { current(): readonly WebListingView[] };
  /** The same errand a tapped open-web card drives. */
  readonly webPick: {
    buy(
      ref: string,
      stated: readonly string[],
      replyLanguage: string | null,
    ): Promise<PurchaseResult>;
  };
  /** The cart rebuilt for a platform sku; `null` when no proposal stands. */
  readonly repropose: (ref: string) => Promise<PurchaseResult | null>;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/**
 * The shopper naming one of the cards on the table, in words.
 *
 * DECISION: the model decides that a sentence is a pick and which card it
 * names; it read the cards through `see_state`. A word-overlap matcher used to
 * decide this before the planner saw the sentence, and asked a canned "which
 * of those?" when two cards tied. Now the ref is the model's, the routing is
 * the same two paths a tap takes, and a ref that is on no card is answered
 * with whatever the model wrote about it, which is usually the question.
 */
export async function pickTurn(
  parts: PickParts,
  base: PurchaseResult,
  plan: TurnPlan,
  stated: readonly string[],
  replyLanguage: string | null,
): Promise<PurchaseResult> {
  const ref = plan.ref ?? "";
  if (parts.offered.current().some((row) => row.ref === ref)) {
    parts.logger.info("purchase.pick.web", { run_id: base.runId, ref });
    return await parts.webPick.buy(ref, stated, replyLanguage);
  }
  const rebuilt = await parts.repropose(ref);
  if (rebuilt !== null) {
    parts.logger.info("purchase.pick.shop", { run_id: base.runId, ref });
    return rebuilt;
  }
  parts.logger.warn("purchase.pick.unknown", { run_id: base.runId, ref });
  return unresolved(parts, base, plan);
}

/** The model named something that is on no card. Its own sentence stands, at
 *  the composer when it asked, in the transcript when it did not; the shell
 *  adds no sentence of its own. */
function unresolved(
  parts: PickParts,
  base: PurchaseResult,
  plan: TurnPlan,
): PurchaseResult {
  const asked = askedBy(plan);
  if (asked !== null) {
    return askTurn(
      parts,
      base,
      asked,
      plan.replies ?? [],
      plan.choiceGroups ?? [],
    );
  }
  const said = plan.reply.trim();
  if (said.length > 0) {
    parts.hub.emit({ kind: "message", text: said });
  }
  parts.hub.emit({
    kind: "outcome",
    state: "answered",
    txnId: null,
    detail: "pick_unknown",
  });
  return {
    ...base,
    status: "answered",
    transcript: said.length > 0 ? [said] : [],
  };
}
