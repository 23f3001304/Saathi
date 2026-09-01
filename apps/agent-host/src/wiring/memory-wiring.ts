import type { GatewayClient } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";

import { ConversationMemory } from "../purchase/conversation-memory.js";
import { TraitMemory } from "../purchase/trait-memory.js";

/** How many turns one run may recall; past that they are not the ask. */
const RECALL_LIMIT = 24;

export interface MemoryDeps {
  readonly gateway: GatewayClient;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly userId: string;
}

/**
 * The conversation, in PTLM. Both halves of it write through the same
 * `GatewayClient` every other memory goes through, so a turn is gated, tiered
 * and ledgered like a merchant attestation — inside the digest the cart binds.
 */
export function wireConversationMemory(deps: MemoryDeps): ConversationMemory {
  return new ConversationMemory(deps.gateway, deps.clock, deps.logger, {
    userId: deps.userId,
    recallLimit: RECALL_LIMIT,
  });
}

/** The durable half: what is known about the shopper, not about this cart. */
export function wireTraitMemory(deps: MemoryDeps): TraitMemory {
  return new TraitMemory(deps.gateway, deps.clock, deps.logger, {
    userId: deps.userId,
    recallLimit: RECALL_LIMIT,
  });
}
