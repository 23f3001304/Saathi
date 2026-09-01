import type { ShelfView, TurnPlan } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import { miscountsShelf } from "../judge/shelf-claim.js";
import { askedBy, askTurn } from "./ask-step.js";
import type { PurchaseResult } from "./purchase-result.js";

/**
 * A turn the model decided was conversation. It emits what the agent said and
 * the question it decided it needed, and returns before anything is drafted —
 * so no intent exists, no mandate is signed and nothing reaches the ledger.
 *
 * The prose goes out as `message` beats and nothing else does: what the agent
 * *says* is a bubble, what it *does* is an activity pill, and a tool call's
 * arguments are neither.
 */
/** The question only earns its own sentence when the reply did not already ask
 *  one; otherwise the reply is the whole utterance. */
function answerLine(plan: TurnPlan): string {
  const reply = plan.reply.trim();
  const question = plan.question?.trim() ?? "";
  if (question === "") return reply;
  if (reply === "") return question;
  return reply.endsWith("?") ? reply : `${reply} ${question}`;
}

export interface AnswerParts {
  readonly hub: BeatHub;
  readonly shelf: ShelfView;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/**
 * The harness's own sentence for an answer that counted this shop wrongly.
 *
 * DECISION: the model's sentence is dropped, not corrected. A turn that told
 * the shopper there were "two matching navy cotton kurtas" at a shop holding
 * one was asking them to choose between a real listing and one that does not
 * exist — and it was stored in `ConversationMemory`, so the next turn would
 * have read it back as something the shopper had been told. Saying nothing
 * about the shelf is recoverable; saying something false about it is not.
 */
export const MISCOUNTED_SHELF =
  "I described this shop's stock wrongly just then, so I have not said it. " +
  "Ask me again and I will read the shelf before I answer.";

/** The bubble, the outcome and the record — everything a turn that did not ask
 *  still has to emit. */
function saidTurn(
  parts: AnswerParts,
  base: PurchaseResult,
  plan: TurnPlan,
  said: string,
  wrong: boolean,
): PurchaseResult {
  const lines = [wrong ? MISCOUNTED_SHELF : said].filter(
    (line) => line.length > 0,
  );
  for (const text of lines) {
    parts.hub.emit({
      kind: "message",
      text,
      ...(wrong ? { variant: "system" } : {}),
    });
  }
  parts.hub.emit({
    kind: "outcome",
    state: "answered",
    txnId: null,
    detail: plan.action,
  });
  parts.logger.info("purchase.answered", {
    run_id: base.runId,
    action: plan.action,
  });
  return { ...base, status: "answered", transcript: lines };
}

export function answerTurn(
  parts: AnswerParts,
  base: PurchaseResult,
  plan: TurnPlan,
): PurchaseResult {
  // One bubble per turn. The model writes its question into `reply` as well as
  // into `question`, so emitting both said everything twice; the separate
  // field is kept because the composer uses it to offer replies.
  const said = answerLine(plan);
  const wrong = miscountsShelf(parts.shelf.current(), said);
  if (wrong) {
    parts.logger.warn("purchase.answer.miscounted", { run_id: base.runId });
  }
  // An ask is its own beat, not a bubble: it is the one utterance of this turn
  // and the composer has to be able to find it. The reply is still the whole
  // sentence — `answerLine` merged the question into it.
  if (!wrong && askedBy(plan) !== null && said.length > 0) {
    return askTurn(parts, base, said, plan.replies ?? []);
  }
  return saidTurn(parts, base, plan, said, wrong);
}
