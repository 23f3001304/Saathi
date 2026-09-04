import type { IntentFlow } from "../purchase/intent-flow.js";
import { ADDRESS_RECALL } from "./dispatch-wiring.js";
import type { AgentToolDispatcher } from "../purchase/tool-dispatcher.js";
import { WebBuyStep } from "../purchase/web-buy-step.js";
import { WebLookStep } from "../purchase/web-look-step.js";
import { loopOn } from "./agent-loop.js";
import type { BuyerDeps } from "./buyer-parts.js";
import { COVENANT_CURRENCY } from "./judge-wiring.js";

/**
 * Looking on the open web, as a step the turn fork reaches directly.
 *
 * It holds a session whose declared tools are the sandbox's, the shared
 * `WebTrail` so its report is written from where the window actually went, the
 * shared `WebFindings` so the cards it offers are the tiles that window was
 * shown, and the same `BuyerAgent` loop the purchase path uses.
 */
export function webLookOf(
  deps: BuyerDeps,
  dispatcher: AgentToolDispatcher,
): WebLookStep {
  return new WebLookStep(
    deps.hub,
    loopOn(deps, deps.webSession, dispatcher),
    deps.trail,
    deps.findings,
    deps.obs.logger,
    COVENANT_CURRENCY,
    deps.browser.phase,
    deps.offered,
    deps.pin,
    deps.context,
    { progress: deps.progress, window: deps.browser },
    deps.pages,
  );
}

/**
 * The errand behind a tapped card, on the same narrow tool surface.
 *
 * DECISION: it opens the listing through `WebShopper` rather than letting the
 * model do it. The ref the shopper tapped resolves, here in the host, to a page
 * this run already read — so the one navigation nobody chose freely is the one
 * that decides which shop the rest of the errand is standing in.
 *
 * It also holds the two things that make a checkout resumable: `WebProgress`,
 * which is what this host watched itself do at the window, and `WebPickPark`,
 * which is whether a checkout is standing at an address nobody has agreed to.
 */
export function webBuyOf(
  deps: BuyerDeps,
  dispatcher: AgentToolDispatcher,
  intents: IntentFlow,
): WebBuyStep {
  return new WebBuyStep(
    deps.hub,
    loopOn(deps, deps.pickSession, dispatcher),
    {
      open: (url) => deps.shopper.open(url),
      theirs: () => deps.browser.current()?.currentState() === "user-drive",
      view: () => deps.browser.view(),
    },
    deps.trail,
    deps.findings,
    deps.obs.logger,
    COVENANT_CURRENCY,
    deps.progress,
    deps.park,
    deps.browser.phase,
    deps.pin,
    { lookup: () => deps.traits.known(ADDRESS_RECALL) },
    intents,
  );
}
