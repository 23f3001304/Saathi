import { describe, expect, it } from "vitest";

import { draft, newLedger, quote } from "./harness.js";
import type { Ledger } from "./harness.js";

const QUOTES: readonly (readonly [string, string, number])[] = [
  ["asics", "sku-runner", 899900],
  ["asics", "sku-trail", 1249900],
  ["nike", "sku-runner", 799900],
  ["asics", "sku-runner", 869900],
  ["puma", "sku-court", 459900],
];

function seed(ledger: Ledger): void {
  ledger.txn.run("seed", () => {
    for (const [merchant, sku, total] of QUOTES) {
      ledger.writer.append(quote(merchant, sku, total));
      ledger.writer.append(
        draft("catalog.read", { merchant_id: merchant, result_count: 3 }),
      );
    }
  });
}

describe("the fold engine is deterministic", () => {
  it("materialises every event exactly once", () => {
    const ledger = newLedger();
    seed(ledger);
    const first = ledger.runner.runPending();
    expect(first.head).toBe(QUOTES.length * 2);
    expect(first.folds).toEqual([
      { name: "merchant_trust", lastSeq: 10 },
      { name: "sku_price_history", lastSeq: 10 },
    ]);
    // Re-applying an event is a no-op (section 3.10 rule 3).
    expect(ledger.runner.runPending().applied).toBe(0);
  });

  it("is idempotent: a second run cannot move a state hash", () => {
    const ledger = newLedger();
    seed(ledger);
    ledger.runner.runPending();
    const before = ledger.registry.tables().map((t) => ledger.hasher.hash(t));
    ledger.runner.runPending();
    expect(ledger.registry.tables().map((t) => ledger.hasher.hash(t))).toEqual(
      before,
    );
  });

  it("advances incrementally, arriving where a single pass would", () => {
    const stepwise = newLedger();
    const batched = newLedger();
    seed(stepwise);
    seed(batched);
    for (let index = 0; index < 10; index += 1) {
      stepwise.runner.runPending(1);
    }
    batched.runner.runPending();
    expect(stepwise.hasher.hash("merchant_trust")).toEqual(
      batched.hasher.hash("merchant_trust"),
    );
  });
});

describe("replay proof: fold twice, diff empty", () => {
  it("rebuilds from seq 1 into a shadow and finds no drift", () => {
    const ledger = newLedger();
    seed(ledger);
    ledger.runner.runPending();
    const result = ledger.rebuilder.rebuild();
    expect(result.ok).toBe(true);
    expect(result.drift).toEqual([]);
    expect(result.events).toBe(QUOTES.length * 2);
    expect(result.liveStateHash).toBe(result.replayedStateHash);
  });

  it("returns the same hashes on a second, independent rebuild", () => {
    const ledger = newLedger();
    seed(ledger);
    ledger.runner.runPending();
    const first = ledger.rebuilder.rebuild();
    const second = ledger.rebuilder.rebuild();
    expect(second.replayedStateHash).toBe(first.replayedStateHash);
    expect(second.tables).toEqual(first.tables);
  });

});

describe("the rebuild reports what diverged", () => {
  it("reports drift per table when the live projection is edited", () => {
    const ledger = newLedger();
    seed(ledger);
    ledger.runner.runPending();
    ledger.db.exec("UPDATE merchant_trust SET quotes_total = 99");
    const result = ledger.rebuilder.rebuild();
    expect(result.ok).toBe(false);
    expect(result.drift.map((entry) => entry.table)).toEqual([
      "merchant_trust",
    ]);
    expect(result.liveStateHash).not.toBe(result.replayedStateHash);
  });

  it("proves an empty ledger folds to an empty, equal state", () => {
    const ledger = newLedger();
    const result = ledger.rebuilder.rebuild();
    expect(result).toMatchObject({ ok: true, events: 0 });
    expect(result.tables.map((state) => state.rows)).toEqual([0, 0]);
  });
});
