import { PendingDraft } from "../purchase/pending-draft.js";
import type { BuyerDeps, BuyerParts } from "./buyer-parts.js";
import { wireConversationMemory } from "./memory-wiring.js";
import { intentFlowOf, memoryDepsOf, wireRunner } from "./runner-wiring.js";
import { webBuyOf } from "./web-wiring.js";

export type { BuyerDeps, BuyerParts } from "./buyer-parts.js";

/**
 * Assembles the buyer side: the loop, the tools behind it, and the money path.
 * The dispatcher and tool log arrive from `wireToolDispatch`, because the
 * routed live session needs the same two and is built before this runs.
 */
export function wireBuyer(deps: BuyerDeps): BuyerParts {
  const { log, dispatcher } = deps.dispatch;
  const intentGate = deps.gates.intent;
  const pending = new PendingDraft();
  const intents = intentFlowOf(deps, intentGate, pending);
  const webPick = webBuyOf(deps, dispatcher, intents);
  const shared = {
    intentGate,
    intents,
    pending,
    cartGate: deps.gates.cart,
    conversation: wireConversationMemory(memoryDepsOf(deps)),
    webPick,
  };
  return {
    log,
    intentGate,
    cartGate: shared.cartGate,
    conversation: shared.conversation,
    webPick,
    session: deps.session,
    runner: wireRunner(deps, log, dispatcher, shared),
  };
}
