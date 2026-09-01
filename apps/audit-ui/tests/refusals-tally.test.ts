// The chip said "28 blocked" in crimson and clicking it did nothing: the
// handler was never wired, and the quiet write-gate refusals bumped the count
// without ever becoming a row. Worse, calling them "blocked" said the covenant
// had been attacked 28 times when the gate was doing routine hygiene.
import { describe, expect, it } from "vitest";

import {
  alarmingCount,
  foldRangeTally,
  type RangeTally,
} from "../src/ledger/attackLane.ts";
import type { LedgerFrame } from "../src/ledger/types.ts";

const EMPTY: RangeTally = { rangeBlockedCount: 0, attackEvents: [] };

function rejection(id: number, rule: string, human: string): LedgerFrame {
  return {
    id,
    ts: "2026-08-31T10:51:48.301Z",
    actor: "gateway",
    kind: "memory.write.rejected",
    txn_id: null,
    payload: { reason_code: "X", rule, human, content_excerpt: "prose" },
  } as unknown as LedgerFrame;
}

function fold(frames: readonly LedgerFrame[]): RangeTally {
  return frames.reduce(foldRangeTally, EMPTY);
}

const TIER = "R0.tier-permission";
const RELAX = "R1.numeric-relaxation";

describe("what the blocked chip counts", () => {
  it("records a row for every refusal it counts", () => {
    const tally = fold([
      rejection(1, TIER, "Writing this kind of memory needs a higher tier."),
      rejection(2, RELAX, "This memory would loosen a bound you signed."),
    ]);
    expect(tally.rangeBlockedCount).toBe(2);
    expect(tally.attackEvents).toHaveLength(2);
  });

  it("keeps the gateway's sentence rather than the reason code", () => {
    const tally = fold([rejection(1, TIER, "Needs a higher provenance tier.")]);
    expect(tally.attackEvents[0]?.human).toBe("Needs a higher provenance tier.");
  });

  it("counts a relaxation attempt as alarming and a tier refusal as not", () => {
    const tally = fold([
      rejection(1, TIER, "a"),
      rejection(2, TIER, "b"),
      rejection(3, RELAX, "c"),
    ]);
    expect(tally.rangeBlockedCount).toBe(3);
    expect(alarmingCount(tally.attackEvents)).toBe(1);
  });

  it("raises no alarm at all for a run of ordinary tier refusals", () => {
    const tally = fold([rejection(1, TIER, "a"), rejection(2, TIER, "b")]);
    expect(alarmingCount(tally.attackEvents)).toBe(0);
  });
});
