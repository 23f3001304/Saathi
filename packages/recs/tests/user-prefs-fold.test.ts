import { describe, expect, it } from "vitest";

import { append, newStack, TENANT, USER } from "./harness.js";

function prefRow(stack: ReturnType<typeof newStack>, prefKey: string, userId = USER) {
  return stack.db
    .prepare(
      `SELECT pref_key, value_json, tier, weight, observations
       FROM user_prefs WHERE tenant_id = ? AND user_id = ? AND pref_key = ?`,
    )
    .get(TENANT, userId, prefKey) as
    | { pref_key: string; value_json: string; tier: number; weight: number; observations: number }
    | undefined;
}

describe("UserPrefsFold", () => {
  it("reinforces an intent's merchant and sku allowlists at tier 3, weight 1.0", () => {
    const stack = newStack();
    append(stack, "intent.signed", {
      mandate_id: "urn:uuid:m1",
      user_id: USER,
      bounds: { merchants: ["asics"], skus: ["sku-runner"] },
      constraint_ids: [],
    });
    stack.runner.runPending();

    expect(prefRow(stack, "merchant:asics")).toMatchObject({ tier: 3, weight: 1, observations: 1 });
    expect(prefRow(stack, "sku:sku-runner")).toMatchObject({ tier: 3, weight: 1, observations: 1 });
  });

  it("stores a user.confirmed subject verbatim as the pref_key", () => {
    const stack = newStack();
    append(stack, "user.confirmed", { user_id: USER, subject: "brand:asics", predicate: "preferred", value: true });
    stack.runner.runPending();

    const row = prefRow(stack, "brand:asics");
    expect(row).toBeDefined();
    expect(JSON.parse(row?.value_json ?? "{}")).toEqual({ predicate: "preferred", value: true });
  });

  it("reinforces every SKU line of an assembled cart", () => {
    const stack = newStack();
    append(stack, "cart.assembled", {
      user_id: USER,
      cart_hash: "sha256:abc",
      total_paise: 300,
      lines: [{ sku_id: "sku-a", category: "footwear", qty: 1 }, { sku: "sku-b", qty: 2 }],
    });
    stack.runner.runPending();

    expect(prefRow(stack, "sku:sku-a")?.observations).toBe(1);
    expect(prefRow(stack, "sku:sku-b")?.observations).toBe(1);
  });
});

describe("UserPrefsFold: regret-adjusted weight", () => {
  it("reinforcing the same pref twice increments observations without resetting weight", () => {
    const stack = newStack();
    append(stack, "user.confirmed", { user_id: USER, subject: "category:footwear", predicate: "cap", value: 1500 });
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_1", verdict: "regret", note: null });
    append(stack, "user.confirmed", { user_id: USER, subject: "category:footwear", predicate: "cap", value: 1500 });
    stack.runner.runPending();

    const row = prefRow(stack, "category:footwear");
    expect(row?.observations).toBe(2);
    expect(row?.weight).toBeCloseTo(0.85, 10);
  });

  it("a regret shrinks every one of the user's preferences, and a keep boosts them", () => {
    const shrunk = newStack();
    const boosted = newStack();
    for (const stack of [shrunk, boosted]) {
      append(stack, "user.confirmed", { user_id: USER, subject: "brand:asics", predicate: "preferred", value: true });
      append(stack, "user.confirmed", { user_id: USER, subject: "brand:nike", predicate: "preferred", value: true });
    }
    append(shrunk, "regret.recorded", { user_id: USER, txn_id: "txn_1", verdict: "regret", note: null });
    append(boosted, "regret.recorded", { user_id: USER, txn_id: "txn_1", verdict: "keep", note: null });
    shrunk.runner.runPending();
    boosted.runner.runPending();

    expect(prefRow(shrunk, "brand:asics")?.weight).toBeCloseTo(0.85, 10);
    expect(prefRow(shrunk, "brand:nike")?.weight).toBeCloseTo(0.85, 10);
    expect(prefRow(boosted, "brand:asics")?.weight).toBeCloseTo(1.05, 10);
  });
});

describe("UserPrefsFold: scoping and guards", () => {
  it("never adjusts another user's preferences", () => {
    const stack = newStack();
    append(stack, "user.confirmed", { user_id: "other_user", subject: "brand:asics", predicate: "preferred", value: true });
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_1", verdict: "regret", note: null });
    stack.runner.runPending();

    expect(prefRow(stack, "brand:asics", "other_user")?.weight).toBe(1);
  });

  it("clamps weight to the [0.1, 2.0] band under repeated regret", () => {
    const stack = newStack();
    append(stack, "user.confirmed", { user_id: USER, subject: "brand:asics", predicate: "preferred", value: true });
    for (let i = 0; i < 40; i += 1) {
      append(stack, "regret.recorded", { user_id: USER, txn_id: `txn_${i}`, verdict: "regret", note: null });
    }
    stack.runner.runPending();

    expect(prefRow(stack, "brand:asics")?.weight).toBeGreaterThanOrEqual(0.1);
  });

  it("re-running the fold twice is idempotent", () => {
    const stack = newStack();
    append(stack, "user.confirmed", { user_id: USER, subject: "brand:asics", predicate: "preferred", value: true });
    append(stack, "regret.recorded", { user_id: USER, txn_id: "txn_1", verdict: "regret", note: null });
    stack.runner.runPending();
    const first = prefRow(stack, "brand:asics");
    stack.runner.runPending();
    expect(prefRow(stack, "brand:asics")).toEqual(first);
  });
});
