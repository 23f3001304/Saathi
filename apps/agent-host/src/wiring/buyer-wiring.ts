import { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { BuyerDeps, BuyerParts } from "./buyer-parts.js";
import { wireConversationMemory } from "./memory-wiring.js";
import { memoryDepsOf, wireRunner } from "./runner-wiring.js";
import { webBuyOf } from "./web-wiring.js";

export type { BuyerDeps, BuyerParts } from "./buyer-parts.js";

/**
 * Assembles the buyer side: the loop, the tools behind it, and the money path.
 * The dispatcher and tool log arrive from `wireToolDispatch`, because the
 * routed live session needs the same two and is built before this runs.
 */
export function wireBuyer(deps: BuyerDeps): BuyerParts {
  const { log, dispatcher } = deps.dispatch;
  const webPick = webBuyOf(deps, dispatcher);
  const shared = {
    intentGate: new ConfirmationGate(deps.config.autoSign),
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
