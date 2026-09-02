import { ConfirmationGate } from "../purchase/confirmation-gate.js";
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
  const intentGate = new ConfirmationGate(deps.config.autoSign);
  const intents = intentFlowOf(deps, intentGate);
  const webPick = webBuyOf(deps, dispatcher, intents);
  const shared = {
    intentGate,
    intents,
    cartGate: new ConfirmationGate(deps.config.autoSign),
    conversation: wireConversationMemory(memoryDepsOf(deps)),
    webPick,
  };
  return {
    log,
    ...shared,
    session: deps.session,
    runner: wireRunner(deps, log, dispatcher, shared),
  };
}
