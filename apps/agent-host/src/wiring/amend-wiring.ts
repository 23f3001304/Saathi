import { COVENANT_API_VERSION } from "@covenant/agents";
import type { Clock } from "@covenant/domain";

import { AmendFlow } from "../covenant/amend-flow.js";
import type { AgentHostConfig } from "../config.js";
import type { GatewayParts } from "./gateway-wiring.js";
import { COVENANT_CURRENCY } from "./judge-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { BuyerIdentityParts } from "./merchant-wiring.js";
import type { ObsParts } from "./obs-wiring.js";

/**
 * The Rules screen's seal. It holds the **user** signer, like the purchase
 * path, because a rule change and a spending ceiling are the same act — a
 * bound the user signed — and there is one road to the ledger for both.
 */
export function wireAmendFlow(parts: {
  readonly config: AgentHostConfig;
  readonly clock: Clock;
  readonly obs: ObsParts;
  readonly keys: KeyParts;
  readonly identity: BuyerIdentityParts;
  readonly gateway: GatewayParts;
}): AmendFlow {
  return new AmendFlow(
    parts.keys.intents,
    parts.gateway.client,
    parts.clock,
    parts.obs.logger,
    {
      gatewayUrl: parts.config.gatewayUrl,
      apiVersion: COVENANT_API_VERSION,
      tenantId: parts.config.tenantId,
      userIss: parts.keys.userIss,
      agentInstanceId: parts.identity.instance.instanceId,
      currency: COVENANT_CURRENCY,
    },
  );
}
