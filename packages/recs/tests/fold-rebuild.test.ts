import { describe, expect, it } from "vitest";

import { append, newStack } from "./harness.js";

/** A mixed sequence touching all three flywheel folds at once. */
function seed(stack: ReturnType<typeof newStack>): void {
  append(stack, "catalog.quote.received", { merchant_id: "asics", sku_id: "sku-a", total_paise: 1000, quote_jti: "q1" });
  append(stack, "catalog.quote.received", { merchant_id: "asics", sku_id: "sku-a", total_paise: 900, quote_jti: "q2" });
  append(stack, "catalog.read", { merchant_id: "asics", query: "shoes", result_count: 4 });
  append(stack, "verdict.emitted", { decision: "approve", merchant_id: "asics", sku_id: "sku-a", total_paise: 900, quote_jti: "q2" });
  append(stack, "verdict.emitted", { decision: "reject", merchant_id: "nike", reason_code: "CART_QUOTE_MISMATCH" });
  append(stack, "memory.write.rejected", { merchant_id: "nike", reason_code: "AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL", rule: "R4", human: "blocked" });
  append(stack, "stock.conflict", { merchant_id: "asics", reservation_id: "rsv_1", sku_id: "sku-a", winner_cart_id: "cart_x" });
  append(stack, "intent.signed", { mandate_id: "urn:uuid:m1", user_id: "user_kavya", bounds: { merchants: ["asics"], skus: ["sku-a"] }, constraint_ids: [] });
  append(stack, "user.confirmed", { user_id: "user_kavya", subject: "brand:asics", predicate: "preferred", value: true });
  append(stack, "cart.assembled", { user_id: "user_kavya", cart_hash: "sha256:x", total_paise: 900, lines: [{ sku_id: "sku-a" }] });
  append(stack, "regret.recorded", { user_id: "user_kavya", txn_id: "txn_1", verdict: "keep", note: null });
}

describe("the flywheel folds are deterministic (section 3.10 rule 4, N3)", () => {
  it("rebuilds from seq 1 into a shadow schema with zero drift", () => {
    const stack = newStack();
    seed(stack);
    stack.runner.runPending();

    const result = stack.rebuilder.rebuild();
    expect(result.ok).toBe(true);
    expect(result.drift).toEqual([]);
    expect(result.liveStateHash).toBe(result.replayedStateHash);
    expect(result.tables.map((t) => t.table)).toEqual([
      "merchant_trust",
      "sku_price_history",
      "user_prefs",
    ]);
  });

  it("arrives at the same state hash whether applied in one pass or incrementally", () => {
    const batched = newStack();
    const stepwise = newStack();
    seed(batched);
    seed(stepwise);
    batched.runner.runPending();
    for (let i = 0; i < 11; i += 1) {
      stepwise.runner.runPending(1);
    }
    for (const table of ["merchant_trust", "sku_price_history", "user_prefs"]) {
      expect(stepwise.hasher.hash(table)).toEqual(batched.hasher.hash(table));
    }
  });

  it("a second, independent rebuild reproduces the same replayed hash", () => {
    const stack = newStack();
    seed(stack);
    stack.runner.runPending();
    const first = stack.rebuilder.rebuild();
    const second = stack.rebuilder.rebuild();
    expect(second.replayedStateHash).toBe(first.replayedStateHash);
  });
});

describe("the flywheel folds: empty and drifted states", () => {
  it("an empty ledger folds to an empty, equal state across all three tables", () => {
    const stack = newStack();
    const result = stack.rebuilder.rebuild();
    expect(result).toMatchObject({ ok: true, events: 0 });
    expect(result.tables.map((t) => t.rows)).toEqual([0, 0, 0]);
  });

  it("flags drift when a live projection is hand-edited after materialising", () => {
    const stack = newStack();
    seed(stack);
    stack.runner.runPending();
    stack.db.exec("UPDATE merchant_trust SET trust_score = 0.999");
    const result = stack.rebuilder.rebuild();
    expect(result.ok).toBe(false);
    expect(result.drift.map((d) => d.table)).toEqual(["merchant_trust"]);
  });
});
