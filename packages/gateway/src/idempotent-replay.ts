import type { IdempotencyToPass, ReasonCode } from "@covenant/domain";

import type { IdempotencyResolver, Presentation } from "./idempotency-resolver.js";

export type ReplayOutcome<T> =
  | { readonly status: "replay"; readonly body: T }
  | { readonly status: "conflict"; readonly toPass: IdempotencyToPass }
  | { readonly status: "burned"; readonly reasonCode: ReasonCode };

/**
 * The three non-`fresh` states of §4.5, in the one shape both money use cases
 * need. `null` means "evaluate fresh". The stored `response_json` is replayed
 * **verbatim**: re-deriving it would let a later code change silently answer an
 * old request differently, which is the opposite of what idempotency promises.
 */
export function replayOf<T>(
  resolver: IdempotencyResolver,
  presentation: Presentation,
): ReplayOutcome<T> | null {
  const outcome = resolver.resolve(presentation);
  switch (outcome.status) {
    case "replay":
      return { status: "replay", body: JSON.parse(outcome.responseJson) as T };
    case "conflict":
      return {
        status: "conflict",
        toPass: {
          stored_payload_hash: outcome.storedPayloadHash,
          received_payload_hash: outcome.receivedPayloadHash,
          remedy: "retry_with_new_idempotency_key",
        },
      };
    case "burned":
      return { status: "burned", reasonCode: outcome.reasonCode };
    default:
      return null;
  }
}
