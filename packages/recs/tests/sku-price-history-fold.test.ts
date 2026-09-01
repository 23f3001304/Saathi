import { describe, expect, it } from "vitest";

import { append, newStack, TENANT } from "./harness.js";

const SKU = "sku-runner";
const MERCHANT = "asics";

function pointsFor(stack: ReturnType<typeof newStack>) {
  return stack.db
    .prepare(
      `SELECT tenant_id, merchant_id, sku_id, price_paise, t_valid_from, t_valid_to, tier, attestation_jti
       FROM sku_price_history WHERE tenant_id = ? AND sku_id = ? ORDER BY t_valid_from ASC`,
    )
    .all(TENANT, SKU) as {
    price_paise: number;
    t_valid_from: string;
    t_valid_to: string | null;
    tier: number;
    attestation_jti: string | null;
  }[];
}

describe("SkuPriceHistoryFold", () => {
  it("records a P2 price point per quote, keyed to the quote_jti", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", {
      merchant_id: MERCHANT,
      sku_id: SKU,
      total_paise: 899900,
      quote_jti: "urn:uuid:q1",
    });
    stack.runner.runPending();

    const points = pointsFor(stack);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ price_paise: 899900, tier: 2, attestation_jti: "urn:uuid:q1", t_valid_to: null });
  });

  it("closes the prior interval when a newer quote supersedes it (bi-temporal)", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: SKU, total_paise: 899900, quote_jti: "q1" });
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: SKU, total_paise: 799900, quote_jti: "q2" });
    stack.runner.runPending();

    const points = pointsFor(stack);
    expect(points).toHaveLength(2);
    expect(points[0]?.t_valid_to).toBe(points[1]?.t_valid_from);
    expect(points[1]?.t_valid_to).toBeNull();
  });
});

describe("SkuPriceHistoryFold: verdict.emitted and idempotency", () => {
  it("records a stronger P3 point on an approve verdict that carries SKU pricing", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: SKU, total_paise: 899900, quote_jti: "q1" });
    append(stack, "verdict.emitted", {
      decision: "approve",
      merchant_id: MERCHANT,
      sku_id: SKU,
      total_paise: 899900,
      quote_jti: "q1",
    });
    stack.runner.runPending();

    const points = pointsFor(stack);
    expect(points.map((p) => p.tier)).toEqual([2, 3]);
  });
});

describe("SkuPriceHistoryFold: verdicts without pricing, and idempotency", () => {
  it("a bare approve verdict without SKU fields is a no-op", () => {
    const stack = newStack();
    append(stack, "verdict.emitted", { decision: "approve" });
    stack.runner.runPending();

    expect(pointsFor(stack)).toHaveLength(0);
  });

  it("a rejected verdict never produces a price point", () => {
    const stack = newStack();
    append(stack, "verdict.emitted", {
      decision: "reject",
      merchant_id: MERCHANT,
      sku_id: SKU,
      total_paise: 100,
      reason_code: "CART_QUOTE_MISMATCH",
    });
    stack.runner.runPending();

    expect(pointsFor(stack)).toHaveLength(0);
  });

  it("re-applying the same quote twice does not duplicate or reopen the timeline", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: SKU, total_paise: 100, quote_jti: "q1" });
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: SKU, total_paise: 200, quote_jti: "q2" });
    stack.runner.runPending();
    const first = pointsFor(stack);
    stack.runner.runPending();
    expect(pointsFor(stack)).toEqual(first);
  });
});
