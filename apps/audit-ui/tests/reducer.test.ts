import { describe, expect, it } from "vitest";
import { applyFrame, initialLedgerState } from "../src/ledger/reducer.ts";
import { happyPurchaseFrames, HAPPY_TXN_ID } from "../src/ledger/fixtures/happyPurchase.ts";
import { t1BlockFrames, T1_TXN_ID } from "../src/ledger/fixtures/t1Block.ts";
import { replayBlockedFrames, REPLAY_TXN_ID } from "../src/ledger/fixtures/replayBlocked.ts";
import { coolingOffFrames, COOLOFF_TXN_ID, COOLOFF_ID } from "../src/ledger/fixtures/coolingOff.ts";
import { stage0BlockedFrames, STAGE0_TXN_ID } from "../src/ledger/fixtures/stage0Blocked.ts";
import { findBreakIndex } from "../src/kolam/thread.ts";
import type { LedgerState } from "../src/ledger/reducer.ts";

function fold(frames: ReturnType<typeof happyPurchaseFrames>): LedgerState {
  return frames.reduce(applyFrame, initialLedgerState);
}

describe("applyFrame — happy purchase", () => {
  const state = fold(happyPurchaseFrames());

  it("assembles a full txn view", () => {
    const txn = state.txns[HAPPY_TXN_ID];
    expect(txn).toBeDefined();
    expect(txn?.memories.length).toBeGreaterThan(0);
    expect(txn?.checks).toHaveLength(8);
  });

  it("carries the signed intent, the assembled cart, and the captured outcome", () => {
    const txn = state.txns[HAPPY_TXN_ID];
    expect(txn?.cart?.total_paise).toBe(129_900);
    expect(txn?.outcome?.status).toBe("captured");
  });

  it("stamps the active intent onto the txn even though intent frames carry txn_id: null", () => {
    // Regression: intent.* frames precede any specific transaction, so they
    // can't be folded by `withTxn`'s txn_id branch directly — the active
    // intent has to be tracked globally and stamped on as the txn opens.
    const txn = state.txns[HAPPY_TXN_ID];
    expect(txn?.intent).toBeDefined();
    expect(txn?.intent?.signed_at).not.toBeNull();
  });

  it("builds one thread event per ledger frame touching the txn", () => {
    const txn = state.txns[HAPPY_TXN_ID];
    const framesForTxn = happyPurchaseFrames().filter((f) => f.txn_id === HAPPY_TXN_ID);
    expect(txn?.threadEvents).toHaveLength(framesForTxn.length);
    expect(findBreakIndex(txn?.threadEvents ?? [])).toBeUndefined();
  });

});

describe("applyFrame — idempotence (§4.1: backfill and stream can overlap freely)", () => {
  it("is idempotent on id — replaying the same frame is a no-op", () => {
    const frames = happyPurchaseFrames();
    const already = fold(frames);
    const replayed = frames.reduce(applyFrame, already);
    expect(replayed).toEqual(already);
  });

  it("tolerates out-of-order overlap between backfill and stream", () => {
    const frames = happyPurchaseFrames();
    const sequential = fold(frames);
    const withOverlap = [...frames, ...frames.slice(0, 3)].reduce(applyFrame, initialLedgerState);
    expect(withOverlap).toEqual(sequential);
  });
});

describe("applyFrame — T-1 memory poisoning block", () => {
  const state = fold(t1BlockFrames());
  const txn = state.txns[T1_TXN_ID];

  it("marks the thread broken at the rejected write", () => {
    expect(findBreakIndex(txn?.threadEvents ?? [])).toBeDefined();
  });

  it("tallies the block on the range counter", () => {
    expect(state.rangeBlockedCount).toBeGreaterThanOrEqual(1);
    expect(state.attackEvents[0]?.reasonCode).toBe("MEMORY_TIER_VIOLATION");
  });

  it("records the rejected memory with its reason", () => {
    const rejected = txn?.memories.find((m) => m.outcome === "rejected");
    expect(rejected?.rejectionReason).toBe("MEMORY_TIER_VIOLATION");
    expect(rejected?.tier).toBe("P0");
  });
});

describe("applyFrame — replay blocked (T-31)", () => {
  const state = fold(replayBlockedFrames());
  const txn = state.txns[REPLAY_TXN_ID];

  it("fails the nonce check and breaks the thread at the verdict", () => {
    const nonceCheck = txn?.checks.find((c) => c.check === "nonce");
    expect(nonceCheck?.passed).toBe(false);
    expect(findBreakIndex(txn?.threadEvents ?? [])).toBeDefined();
  });
});

describe("applyFrame — stage-0 admission rejection (T-27)", () => {
  const state = fold(stage0BlockedFrames());
  const txn = state.txns[STAGE0_TXN_ID];

  it("carries a stage0Rejection with zero checks — never a vacuous pass", () => {
    expect(txn?.checks).toHaveLength(0);
    expect(txn?.stage0Rejection?.reason_code).toBe("URI_DOWNGRADE");
  });

  it("still breaks the thread — an empty checks array is a fail, not a pass", () => {
    expect(findBreakIndex(txn?.threadEvents ?? [])).toBe(0);
  });
});

describe("applyFrame — cooling-off park then cancel", () => {
  it("parks the cart, then removes it from cooloff on cancel", () => {
    const frames = coolingOffFrames();
    const parkedIndex = frames.findIndex((f) => f.kind === "cooloff.parked");
    const afterPark = fold(frames.slice(0, parkedIndex + 1));
    expect(afterPark.cooloff[COOLOFF_ID]?.txn_id).toBe(COOLOFF_TXN_ID);

    const afterCancel = fold(frames);
    expect(afterCancel.cooloff[COOLOFF_ID]).toBeUndefined();
  });
});
