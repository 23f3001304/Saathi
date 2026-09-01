import { describe, expect, it } from "vitest";

import { draft, newLedger } from "./harness.js";
import type { Ledger } from "./harness.js";

function seed(ledger: Ledger): void {
  ledger.txn.run("seed", () => {
    ledger.writer.append(draft("txn.opened", { n: 1 }, "txn_a"));
    ledger.writer.append(draft("catalog.read", { n: 2 }));
    ledger.writer.append(draft("cart.assembled", { n: 3 }, "txn_a"));
    ledger.writer.append(draft("txn.opened", { n: 4 }, "txn_b"));
    ledger.writer.append(draft("verdict.emitted", { n: 5 }, "txn_a"));
  });
}

describe("Last-Event-ID resume", () => {
  it.each([
    [0, [1, 2, 3, 4, 5]],
    [1, [2, 3, 4, 5]],
    [3, [4, 5]],
    [5, []],
    [9, []],
  ])("replays seq > %i after a reconnect", (lastEventId, expected) => {
    const ledger = newLedger();
    seed(ledger);
    const frames = ledger.reader.framesAfter(lastEventId, 100);
    expect(frames.map((frame) => frame.id)).toEqual(expected);
  });

  it("returns the identical frame shape as the live stream", () => {
    const ledger = newLedger();
    seed(ledger);
    expect(ledger.reader.framesAfter(0, 100)).toEqual(ledger.published.frames);
  });

  it("honours the limit so a backfill can page", () => {
    const ledger = newLedger();
    seed(ledger);
    expect(ledger.reader.framesAfter(0, 2).map((f) => f.id)).toEqual([1, 2]);
    expect(ledger.reader.framesAfter(2, 2).map((f) => f.id)).toEqual([3, 4]);
  });
});

describe("read paths", () => {
  it("readFrom is inclusive, readAfter is exclusive", () => {
    const ledger = newLedger();
    seed(ledger);
    expect(ledger.reader.readFrom(3, 10).map((e) => e.seq)).toEqual([3, 4, 5]);
    expect(ledger.reader.readAfter(3, 10).map((e) => e.seq)).toEqual([4, 5]);
  });

  it("reads one transaction's causal chain in seq order", () => {
    const ledger = newLedger();
    seed(ledger);
    expect(ledger.reader.byTxn("txn_a").map((e) => e.seq)).toEqual([1, 3, 5]);
    expect(ledger.reader.byTxn("txn_b").map((e) => e.seq)).toEqual([4]);
    expect(ledger.reader.byTxn("txn_missing")).toEqual([]);
  });

  it("reports the head, and null on an empty ledger", () => {
    const empty = newLedger();
    expect(empty.reader.head()).toBeNull();
    expect(empty.reader.height()).toBe(0);
    const ledger = newLedger();
    seed(ledger);
    expect(ledger.reader.head()?.seq).toBe(5);
    expect(ledger.reader.head()?.this_hash).toHaveLength(64);
  });

  it("round-trips the payload as a parsed object, not a string", () => {
    const ledger = newLedger();
    ledger.txn.run("one", () => {
      ledger.writer.append(
        draft("verdict.emitted", { decision: "hold", cues: ["a", "b"] }),
      );
    });
    expect(ledger.reader.readFrom(1, 1)[0]?.payload).toEqual({
      decision: "hold",
      cues: ["a", "b"],
    });
  });
});
