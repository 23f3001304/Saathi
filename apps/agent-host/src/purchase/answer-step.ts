import type { ShelfView, TurnPlan } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
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
 *  one; otherwise the reply is the whole utterance. "Already asks" means a
 *  question mark anywhere in the reply, not only at its end: a live turn wrote
 *  its ask mid-reply and a summary sentence after it, and the endsWith check
 *  then stapled `question` on as a near-verbatim second ask. */
function answerLine(plan: TurnPlan): string {
  const reply = plan.reply.trim();
  const question = plan.question?.trim() ?? "";
  if (question === "") return reply;
  if (reply === "") return question;
  return reply.includes("?") ? reply : `${reply} ${question}`;
}

export interface AnswerParts {
  readonly hub: BeatHub;
  readonly shelf: ShelfView;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/** The bubble, the outcome and the record — everything a turn that did not ask
 *  still has to emit. An empty reply emits no bubble. */
function saidTurn(
  parts: AnswerParts,
  base: PurchaseResult,
  plan: TurnPlan,
  said: string,
): PurchaseResult {
  const lines = said.length > 0 ? [said] : [];
  for (const text of lines) {
    parts.hub.emit({ kind: "message", text });
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
  // An ask is its own beat, not a bubble: it is the one utterance of this
  // turn and the composer has to be able to find it.
  if (askedBy(plan) !== null && said.length > 0) {
    return askTurn(parts, base, said, plan.replies ?? [], plan.choiceGroups ?? []);
  }
  return saidTurn(parts, base, plan, said);
}
