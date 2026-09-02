import { TimerWaiter } from "@covenant/browser-drive";
import type { Clock, IdGenerator } from "@covenant/domain";

import type { BrowserService } from "../browser/browser-service.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { HeadlessReader } from "@covenant/browser-drive";
import type { WebFindings } from "../browser/web-listing.js";
import { SignInVerbs } from "../browser/web-sign-in.js";
import { GlanceVerbs } from "../browser/web-glance.js";
import { VerifyVerbs } from "../browser/web-verify.js";
import type { CredentialVault } from "../session/credential-vault.js";
import type { WebProgress } from "../browser/web-progress.js";
import { WebShopper } from "../browser/web-shopper.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { TraitMemory } from "../purchase/trait-memory.js";
import { MerchantToolRunner } from "../purchase/merchant-tool-runner.js";
import type { WebPin } from "../purchase/web-pin.js";
import { WebToolRunner } from "../purchase/web-tool-runner.js";
import { AgentToolDispatcher } from "../purchase/tool-dispatcher.js";
import { ToolLog } from "../purchase/tool-log.js";
import type { GatewayParts } from "./gateway-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { BuyerIdentityParts, MerchantParts } from "./merchant-wiring.js";
import type { ObsParts } from "./obs-wiring.js";

export interface DispatchParts {
  readonly log: ToolLog;
  readonly dispatcher: AgentToolDispatcher;
  /** The sandbox tools' own shopper. Shared upward so a tapped card opens its
   *  listing through the same object the tools read pages with — one ref
   *  table, one set of findings, one window. */
  readonly shopper: WebShopper;
}

export interface DispatchDeps {
  readonly browser: BrowserService;
  /** Where each sandbox move is written down. Research runs with no window on
   *  screen, so this list is the whole of what the shopper sees happening. */
  readonly hub: BeatHub;
  /** Where the window went, shared with the open-web look's report. */
  readonly trail: WebTrail;
  /** Every product tile the window was shown, shared with the look's report. */
  readonly findings: WebFindings;
  /** What the host watched itself do at the window, shared with the pick. */
  readonly progress: WebProgress;
  /** The one product a buy errand may open. */
  readonly pin: WebPin;
  /** What the shopper stated about themselves — the only source a delivery
   *  form is ever filled from. */
  readonly traits: TraitMemory;
  /** The stored sign-ins, matched by page host; values cross only into the
   *  drive's own hands. */
  readonly vault: CredentialVault;
  /** The host's one headless read-only browser, shared across lanes. */
  readonly reader: HeadlessReader;
  readonly keys: KeyParts;
  readonly obs: ObsParts;
  readonly gateway: GatewayParts;
  readonly merchant: MerchantParts;
  readonly identity: BuyerIdentityParts;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/**
 * One dispatcher and one tool log for the whole process, built before the
 * session rather than inside the buyer.
 *
 * DECISION: the router builds a fresh provider session per rung, and each of
 * those sessions runs its tools through `GuardedToolDispatcher`. If each rung
 * built its own dispatcher, the tool log the audit trail is projected from
 * would fork per escalation. Hoisting it here means every model the cascade
 * touches writes into the same log, behind the same hook.
 */
/**
 * What the delivery form may be filled from: trait memory, read back as the
 * pairs it was written as. The query is a retrieval hint and nothing more — the
 * gate still decides which rows come back, and only rows filed under a trait
 * predicate reach the form.
 */
export const ADDRESS_RECALL = "delivery address name phone city state pincode country";

/** The sandbox tools: every move written down for the shopper, and the pin
 *  that keeps a buy errand about the listing they tapped. */
function webRunner(deps: DispatchDeps, shopper: WebShopper): WebToolRunner {
  const steps = {
    step: (label: string) =>
      deps.hub.emit({
        kind: "step",
        stepId: `web-${deps.ids.uuid()}`,
        label,
      }),
  };
  return new WebToolRunner(
    shopper,
    steps,
    undefined,
    deps.pin,
    deps.findings,
    new SignInVerbs(
      deps.browser,
      deps.vault,
      new TimerWaiter(),
      deps.trail,
      deps.progress,
    ),
    new VerifyVerbs(deps.reader, deps.findings, deps.trail, steps),
    new GlanceVerbs(deps.browser),
  );
}

export function wireToolDispatch(deps: DispatchDeps): DispatchParts {
  const log = new ToolLog();
  const shopper = new WebShopper(
    deps.browser,
    deps.trail,
    new TimerWaiter(),
    deps.findings,
    { lookup: () => deps.traits.known(ADDRESS_RECALL) },
    deps.progress,
  );
  return {
    log,
    shopper,
    dispatcher: new AgentToolDispatcher(
      new MerchantToolRunner(
        deps.merchant.agent,
        deps.identity.envelopes,
        deps.gateway.memory,
        log,
        deps.merchant.server,
        deps.merchant.merchantId,
      ),
      webRunner(deps, shopper),
      deps.gateway.client,
      log,
      deps.clock,
      deps.obs.logger,
      { userId: deps.keys.userIss },
    ),
  };
}
