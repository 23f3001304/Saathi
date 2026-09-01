import { describe, expect, it } from "vitest";

import { draft, newLedger } from "./harness.js";

describe("frames publish only after COMMIT", () => {
  it("publishes nothing while the transaction is still open", () => {
    const ledger = newLedger();
    ledger.txn.run("verify-cart", () => {
      ledger.writer.append(draft("txn.opened", { state: "open" }));
      ledger.writer.append(draft("verdict.emitted", { decision: "approve" }));
      expect(ledger.published.batches).toHaveLength(0);
    });
    expect(ledger.published.batches).toHaveLength(1);
    expect(ledger.published.frames).toHaveLength(2);
  });

  it("hands the hub one batch in seq order", () => {
    const ledger = newLedger();
    ledger.txn.run("burst", () => {
      for (let index = 0; index < 20; index += 1) {
        ledger.writer.append(draft("rzp.polled", { attempt: index }));
      }
    });
    expect(ledger.published.frames.map((frame) => frame.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

});

describe("the frame is the stored event, projected", () => {
  it("matches frameOf field for field", () => {
    const ledger = newLedger();
    ledger.txn.run("one", () => {
      ledger.writer.append(draft("cart.assembled", { total_paise: 1 }, "txn_a"));
    });
    const [stored] = ledger.reader.readFrom(1, 1);
    if (stored === undefined) {
      throw new Error("the append did not land");
    }
    expect(ledger.published.frames[0]).toEqual({
      id: stored.seq,
      ts: stored.ts,
      actor: stored.actor,
      kind: stored.kind,
      txn_id: stored.txn_id,
      payload: stored.payload,
      prev_hash: stored.prev_hash,
      this_hash: stored.this_hash,
    });
  });
});

describe("a rollback publishes nothing", () => {
  it("discards the buffer when the transaction throws", () => {
    const ledger = newLedger();
    expect(() =>
      ledger.txn.run("rejected", () => {
        ledger.writer.append(draft("txn.opened", {}));
        ledger.writer.append(draft("attack.detected", { attack_id: "T-31" }));
        throw new Error("nonce already burned");
      }),
    ).toThrow("nonce already burned");
    expect(ledger.published.batches).toEqual([]);
    expect(ledger.reader.height()).toBe(0);
  });

  it("keeps an earlier committed batch", () => {
    const ledger = newLedger();
    ledger.txn.run("kept", () => {
      ledger.writer.append(draft("txn.opened", {}));
    });
    expect(() =>
      ledger.txn.run("discarded", () => {
        ledger.writer.append(draft("txn.cancelled", {}));
        throw new Error("no");
      }),
    ).toThrow();
    expect(ledger.published.frames.map((frame) => frame.kind)).toEqual([
      "txn.opened",
    ]);
  });
});

describe("nested runs are savepoints under one publish", () => {
  it("publishes once, at the outermost commit", () => {
    const ledger = newLedger();
    ledger.txn.run("outer", () => {
      ledger.writer.append(draft("txn.opened", {}));
      ledger.txn.run("inner", () => {
        ledger.writer.append(draft("envelope.reserved", {}));
        expect(ledger.published.batches).toHaveLength(0);
      });
      expect(ledger.published.batches).toHaveLength(0);
    });
    expect(ledger.published.batches).toHaveLength(1);
    expect(ledger.published.frames).toHaveLength(2);
  });

  it("retracts only the inner savepoint's frames", () => {
    const ledger = newLedger();
    ledger.txn.run("outer", () => {
      ledger.writer.append(draft("txn.opened", {}));
      expect(() =>
        ledger.txn.run("inner", () => {
          ledger.writer.append(draft("stock.conflict", {}));
          throw new Error("stock lost");
        }),
      ).toThrow("stock lost");
    });
    expect(ledger.published.frames.map((frame) => frame.kind)).toEqual([
      "txn.opened",
    ]);
  });
});
