// Split out of reducer.ts for headroom under R1's 200-line cap — this is
// the per-kind "what changes on a TxnView" table; reducer.ts keeps the
// fold orchestration (idempotency, thread events, cross-txn concerns).
import type {
  CartPayload,
  EventKind,
  IntentPayload,
  LedgerFrame,
  MemoryEntryPayload,
  MemoryRejectedPayload,
  OutcomePayload,
  RzpCallPayload,
} from "./types.ts";
import { normalizeVerdict } from "./verdictPayload.ts";
import type { MemoryEntryView, TxnView } from "./txnView.ts";

export type { MemoryEntryView } from "./txnView.ts";

function toMemoryView(
  payload: MemoryEntryPayload,
  outcome: MemoryEntryView["outcome"],
): MemoryEntryView {
  return { ...payload, outcome };
}

type TxnUpdater = (txn: TxnView, frame: LedgerFrame) => Partial<TxnView>;

export const TXN_UPDATERS: Partial<Record<EventKind, TxnUpdater>> = {
  "intent.drafted": (_txn, frame) => ({
    intent: frame.payload as IntentPayload,
  }),
  "intent.signed": (_txn, frame) => ({
    intent: frame.payload as IntentPayload,
  }),
  "intent.amended": (_txn, frame) => ({
    intent: frame.payload as IntentPayload,
  }),
  "memory.write.committed": (txn, frame) => ({
    memories: [
      ...txn.memories,
      toMemoryView(frame.payload as MemoryEntryPayload, "committed"),
    ],
  }),
  "memory.retrieved": (txn, frame) => ({
    memories: [
      ...txn.memories,
      toMemoryView(frame.payload as MemoryEntryPayload, "retrieved"),
    ],
  }),
  // A merchant's quote is a memory entry too (§2.1 MemoryRail — "type tier
  // age hash" makes no exception for it); without this, a cart justified by
  // a quote can never recompute a matching digest in O2 (§2.5).
  "catalog.quote.received": (txn, frame) => ({
    memories: [
      ...txn.memories,
      toMemoryView(frame.payload as MemoryEntryPayload, "committed"),
    ],
  }),
  "memory.write.rejected": (txn, frame) => {
    const payload = frame.payload as MemoryRejectedPayload;
    const view = {
      ...toMemoryView(payload, "rejected"),
      rejectionReason: payload.reason_code,
    };
    return { memories: [...txn.memories, view] };
  },
  "cart.assembled": (_txn, frame) => ({ cart: frame.payload as CartPayload }),
  "cart.digest.computed": (_txn, frame) => ({
    cart: frame.payload as CartPayload,
  }),
  "verdict.emitted": (_txn, frame) => {
    const verdict = normalizeVerdict(frame.payload);
    return {
      checks: verdict.checks,
      verdictLatencyMs: verdict.latencyMs,
      stage0Rejection: verdict.stage0,
    };
  },
  "rzp.order.created": (txn, frame) => ({
    rzpCalls: [...txn.rzpCalls, frame.payload as RzpCallPayload],
  }),
  "rzp.link.created": (txn, frame) => ({
    rzpCalls: [...txn.rzpCalls, frame.payload as RzpCallPayload],
  }),
  "rzp.polled": (txn, frame) => ({
    rzpCalls: [...txn.rzpCalls, frame.payload as RzpCallPayload],
  }),
  "payment.captured": (_txn, frame) => ({
    outcome: frame.payload as OutcomePayload,
  }),
  "payment.failed": (_txn, frame) => ({
    outcome: frame.payload as OutcomePayload,
  }),
};
