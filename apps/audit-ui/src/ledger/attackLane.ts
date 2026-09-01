// Split out of reducer.ts to keep it under R1's 200-line cap — the
// RangeChip/AttackLane tally is one concern, txn folding is another.
import type {
  AttackDetectedPayload,
  LedgerFrame,
  MemoryRejectedPayload,
} from "./types.ts";

/**
 * Not everything the gate refuses is an attack, and calling it one would be
 * the product crying wolf about its own routine hygiene.
 *
 * `tier` is the ordinary case: the agent read a product description off a
 * merchant page and tried to remember it as a fact. Merchant prose is
 * untrusted text, a fact needs more than that, so the write is refused. It
 * happens dozens of times in a normal run and means the gate is working.
 *
 * `relaxation` is the one worth a red chip: something tried to write a memory
 * that would loosen a bound the user signed. That is the T-1 shape.
 */
export type RefusalKind = "attack" | "relaxation" | "tier";

export type AttackLaneEntry = {
  id: number;
  ts: string;
  txnId: string | null;
  reasonCode: string;
  human: string;
  detailKind: string;
  kind: RefusalKind;
  rule: string | null;
  excerpt: string | null;
};

export type RangeTally = {
  rangeBlockedCount: number;
  attackEvents: AttackLaneEntry[];
};

/** R0 is the tier-permission gate; R1 upward are the contradiction rules, and
 *  a contradiction is an attempt on a bound rather than a housekeeping miss. */
function kindOf(rule: string | null): RefusalKind {
  if (rule === null || rule.startsWith("R0")) return "tier";
  return "relaxation";
}

function refusalOf(
  frame: LedgerFrame,
  payload: MemoryRejectedPayload,
): AttackLaneEntry {
  return {
    id: frame.id,
    ts: frame.ts,
    txnId: frame.txn_id,
    reasonCode: payload.reason_code,
    human: payload.human ?? payload.reason_code,
    detailKind: payload.type,
    kind: kindOf(payload.rule ?? null),
    rule: payload.rule ?? null,
    excerpt: payload.content_excerpt ?? payload.content ?? null,
  };
}

function attackOf(
  frame: LedgerFrame,
  payload: AttackDetectedPayload,
): AttackLaneEntry {
  return {
    id: frame.id,
    ts: frame.ts,
    txnId: frame.txn_id,
    reasonCode: payload.reason_code,
    human: payload.human,
    detailKind: payload.detail_kind,
    kind: "attack",
    rule: null,
    excerpt: null,
  };
}

/**
 * D14 — a refused write lands here whether it was `attack.detected` or a
 * quieter `memory.write.rejected`. Both are counted, and now both are also
 * *listed*: the chip used to tally the quiet ones without recording them, so
 * it could say "28 blocked" over a lane holding nothing to read.
 */
export function foldRangeTally(
  tally: RangeTally,
  frame: LedgerFrame,
): RangeTally {
  if (frame.kind === "attack.detected") {
    const entry = attackOf(frame, frame.payload as AttackDetectedPayload);
    return {
      rangeBlockedCount: tally.rangeBlockedCount + 1,
      attackEvents: [entry, ...tally.attackEvents],
    };
  }
  if (frame.kind === "memory.write.rejected") {
    const entry = refusalOf(frame, frame.payload as MemoryRejectedPayload);
    return {
      rangeBlockedCount: tally.rangeBlockedCount + 1,
      attackEvents: [entry, ...tally.attackEvents],
    };
  }
  return tally;
}

/** What deserves alarm, as opposed to what deserves a log line. */
export function alarmingCount(entries: readonly AttackLaneEntry[]): number {
  return entries.filter((entry) => entry.kind !== "tier").length;
}
