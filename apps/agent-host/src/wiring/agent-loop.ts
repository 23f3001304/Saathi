import type { AgentSession } from "@covenant/agents";
import { BuyerAgent, Checkout, SelfCorrector } from "@covenant/agents";

import type { AgentToolDispatcher } from "../purchase/tool-dispatcher.js";
import type { BuyerDeps } from "./buyer-parts.js";

export function checkoutOf(deps: BuyerDeps): Checkout {
  return new Checkout(
    deps.gateway.client,
    new SelfCorrector(),
    deps.obs.logger,
  );
}

/**
 * The tool loop, over whichever conversation it is given. The purchase turn,
 * the open-web look and the errand behind a tapped card all run on this one —
 * so every one of them sits behind the same `PreToolUseHook` and the same
 * dispatcher, and the block matrix does not fork per errand.
 */
export function loopOn(
  deps: BuyerDeps,
  session: AgentSession,
  dispatcher: AgentToolDispatcher,
): BuyerAgent {
  return new BuyerAgent(
    session,
    deps.gateway.hook,
    dispatcher,
    checkoutOf(deps),
    deps.obs.logger,
    { maxTurns: deps.config.maxTurns, txnId: null },
  );
}
