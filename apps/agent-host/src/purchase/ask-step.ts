import type { TurnPlan } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { PurchaseResult } from "./purchase-result.js";

/**
 * A turn that asks the shopper for something, and the fact that it did.
 *
 * DECISION: asking is a terminal outcome, exactly like looking on the web is.
 * A run that asked "what size and fit are you after?" and then sorted, offered
 * two options and refused a cart in the same breath had answered a question
 * nobody had answered — and every one of those steps was reasoning from a
 * value it had just admitted it did not have. So the question ends the run,
 * the window and the signed intent stay where they are, and the shopper's next
 * sentence is the answer.
 *
 * DECISION: the question goes out as its own beat rather than as prose. The
 * composer is where a shopper answers one — that is the product rule, stated
 * more than once — and a client cannot put a question at the composer if the
 * only evidence that a question was asked is a question mark in a bubble.
 */
export function asks(text: string): boolean {
  return text.trim().endsWith("?");
}

/** What this turn is waiting on, or `null` when it is waiting on nothing. */
export function askedBy(plan: TurnPlan): string | null {
  const question = plan.question?.trim() ?? "";
  if (question.length > 0) return question;
  const reply = plan.reply.trim();
  return asks(reply) ? reply : null;
}

/**
 * A committed reply, split into what it reported and what it asked.
 *
 * An ACT turn is allowed to end on a question — the model does it whatever the
 * prompt says — but it is not allowed to leave one dangling over a run that
 * carried on. So the report is said, the evidence is rendered under it, and the
 * trailing question becomes the beat that arms the composer. Nothing is
 * dropped and nothing is asked above the thing it is about.
 */
export function splitAsk(text: string): {
  readonly said: string;
  readonly question: string | null;
} {
  const trimmed = text.trim();
  const found = /^([\s\S]*?)([^.!?\n]+\?)$/.exec(trimmed);
  const said = found?.[1]?.trim() ?? trimmed;
  const question = found?.[2]?.trim() ?? null;
  // A reply that is nothing but its question stays whole: splitting it would
  // leave an empty bubble above the ask.
  return said === "" ? { said: trimmed, question: null } : { said, question };
}

export interface AskParts {
  readonly hub: BeatHub;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/**
 * The run stops here. `replies` are the model's own suggested answers, and an
 * empty list is normal: the composer falls back to a text field whose
 * placeholder is the question, which is still the composer transformed.
 */
export function askTurn(
  parts: AskParts,
  base: PurchaseResult,
  prompt: string,
  replies: readonly string[] = [],
): PurchaseResult {
  parts.hub.emit({
    kind: "question",
    questionId: `urn:covenant:ask:${parts.ids.uuid()}`,
    prompt,
    replies: [...replies],
  });
  parts.hub.emit({
    kind: "outcome",
    state: "answered",
    txnId: null,
    detail: "asked",
  });
  parts.logger.info("purchase.asked", {
    run_id: base.runId,
    replies: replies.length,
  });
  return { ...base, status: "answered", transcript: [prompt] };
}
