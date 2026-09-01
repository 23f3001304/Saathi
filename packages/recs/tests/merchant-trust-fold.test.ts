import { describe, expect, it } from "vitest";

import { scoreFor } from "../src/index.js";
import { append, newStack, TENANT } from "./harness.js";

const MERCHANT = "asics";

function trustRow(db: ReturnType<typeof newStack>["db"]) {
  return db
    .prepare("SELECT * FROM merchant_trust WHERE tenant_id = ? AND merchant_id = ?")
    .get(TENANT, MERCHANT) as
    | {
        quotes_total: number;
        quote_mismatches: number;
        catalog_reads: number;
        manipulation_attempts: number;
        refunds_requested: number;
        refunds_honored: number;
        cooloff_cancellations: number;
        stock_conflicts: number;
        carts_total: number;
        trust_score: number;
      }
    | undefined;
}

describe("MerchantTrustFold: counters and score", () => {
  it("counts quotes and catalog reads, and computes a matching trust score", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: "sku-1", total_paise: 100 });
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: "sku-2", total_paise: 200 });
    append(stack, "catalog.read", { merchant_id: MERCHANT, query: "shoes", result_count: 3 });
    stack.runner.runPending();

    const row = trustRow(stack.db);
    const expected = scoreFor({
      quotesTotal: 2,
      quoteMismatches: 0,
      catalogReads: 1,
      manipulationAttempts: 0,
      refundsRequested: 0,
      refundsHonored: 0,
    });
    expect(row?.quotes_total).toBe(2);
    expect(row?.catalog_reads).toBe(1);
    expect(row?.trust_score).toBeCloseTo(expected, 10);
  });

  it("increments quote_mismatches only on a rejected CART_QUOTE_MISMATCH verdict", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: "sku-1", total_paise: 100 });
    append(stack, "verdict.emitted", {
      merchant_id: MERCHANT,
      decision: "reject",
      reason_code: "CART_QUOTE_MISMATCH",
    });
    append(stack, "verdict.emitted", { merchant_id: MERCHANT, decision: "reject", reason_code: "STOCK_CONFLICT" });
    append(stack, "verdict.emitted", { merchant_id: MERCHANT, decision: "approve" });
    stack.runner.runPending();

    const row = trustRow(stack.db);
    expect(row?.quote_mismatches).toBe(1);
    expect(row?.carts_total).toBe(3);
  });
});

describe("MerchantTrustFold: manipulation attempts", () => {
  it("counts manipulation attempts only for the poisoning reason code", () => {
    const stack = newStack();
    append(stack, "memory.write.rejected", {
      merchant_id: MERCHANT,
      reason_code: "AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL",
      rule: "R4",
      human: "blocked",
    });
    append(stack, "memory.write.rejected", {
      merchant_id: MERCHANT,
      reason_code: "UNIT_MISMATCH",
      rule: "R5",
      human: "blocked",
    });
    stack.runner.runPending();

    expect(trustRow(stack.db)?.manipulation_attempts).toBe(1);
  });
});

describe("MerchantTrustFold: STOCK_CONFLICT exclusion (section 5.2 d)", () => {
  it("tracks stock_conflicts but the trust score is unaffected by them", () => {
    const withConflicts = newStack();
    const withoutConflicts = newStack();
    for (const stack of [withConflicts, withoutConflicts]) {
      append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: "sku-1", total_paise: 100 });
      append(stack, "catalog.read", { merchant_id: MERCHANT, query: "q", result_count: 1 });
    }
    append(withConflicts, "stock.conflict", {
      merchant_id: MERCHANT,
      reservation_id: "rsv_1",
      sku_id: "sku-1",
      winner_cart_id: "cart_x",
    });
    append(withConflicts, "stock.conflict", {
      merchant_id: MERCHANT,
      reservation_id: "rsv_2",
      sku_id: "sku-1",
      winner_cart_id: "cart_y",
    });
    withConflicts.runner.runPending();
    withoutConflicts.runner.runPending();

    const conflicted = trustRow(withConflicts.db);
    const clean = trustRow(withoutConflicts.db);
    expect(conflicted?.stock_conflicts).toBe(2);
    expect(clean?.stock_conflicts).toBe(0);
    expect(conflicted?.trust_score).toBe(clean?.trust_score);
  });
});

describe("MerchantTrustFold: refunds, cooloff, and guards", () => {
  it("refunds and cooloff cancellations accumulate per merchant", () => {
    const stack = newStack();
    append(stack, "refund.requested", { merchant_id: MERCHANT, rzp_refund_id: "rfnd_1", amount_paise: 500 });
    append(stack, "refund.honored", { merchant_id: MERCHANT, rzp_refund_id: "rfnd_1", amount_paise: 500 });
    append(stack, "cooloff.cancelled", { merchant_id: MERCHANT, hold_id: "hold_1", reason: "changed_mind" });
    stack.runner.runPending();

    const row = trustRow(stack.db);
    expect(row?.refunds_requested).toBe(1);
    expect(row?.refunds_honored).toBe(1);
    expect(row?.cooloff_cancellations).toBe(1);
  });

  it("is a no-op when the payload carries no merchant_id", () => {
    const stack = newStack();
    append(stack, "catalog.read", { query: "no merchant here", result_count: 0 });
    stack.runner.runPending();

    const row = stack.db.prepare("SELECT count(*) AS n FROM merchant_trust").get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("re-applying the same events twice never double-counts (idempotent)", () => {
    const stack = newStack();
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: "sku-1", total_paise: 100 });
    stack.runner.runPending();
    const first = trustRow(stack.db)?.quotes_total;
    stack.runner.runPending();
    expect(trustRow(stack.db)?.quotes_total).toBe(first);
  });
});
