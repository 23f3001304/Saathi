// The `TxnView` shape, pulled out of reducer.ts so it can be shared with
// txnUpdaters.ts without a reducer.ts <-> txnUpdaters.ts import cycle
// (dependency-cruiser's no-circular rule is repo-wide, not per-package).
import type {
  CartPayload,
  IntentPayload,
  MemoryEntryPayload,
  OutcomePayload,
  RzpCallPayload,
  Stage0Rejection,
  VerdictCheckResult,
} from "./types.ts";
import type { ThreadEvent } from "../kolam/thread.ts";

export type MemoryEntryView = MemoryEntryPayload & {
  outcome: "committed" | "rejected" | "retrieved";
  rejectionReason?: string;
};

export type TxnView = {
  txnId: string;
  intent?: IntentPayload;
  memories: MemoryEntryView[];
  cart?: CartPayload;
  checks: VerdictCheckResult[];
  verdictLatencyMs?: number;
  stage0Rejection?: Stage0Rejection;
  rzpCalls: RzpCallPayload[];
  outcome?: OutcomePayload;
  threadEvents: ThreadEvent[];
};
