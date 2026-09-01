import { describe, expect, it } from "vitest";

import { PriceAnchorAnalyzer } from "../src/index.js";
import { append, newStack, TENANT } from "./harness.js";

const SKU = "sku-runner";
const MERCHANT = "asics";
const DAY_MS = 24 * 60 * 60 * 1000;

function quoteAt(stack: ReturnType<typeof newStack>, instant: Date, pricePaise: number, jti: string) {
  stack.clock.set(instant);
  const stored = append(stack, "catalog.quote.received", {
    merchant_id: MERCHANT,
    sku_id: SKU,
    total_paise: pricePaise,
    quote_jti: jti,
  });
  stack.runner.runPending();
  return stored;
}

describe("PriceAnchorAnalyzer.asOf — bi-temporal, no look-ahead", () => {
  it("never returns a price point the system had not yet observed on that day", () => {
    const stack = newStack();
    const day0 = new Date("2026-08-01T00:00:00.000Z");
    quoteAt(stack, day0, 100000, "q1");
    quoteAt(stack, new Date(day0.getTime() + 10 * DAY_MS), 90000, "q2");
    quoteAt(stack, new Date(day0.getTime() + 20 * DAY_MS), 80000, "q3");

    const analyzer = new PriceAnchorAnalyzer(stack.db, stack.clock);
    const asOfDay5 = analyzer.asOf(TENANT, SKU, new Date(day0.getTime() + 5 * DAY_MS).toISOString());
    const asOfDay15 = analyzer.asOf(TENANT, SKU, new Date(day0.getTime() + 15 * DAY_MS).toISOString());
    const asOfDay25 = analyzer.asOf(TENANT, SKU, new Date(day0.getTime() + 25 * DAY_MS).toISOString());

    expect(asOfDay5?.price_paise).toBe(100000);
    expect(asOfDay15?.price_paise).toBe(90000);
    expect(asOfDay25?.price_paise).toBe(80000);
  });

  it("returns null before the SKU had ever been quoted", () => {
    const stack = newStack();
    const day0 = new Date("2026-08-01T00:00:00.000Z");
    quoteAt(stack, day0, 100000, "q1");

    const analyzer = new PriceAnchorAnalyzer(stack.db, stack.clock);
    const before = analyzer.asOf(TENANT, SKU, new Date(day0.getTime() - DAY_MS).toISOString());
    expect(before).toBeNull();
  });
});

describe("PriceAnchorAnalyzer.priceHistoryFor — the /folds/prices/:sku shape", () => {
  it("reports insufficient_data with an empty points list for an unquoted SKU", () => {
    const stack = newStack();
    const analyzer = new PriceAnchorAnalyzer(stack.db, stack.clock);
    const response = analyzer.priceHistoryFor(TENANT, "sku-never-quoted", 30);

    expect(response).toEqual({
      sku_id: "sku-never-quoted",
      points: [],
      anchor: { median_paise: 0, days_at_or_below: 0, window_days: 30, verdict: "insufficient_data" },
    });
  });

  it("returns ascending points for a quoted SKU", () => {
    const stack = newStack();
    const day0 = new Date("2026-08-01T00:00:00.000Z");
    quoteAt(stack, day0, 129900, "q1");
    stack.clock.set(new Date(day0.getTime() + 5 * DAY_MS));

    const analyzer = new PriceAnchorAnalyzer(stack.db, stack.clock);
    const response = analyzer.priceHistoryFor(TENANT, SKU, 30);

    expect(response.sku_id).toBe(SKU);
    expect(response.points).toHaveLength(1);
    expect(response.points[0]).toMatchObject({ price_paise: 129900, tier: 2 });
  });
});

describe("PriceAnchorAnalyzer.priceHistoryFor — anchor verdicts", () => {

  it("reports 'consistent' when the price held steady across the whole window", () => {
    const stack = newStack();
    const day0 = new Date("2026-08-01T00:00:00.000Z");
    quoteAt(stack, day0, 150000, "q1");
    stack.clock.set(new Date(day0.getTime() + 29 * DAY_MS));

    const analyzer = new PriceAnchorAnalyzer(stack.db, stack.clock);
    const anchor = analyzer.priceHistoryFor(TENANT, SKU, 30).anchor;

    expect(anchor.median_paise).toBe(150000);
    expect(anchor.days_at_or_below).toBe(anchor.window_days);
    expect(anchor.verdict).toBe("consistent");
  });

  it("reports 'volatile' when most of the window sat above the eventual median", () => {
    const stack = newStack();
    const day0 = new Date("2026-08-01T00:00:00.000Z");
    quoteAt(stack, day0, 200000, "q1");
    quoteAt(stack, new Date(day0.getTime() + 25 * DAY_MS), 50000, "q2");
    stack.clock.set(new Date(day0.getTime() + 29 * DAY_MS));

    const analyzer = new PriceAnchorAnalyzer(stack.db, stack.clock);
    const anchor = analyzer.priceHistoryFor(TENANT, SKU, 30).anchor;

    expect(anchor.verdict).toBe("volatile");
  });
});
