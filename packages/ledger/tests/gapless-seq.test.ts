import { describe, expect, it } from "vitest";

import { GENESIS_HASH } from "@covenant/domain";

import { draft, newLedger } from "./harness.js";

const BURST = 250;

describe("seq is head+1, assigned inside the transaction", () => {
  it("stays gapless across a burst inside one transaction", () => {
    const ledger = newLedger();
    ledger.txn.run("burst", () => {
      for (let index = 0; index < BURST; index += 1) {
        ledger.writer.append(draft("rzp.polled", { attempt: index }));
      }
    });
    const seqs = ledger.reader.readFrom(1, BURST * 2).map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: BURST }, (_, i) => i + 1));
  });

  it("stays gapless across a burst of separate transactions", () => {
    const ledger = newLedger();
    for (let index = 0; index < BURST; index += 1) {
      ledger.txn.run("tick", () => {
        ledger.writer.append(draft("rzp.polled", { attempt: index }));
      });
    }
    expect(ledger.reader.height()).toBe(BURST);
    expect(ledger.reader.readFrom(1, BURST * 2)).toHaveLength(BURST);
  });
});

describe("a rolled-back transaction leaves no hole", () => {
  it("reuses the seq the discarded append would have taken", () => {
    const ledger = newLedger();
    ledger.txn.run("kept", () => {
      ledger.writer.append(draft("txn.opened", { n: 1 }));
    });
    expect(() =>
      ledger.txn.run("discarded", () => {
        ledger.writer.append(draft("txn.opened", { n: 2 }));
        throw new Error("policy said no");
      }),
    ).toThrow("policy said no");
    ledger.txn.run("next", () => {
      ledger.writer.append(draft("txn.opened", { n: 3 }));
    });
    // AUTOINCREMENT would have consumed 2 and left the client waiting for it.
    expect(ledger.reader.readFrom(1, 10).map((e) => e.seq)).toEqual([1, 2]);
  });
});

describe("the chain links every append", () => {
  it("starts at GENESIS and threads prev_hash to this_hash", () => {
    const ledger = newLedger();
    ledger.txn.run("chain", () => {
      for (let index = 0; index < 10; index += 1) {
        ledger.writer.append(draft("catalog.read", { index }));
      }
    });
    const events = ledger.reader.readFrom(1, 100);
    expect(events[0]?.prev_hash).toBe(GENESIS_HASH);
    for (const [index, event] of events.entries()) {
      const previous = events[index - 1];
      expect(event.prev_hash).toBe(previous?.this_hash ?? GENESIS_HASH);
      expect(ledger.chain.recompute(event)).toBe(event.this_hash);
    }
  });

  it("gives the caller no way to forge seq, ts or either hash", () => {
    const ledger = newLedger();
    const forged = {
      ...draft("attack.detected", { attack_id: "T-1" }),
      seq: 99,
      this_hash: "z".repeat(64),
    };
    const stored = ledger.writer.append(forged);
    expect(stored.seq).toBe(1);
    expect(stored.this_hash).toBe(ledger.chain.recompute(stored));
  });
});
