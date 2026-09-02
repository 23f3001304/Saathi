import type { PlannerReads } from "@covenant/agents";

import type { BrowserService } from "../browser/browser-service.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { AgentHostConfig } from "../config.js";
import { readCurrent } from "../covenant/current-bounds.js";
import type { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { ContextView } from "../purchase/context-record.js";
import { HostStateView } from "../purchase/state-view.js";
import type { TurnLanguage } from "../purchase/turn-language.js";
import type { WebOffered } from "../purchase/web-offered.js";
import type { WebPickPark } from "../purchase/web-pick-park.js";
import type { CredentialVault } from "../session/credential-vault.js";
import type { MerchantParts } from "./merchant-wiring.js";

/** The lane's two hold-to-sign gates. Built with the lane, before the planner
 *  and the runner, because the reads report what is pending on them and the
 *  runner waits on them: one pair, two readers. */
export interface LaneGates {
  readonly intent: ConfirmationGate;
  readonly cart: ConfirmationGate;
}

export interface ReadDeps {
  readonly config: AgentHostConfig;
  readonly merchant: MerchantParts;
  readonly browser: BrowserService;
  readonly offered: WebOffered;
  readonly park: WebPickPark;
  readonly progress: WebProgress;
  readonly findings: WebFindings;
  readonly gates: LaneGates;
  readonly vault: CredentialVault;
  readonly context: ContextView;
  readonly language: TurnLanguage;
}

/** `fetchImpl` is injectable for the test that proves which gateway the
 *  covenant is read from; production passes nothing and gets `fetch`. */
export function plannerReadsOf(
  deps: ReadDeps,
  fetchImpl: typeof fetch = fetch,
): PlannerReads {
  return new HostStateView({
    shelf: deps.merchant.shelf,
    merchantId: deps.merchant.merchantId,
    offered: deps.offered,
    park: deps.park,
    progress: deps.progress,
    findings: deps.findings,
    browser: deps.browser,
    covenant: () =>
      readCurrent(deps.config.gatewayUrl, deps.config.apiVersion, fetchImpl),
    gates: deps.gates,
    vault: deps.vault,
    context: deps.context,
    language: deps.language,
  });
}
