import type { ShelfView, TurnPlan } from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import { amendmentBeat } from "../judge/amendment-gate.js";
import { browseTurn } from "../judge/browse-step.js";
import { recordTraits } from "../judge/trait-gate.js";
import { answerTurn } from "./answer-step.js";
import { askedBy, askTurn } from "./ask-step.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { TraitMemory } from "./trait-memory.js";
import type { WebLook } from "./web-look-step.js";

/** A pick standing at an address the shopper has not yet agreed to. */
export interface WebPickResume {
  readonly parked: boolean;
  resume(
    stated: readonly string[],
    replyLanguage: string | null,
  ): Promise<PurchaseResult>;
  /** The same errand a tapped card drives. The shell reaches it directly when
   *  the shopper names a card in words — see `typed-pick.ts`. */
  buy(
    ref: string,
    stated: readonly string[],
    replyLanguage: string | null,
  ): Promise<PurchaseResult>;
}

export interface TurnParts {
  readonly hub: BeatHub;
  readonly traits: TraitMemory;
  readonly webLook: WebLook;
  readonly webPick: WebPickResume;
  readonly shelf: ShelfView;
  readonly merchantId: string;
  readonly ids: IdGenerator;
  readonly logger: Logger;
}

/**
 * Everything a turn can be except the one thing that leads to money.
 *
 * `null` is the only answer that lets the run carry on into `buy`, so a move
 * nobody dispatched here cannot fall through into a purchase by accident. That
 * is the same fail-closed shape `PurchaseRunner.drive` had when there were
 * three moves; it is worth more now that there are six.
 *
 * DECISION: `look_on_web` is terminal here, beside `browse`, rather than a
 * detour on the way to `buy`. Looking somewhere else costs the shopper nothing
 * but time, so it must not cost them a signature — and routing it through the
 * purchase path would have made "show me what Amazon has" draft a mandate.
 *
 * DECISION: traits are recorded before the fork, not inside a branch. What the
 * shopper said about themselves is true whichever move the model picked, and
 * hanging the write off one action would mean "I wear size L" was remembered
 * when it arrived with a purchase and forgotten when it arrived with a hello.
 */
/**
 * The fork itself, once the durable writes and the parks are out of the way.
 * `null` is the only answer that reaches a purchase.
 */
async function moveOf(
  parts: TurnParts,
  base: PurchaseResult,
  plan: TurnPlan,
  stated: readonly string[],
  replyLanguage: string | null,
): Promise<PurchaseResult | null> {
  if (plan.action === "draft_intent") {
    return null;
  }
  if (plan.action === "browse") {
    return browseTurn(parts, base, plan);
  }
  if (plan.action === "look_on_web") {
    return await parts.webLook.look(base, plan, stated, replyLanguage);
  }
  if (plan.action === "propose_amendment") {
    // On the wire at last: `ChatBeat` carries an `amendment` variant and
    // `apps/audit-ui/src/covenant/amendmentBeat.ts` parses it into the
    // pending set. The beat used to be prepared, logged and then dropped
    // here, so a proposal the model made never reached the screen it was
    // made for. A proposal is still only a proposal: signing stays a hold.
    const proposed = amendmentBeat(plan, parts.ids, parts.logger);
    if (proposed !== null) parts.hub.emit(proposed);
  }
  return answerTurn(parts, base, plan);
}

export async function nonPurchaseTurn(
  parts: TurnParts,
  base: PurchaseResult,
  plan: TurnPlan,
  /** The shopper's own half of this conversation; the errand reads its
   *  language off it rather than off one possibly wordless last sentence. */
  stated: readonly string[] = [],
  replyLanguage: string | null = null,
): Promise<PurchaseResult | null> {
  await recordTraits(parts.traits, plan, parts.logger);
  // After the traits and before the fork. A checkout parked on "is this address
  // correct?" is a question this host asked and is still owed an answer to, so
  // their next sentence belongs to that question rather than starting a fresh
  // errand. Traits are recorded first on purpose: an answer that *states* an
  // address is a durable fact, written down before it is acted on.
  if (parts.webPick.parked) {
    return await parts.webPick.resume(stated, replyLanguage);
  }
  // A move that acts is not also a move that asks. `draft_intent` is the only
  // answer this function lets through to a purchase, so a plan that reaches it
  // still holding an unanswered question ends here instead — the run parks, and
  // the shopper's next sentence is the answer rather than an interruption.
  if (plan.action === "draft_intent" && askedBy(plan) !== null) {
    return askTurn(parts, base, plan.reply.trim(), plan.replies ?? []);
  }
  return await moveOf(parts, base, plan, stated, replyLanguage);
}
