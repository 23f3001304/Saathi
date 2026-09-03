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
    parts.hub.emit({ kind: "picked", ref });
    return await parts.webPick.buy(ref, stated, replyLanguage);
  }
  const rebuilt = await parts.repropose(ref);
  if (rebuilt !== null) {
    parts.logger.info("purchase.pick.shop", { run_id: base.runId, ref });
    // Only once the sku resolved: a ref that rebuilt nothing was never a
    // choice, and a `picked` beat over it would arm the dock for a card the
    // shopper cannot see.
    parts.hub.emit({ kind: "picked", ref });
    return rebuilt;
  }
  parts.logger.warn("purchase.pick.unknown", { run_id: base.runId, ref });
  return unresolved(parts, base, plan);
}

/**
 * The model named something that is on no card. Its own sentence stands, in
 * the transcript, and a question it wrote beside it arms the composer under
 * it; the shell adds no sentence of its own.
 *
 * Report first, ask second, as a browse settles: a turn that filled both
 * `reply` and `question` used to lose the reply, because the question was
 * read first and it is the only thing a park carries.
 */
function unresolved(
  parts: PickParts,
  base: PurchaseResult,
  plan: TurnPlan,
): PurchaseResult {
  const asked = askedBy(plan);
  const said = asked === null ? plan.reply.trim() : reportBeside(plan);
  if (said.length > 0) {
    parts.hub.emit({ kind: "message", text: said });
  }
  if (asked === null) {
    return settled(parts, base, said);
  }
  const parked = askTurn(
    parts,
    base,
    asked,
    plan.replies ?? [],
    plan.choiceGroups ?? [],
  );
  return { ...parked, transcript: said.length > 0 ? [said, asked] : [asked] };
}

/** The reply as a report standing beside a question, which it only is when the
 *  model wrote a `question` of its own: without one `askedBy` has already
 *  taken the reply as the question, and saying it twice is two utterances. */
function reportBeside(plan: TurnPlan): string {
  const question = plan.question?.trim() ?? "";
  return question.length === 0 ? "" : plan.reply.trim();
}

/** Nothing was asked, so the model's sentence is the whole of the turn. */
function settled(
  parts: PickParts,
  base: PurchaseResult,
  said: string,
): PurchaseResult {
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
