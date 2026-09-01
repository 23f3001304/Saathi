// Split out of reducer.ts for headroom under R1's 200-line cap.
import type { EventKind, IntentPayload, LedgerFrame } from "./types.ts";

const INTENT_KINDS: ReadonlySet<EventKind> = new Set([
  "intent.drafted",
  "intent.signed",
  "intent.amended",
]);

/**
 * `intent.*` frames carry `txn_id: null` — an intent precedes any specific
 * transaction — so the active one is tracked globally and stamped onto
 * each txn as it opens (see `emptyTxn` in reducer.ts).
 */
export function activeIntentFor(
  current: IntentPayload | undefined,
  frame: LedgerFrame,
): IntentPayload | undefined {
  if (!INTENT_KINDS.has(frame.kind)) return current;
  return frame.payload as IntentPayload;
}
