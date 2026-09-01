import type { GatewayClient } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";

export interface SortKeySignal {
  readonly sortKey: string;
  readonly derivedFromMemoryId: string;
}

/**
 * A re-sort is a preference signal, so it is written down — at P1 through
 * `verified_api`, because it arrived on the host's own surface rather than in
 * merchant prose. The gateway's write gate still decides whether it lands; this
 * reports what the gate said and never asserts a tier of its own.
 */
export async function writeSortKey(
  gateway: GatewayClient,
  clock: Clock,
  logger: Logger,
  userId: string,
  signal: SortKeySignal,
): Promise<string | null> {
  const written = await gateway.writeMemory({
    type: "preference",
    tier_claim: "P1",
    source_channel: "verified_api",
    sig: null,
    subject: "user",
    predicate: "sort_key",
    source_ref: signal.derivedFromMemoryId,
    content: {
      sort_key: signal.sortKey,
      derived_from_memory_id: signal.derivedFromMemoryId,
    },
    t_valid: clock.now().toISOString(),
    t_invalid: null,
    user_id: userId,
  });
  if (!written.ok) {
    logger.warn("chat.sort_key.refused", {
      reason_code: written.failure.reasonCode,
    });
    return null;
  }
  return written.value.memory_id;
}
