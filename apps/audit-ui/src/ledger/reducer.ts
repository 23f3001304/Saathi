// §4.1 — "the UI's state model should be the system's state model": one
// reducer folds the append-only frame stream into view state. Every screen
// reads a projection of the same `LedgerState`, so they cannot disagree.
import type {
  LedgerFrame,
  ConnectionMode,
  IntentPayload,
  CooloffPayload,
  FoldMaterializedPayload,
  LedgerSource,
} from "./types.ts";
import {
  knotKindForEventKind,
  laneForEventKind,
  type ThreadEvent,
  type ThreadStatus,
} from "../kolam/thread.ts";
import { foldRangeTally, type AttackLaneEntry } from "./attackLane.ts";
import { activeIntentFor } from "./intentTracking.ts";
import { normalizeVerdict } from "./verdictPayload.ts";
import { TXN_UPDATERS } from "./txnUpdaters.ts";
import type { TxnView } from "./txnView.ts";

export type { AttackLaneEntry } from "./attackLane.ts";
export type { LedgerSource } from "./types.ts";
export type { MemoryEntryView, TxnView } from "./txnView.ts";

export type LedgerState = {
  lastId: number;
  headHash: string | null;
  connectionMode: ConnectionMode;
  source: LedgerSource;
  // §2.3 EventStream — "raw, hash-chained, never queried by products" — but
  // the Ledger screen's own audit view IS the exception that proves the rule.
  frames: LedgerFrame[];
  txns: Record<string, TxnView>;
  txnOrder: string[];
  liveTxnId: string | null;
  // `intent.*` frames carry `txn_id: null` — an intent precedes any specific
  // transaction. The active one is stamped onto each txn as it opens.
  activeIntent?: IntentPayload;
  attackEvents: AttackLaneEntry[];
  cooloff: Record<string, CooloffPayload>;
  rangeBlockedCount: number;
  folds: Record<string, FoldMaterializedPayload>;
};

export const initialLedgerState: LedgerState = {
  lastId: 0,
  headHash: null,
  connectionMode: "sse",
  source: "fixtures",
  frames: [],
  txns: {},
  txnOrder: [],
  liveTxnId: null,
  attackEvents: [],
  cooloff: {},
  rangeBlockedCount: 0,
  folds: {},
};

function emptyTxn(txnId: string, intent: IntentPayload | undefined): TxnView {
  return {
    txnId,
    intent,
    memories: [],
    checks: [],
    rzpCalls: [],
    threadEvents: [],
  };
}

function withActiveIntent(state: LedgerState, frame: LedgerFrame): LedgerState {
  const activeIntent = activeIntentFor(state.activeIntent, frame);
  return activeIntent === state.activeIntent
    ? state
    : { ...state, activeIntent };
}

function withoutKey<T>(
  record: Record<string, T>,
  key: string,
): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

function statusForFrame(frame: LedgerFrame): ThreadStatus {
  if (frame.kind === "memory.write.rejected" || frame.kind === "payment.failed")
    return "fail";
  if (frame.kind === "verdict.emitted") {
    const { checks } = normalizeVerdict(frame.payload);
    // `[].every(...)` is vacuously true — an empty `checks` array is a
    // stage-0 admission rejection (0 or 8 seals, never a free pass).
    if (checks.length === 0) return "fail";
    if (checks.some((c) => c.held === true)) return "neutral";
    return checks.every((c) => c.passed) ? "pass" : "fail";
  }
  return "neutral";
}

function threadEventFor(frame: LedgerFrame): ThreadEvent {
  return {
    id: frame.id,
    kind: frame.kind,
    lane: laneForEventKind(frame.kind),
    knot: knotKindForEventKind(frame.kind),
    status: statusForFrame(frame),
  };
}

function applyToTxn(txn: TxnView, frame: LedgerFrame): TxnView {
  const threadEvents = [...txn.threadEvents, threadEventFor(frame)];
  const updater = TXN_UPDATERS[frame.kind];
  return { ...txn, ...(updater ? updater(txn, frame) : {}), threadEvents };
}

function withRange(state: LedgerState, frame: LedgerFrame): LedgerState {
  const tally = foldRangeTally(
    {
      rangeBlockedCount: state.rangeBlockedCount,
      attackEvents: state.attackEvents,
    },
    frame,
  );
  return { ...state, ...tally };
}

function withCooloff(state: LedgerState, frame: LedgerFrame): LedgerState {
  if (frame.kind === "cooloff.parked") {
    const payload = frame.payload as CooloffPayload;
    return { ...state, cooloff: { ...state.cooloff, [payload.id]: payload } };
  }
  if (frame.kind === "cooloff.cancelled" || frame.kind === "cooloff.released") {
    const payload = frame.payload as { id: string };
    return { ...state, cooloff: withoutKey(state.cooloff, payload.id) };
  }
  return state;
}

function withFold(state: LedgerState, frame: LedgerFrame): LedgerState {
  if (frame.kind !== "fold.materialized") return state;
  const payload = frame.payload as FoldMaterializedPayload;
  return { ...state, folds: { ...state.folds, [payload.fold]: payload } };
}

function withTxn(state: LedgerState, frame: LedgerFrame): LedgerState {
  if (frame.txn_id === null) return state;
  const txnId = frame.txn_id;
  const existing = state.txns[txnId] ?? emptyTxn(txnId, state.activeIntent);
  const txnOrder = state.txnOrder.includes(txnId)
    ? state.txnOrder
    : [...state.txnOrder, txnId];
  return {
    ...state,
    txns: { ...state.txns, [txnId]: applyToTxn(existing, frame) },
    txnOrder,
    liveTxnId: txnId,
  };
}

const FOLD_STEPS = [
  withActiveIntent,
  withRange,
  withCooloff,
  withFold,
  withTxn,
];

/** Idempotent on `id` (§4.1) — backfill and stream can overlap freely. */
export function applyFrame(
  state: LedgerState,
  frame: LedgerFrame,
): LedgerState {
  if (frame.id <= state.lastId) return state;
  const withHead: LedgerState = {
    ...state,
    lastId: frame.id,
    headHash: frame.this_hash,
    frames: [...state.frames, frame],
  };
  return FOLD_STEPS.reduce((acc, step) => step(acc, frame), withHead);
}

export type LedgerAction =
  | { type: "frame"; frame: LedgerFrame }
  | { type: "connection"; mode: ConnectionMode }
  | { type: "source"; source: LedgerSource };

export function ledgerReducer(
  state: LedgerState,
  action: LedgerAction,
): LedgerState {
  if (action.type === "connection")
    return { ...state, connectionMode: action.mode };
  if (action.type === "source") return { ...state, source: action.source };
  return applyFrame(state, action.frame);
}
