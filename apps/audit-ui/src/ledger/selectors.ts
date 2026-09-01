// Pure derivations over `LedgerState` — no React, table-tested independent
// of the reducer (§9: "seal-state derivation" is its own tested unit).
import type { LedgerState, TxnView } from "./reducer.ts";
import type {
  CooloffPayload,
  SealCheck,
  ToPass,
  VerdictCheckResult,
} from "./types.ts";

export type SealState = "pending" | "passed" | "failed" | "held";

export type SealView = {
  check: SealCheck;
  state: SealState;
  reasonCode?: string;
  humanSentence?: string;
  toPass?: ToPass;
  heldUntil?: string;
};

/** D6 — six core checks, then the two fiduciary checks (§12 VerdictCheck set). */
export const SEAL_ORDER: SealCheck[] = [
  "intent_bounds",
  "nonce",
  "uri_pin",
  "risk_data",
  "memory_digest",
  "quote_match",
  "envelope",
  "cooloff",
];

function sealFor(
  check: SealCheck,
  found: VerdictCheckResult | undefined,
  cooloff: CooloffPayload | undefined,
): SealView {
  if (found === undefined) return { check, state: "pending" };
  // D7 — "held" is the absence of a stamp + a countdown, never a third colour.
  // A gateway `hold` outcome says so outright; a fixture says it by parking a
  // cool-off alongside a passing seal.
  const heldByFrame =
    check === "cooloff" && found.passed && cooloff !== undefined;
  if (found.held === true || heldByFrame) {
    return {
      check,
      state: "held",
      // A live `hold` can arrive before the `cooloff.parked` frame that says
      // until when; the seal still reads as held, just without a countdown.
      ...(cooloff === undefined ? {} : { heldUntil: cooloff.release_at }),
      humanSentence: found.human_sentence,
    };
  }
  return {
    check,
    state: found.passed ? "passed" : "failed",
    reasonCode: found.reason_code,
    humanSentence: found.human_sentence,
    toPass: found.to_pass,
  };
}

/** §3.1/§4.5 — the row SealRow renders; identical logic drives rewind and live. */
export function deriveSealStates(
  checks: VerdictCheckResult[],
  cooloff?: CooloffPayload,
): SealView[] {
  return SEAL_ORDER.map((check) =>
    sealFor(
      check,
      checks.find((c) => c.check === check),
      cooloff,
    ),
  );
}

export function selectTxn(
  state: LedgerState,
  txnId: string | null,
): TxnView | undefined {
  return txnId === null ? undefined : state.txns[txnId];
}

export function selectLiveTxn(state: LedgerState): TxnView | undefined {
  return selectTxn(state, state.liveTxnId);
}

export function selectCooloffForTxn(
  state: LedgerState,
  txnId: string,
): CooloffPayload | undefined {
  return Object.values(state.cooloff).find((item) => item.txn_id === txnId);
}

export function selectTxnRail(state: LedgerState): TxnView[] {
  return state.txnOrder
    .map((id) => state.txns[id])
    .filter((txn): txn is TxnView => txn !== undefined)
    .reverse();
}

export function selectCooloffList(state: LedgerState): CooloffPayload[] {
  return Object.values(state.cooloff).sort((a, b) =>
    a.release_at.localeCompare(b.release_at),
  );
}
