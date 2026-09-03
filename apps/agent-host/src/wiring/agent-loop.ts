import type { AgentSession } from "@covenant/agents";
import { BuyerAgent, Checkout, SelfCorrector } from "@covenant/agents";

import { liveRefusals, scriptedRefusals } from "../purchase/refusal-step.js";
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

/**
 * The purchase turn's own loop, and who explains a cart the covenant refuses
 * on it. Live that is the same conversation taking one more turn, so the
 * shopper's language comes with it; scripted it is the frozen voice, because
 * a fixture session handed a refusal prompt re-scripts a whole purchase.
 */
export function loopParts(deps: BuyerDeps, dispatcher: AgentToolDispatcher) {
  const buyer = loopOn(deps, deps.session, dispatcher);
  const live = deps.config.mode === "live";
  return { buyer, refusals: live ? liveRefusals(buyer) : scriptedRefusals() };
}
