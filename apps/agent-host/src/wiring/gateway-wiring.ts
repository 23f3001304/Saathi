import type { Clock, IdGenerator } from "@covenant/domain";
import {
  CatalogMemoryWriter,
  DEFAULT_GATEWAY_CONFIG,
  GatewayClient,
  JwsRequestSigner,
  MoneyToolRegistry,
  PreToolUseHook,
} from "@covenant/agents";

import type { AgentHostConfig } from "../config.js";
import { GatewayReader } from "../purchase/gateway-reader.js";
import type { KeyParts } from "./key-wiring.js";
import type { ObsParts } from "./obs-wiring.js";

export interface GatewayParts {
  readonly client: GatewayClient;
  readonly reader: GatewayReader;
  readonly memory: CatalogMemoryWriter;
  readonly hook: PreToolUseHook;
}

/**
 * The single money egress and the gate in front of it (§2.7, F2).
 *
 * `PreToolUseHook` is built exactly once here and handed to both session
 * paths and to the harness's own fallback dispatch. One instance is not a
 * convenience: it is the claim that there is one place where a money-affecting
 * call is judged, and a second instance would quietly make that claim false.
 *
 * `attackId` stays `null`. The T-1 label is the *write gate's* to apply — it is
 * the party that recognised the poisoning — and an agent that could stamp
 * `attack_id` on its own events could also stamp it on the wrong ones.
 */
export function wireGateway(
  config: AgentHostConfig,
  keys: KeyParts,
  obs: ObsParts,
  clock: Clock,
  ids: IdGenerator,
): GatewayParts {
  const client = new GatewayClient(
    fetch,
    new JwsRequestSigner(keys.buyerSigner, "user"),
    clock,
    ids,
    {
      ...DEFAULT_GATEWAY_CONFIG,
      baseUrl: config.gatewayUrl,
      apiVersion: config.apiVersion,
      tenantId: config.tenantId,
      timeoutMs: config.timeoutMs,
    },
  );
  return {
    client,
    reader: new GatewayReader(fetch, ids, obs.logger, {
      baseUrl: config.gatewayUrl,
      apiVersion: config.apiVersion,
      timeoutMs: config.timeoutMs,
    }),
    memory: new CatalogMemoryWriter(client, clock, {
      userId: keys.userIss,
      tenantId: config.tenantId,
    }),
    hook: new PreToolUseHook(
      new MoneyToolRegistry(),
      obs.journal,
      obs.logger,
      obs.tracer,
      { tenantId: config.tenantId, attackId: null },
    ),
  };
}
