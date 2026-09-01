import { describe, expect, it } from "vitest";

import { RegretWeighter } from "../src/index.js";
import { append, newStack, TENANT, USER } from "./harness.js";

describe("RegretWeighter.reweight", () => {
  it("flips the ordering of two equally-scored candidates by regret history", () => {
    const stack = newStack();
    // sku-good was kept twice; sku-bad was regretted twice — same raw score.
    append(stack, "cart.assembled", { user_id: USER, cart_hash: "sha256:1", total_paise: 100, lines: [{ sku_id: "sku-good" }] }, "txn_1");
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_1", verdict: "keep", note: null }, "txn_1");
    append(stack, "cart.assembled", { user_id: USER, cart_hash: "sha256:2", total_paise: 100, lines: [{ sku_id: "sku-good" }] }, "txn_2");
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_2", verdict: "keep", note: null }, "txn_2");
    append(stack, "cart.assembled", { user_id: USER, cart_hash: "sha256:3", total_paise: 100, lines: [{ sku_id: "sku-bad" }] }, "txn_3");
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_3", verdict: "regret", note: null }, "txn_3");
    append(stack, "cart.assembled", { user_id: USER, cart_hash: "sha256:4", total_paise: 100, lines: [{ sku_id: "sku-bad" }] }, "txn_4");
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_4", verdict: "regret", note: null }, "txn_4");
    stack.runner.runPending();

    const weighter = new RegretWeighter(stack.db);
    const candidates = [
      { skuId: "sku-bad", merchantId: null, score: 0.5 },
      { skuId: "sku-good", merchantId: null, score: 0.5 },
    ];
    const before = [...candidates].sort((a, b) => b.score - a.score).map((c) => c.skuId);
    const after = weighter
      .reweight(TENANT, USER, candidates)
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((c) => c.skuId);

    expect(before).toEqual(["sku-bad", "sku-good"]); // a tie; insertion order wins
    expect(after).toEqual(["sku-good", "sku-bad"]); // regret history flips it
  });
});

describe("RegretWeighter.reweight — merchant trust and neutrality", () => {
  it("boosts a candidate whose merchant has a high trust score", () => {
    const stack = newStack();
    for (let i = 0; i < 20; i += 1) {
      append(stack, "catalog.quote.received", { merchant_id: "trusted", sku_id: "sku-x", total_paise: 100, quote_jti: `q${i}` });
    }
    stack.runner.runPending();

    const weighter = new RegretWeighter(stack.db);
    const [trusted] = weighter.reweight(TENANT, USER, [
      { skuId: "sku-x", merchantId: "trusted", score: 1 },
    ]);
    const [unknown] = weighter.reweight(TENANT, USER, [
      { skuId: "sku-x", merchantId: "unknown-merchant", score: 1 },
    ]);
    expect(trusted?.score).toBeGreaterThan(unknown?.score ?? 0);
  });

  it("is neutral (multiplier 1) with no regret, trust, or preference signal at all", () => {
    const stack = newStack();
    const weighter = new RegretWeighter(stack.db);
    const [result] = weighter.reweight(TENANT, USER, [
      { skuId: "sku-unknown", merchantId: null, score: 0.7 },
    ]);
    expect(result?.score).toBeCloseTo(0.7, 10);
  });

  it("distinctContributors counts distinct transactions behind regret.recorded", () => {
    const stack = newStack();
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_a", verdict: "keep", note: null }, "txn_a");
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_b", verdict: "regret", note: null }, "txn_b");
    stack.runner.runPending();

    const weighter = new RegretWeighter(stack.db);
    expect(weighter.distinctContributors(TENANT)).toBe(2);
  });
});
