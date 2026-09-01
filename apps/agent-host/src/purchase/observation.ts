import type { ConversationResult, MemoryRetrieveResponse } from "@covenant/agents";

import type { SignedIntent } from "./intent-flow.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { MemoryWriteRecord } from "./tool-log.js";

export interface Observations {
  readonly intent: SignedIntent;
  readonly conversation: ConversationResult;
  readonly retrieval: MemoryRetrieveResponse;
  readonly writes: readonly MemoryWriteRecord[];
}

/**
 * Folds everything the run has learned so far into the result. The entry ids
 * and the digest are copied from the retrieval verbatim — the cart is about to
 * sign over exactly this list, and the gateway will re-derive the digest from
 * exactly this list, so any transformation here would be a place for the two
 * computations to quietly disagree (§9.4 rule 5).
 */
export function observedFrom(
  base: PurchaseResult,
  observed: Observations,
): PurchaseResult {
  const { bounds } = observed.intent;
  return {
    ...base,
    intent: {
      mandateId: observed.intent.mandateId,
      description: observed.intent.description,
      capPaise: bounds.allowance.max_amount,
      currency: bounds.allowance.currency,
      skus: bounds.skus,
      requiresRefundability: bounds.requires_refundability,
      constraintIds: observed.intent.constraintIds,
    },
    memoryEntryIds: observed.retrieval.entries.map((entry) => entry.id),
    memoryDigest: observed.retrieval.digest,
    memoryWrites: observed.writes,
    transcript: observed.conversation.transcript,
    blocked: observed.conversation.blocked,
  };
}
