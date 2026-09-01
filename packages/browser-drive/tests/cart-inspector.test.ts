import { describe, expect, it } from "vitest";

import { CartCovenant } from "../src/cart/cart-covenant.js";
import type { CartDom, CartRowDom } from "../src/cart/cart-dom.js";
import { CartInspector } from "../src/cart/cart-inspector.js";
import { parsePaise, parseQty, toRupees } from "../src/cart/price.js";

const inspector = new CartInspector();

function dom(rows: readonly CartRowDom[], totals: readonly string[]): CartDom {
  return { rows, totalCandidates: totals, url: "https://bazaar.example/cart" };
}

function row(text: string, priceText: string | null, qtyText: string | null): CartRowDom {
  return { text, priceText, qtyText };
}

describe("price parsing", () => {
  it.each([
    ["₹3,499.00", 349900],
    ["₹3,499", 349900],
    ["Rs. 1,234.50", 123450],
    ["Rs 99", 9900],
    ["INR 1,23,456.78", 12345678],
    ["₹0.05", 5],
    ["₹ 300.00", 30000],
  ])("%s -> %i paise", (text, paise) => {
    expect(parsePaise(text)).toBe(paise);
  });

  it.each(["10% off", "2 left in stock", "size 9", "", "free"])(
    "refuses to read %s as a price",
    (text) => {
      expect(parsePaise(text)).toBeNull();
    },
  );

  it("formats paise back without a float path", () => {
    expect(toRupees(349900)).toBe("₹3499.00");
    expect(toRupees(5)).toBe("₹0.05");
  });

  it.each([
    ["Qty: 2", 2],
    ["Quantity 3", 3],
    ["2 × Trailfoot", 2],
    ["x 4", 4],
    ["no quantity here", 1],
    [null, 1],
  ])("reads quantity from %s", (text, qty) => {
    expect(parseQty(text)).toBe(qty);
  });
});

describe("CartInspector", () => {
  const ROWS = [
    row("Trailfoot Runner Qty: 1 ₹3,499.00", "₹3,499.00", "Qty: 1"),
    row("Merino trail socks Qty: 2 ₹300.00", "₹300.00", "Qty: 2"),
  ];

  it("reads a labelled grand total with high confidence when the rows agree", () => {
    const reading = inspector.inspect(dom(ROWS, ["Grand total ₹4,299.00"]));
    expect(reading.totalPaise).toBe(429900);
    expect(reading.confidence).toBe("high");
    expect(reading.basis).toBe("labelled_grand_total");
    expect(reading.items).toHaveLength(2);
  });

  it("prefers the grand total over a subtotal", () => {
    const reading = inspector.inspect(
      dom(ROWS, ["Subtotal ₹3,799.00", "Order total ₹4,299.00"]),
    );
    expect(reading.totalPaise).toBe(429900);
  });

  it("drops to medium when there are no rows to corroborate", () => {
    const reading = inspector.inspect(dom([], ["Grand total ₹4,299.00"]));
    expect(reading.confidence).toBe("medium");
  });

  it("drops to low when the rows exceed the total we read", () => {
    const reading = inspector.inspect(dom(ROWS, ["Total ₹99.00"]));
    expect(reading.confidence).toBe("low");
  });
});

describe("CartInspector when the page will not say", () => {
  const ROWS = [
    row("Trailfoot Runner Qty: 1 ₹3,499.00", "₹3,499.00", "Qty: 1"),
    row("Merino trail socks Qty: 2 ₹300.00", "₹300.00", "Qty: 2"),
  ];

  it("falls back to summing rows, and says the sum is a guess", () => {
    const reading = inspector.inspect(dom(ROWS, []));
    expect(reading.totalPaise).toBe(379900);
    expect(reading.confidence).toBe("low");
    expect(reading.basis).toBe("summed_item_rows");
  });

  it("returns null rather than invent a total", () => {
    const reading = inspector.inspect(dom([], []));
    expect(reading.totalPaise).toBeNull();
    expect(reading.confidence).toBe("none");
  });

  it("ignores rows with no readable price", () => {
    const reading = inspector.inspect(dom([row("Gift wrap included", null, null)], []));
    expect(reading.items).toHaveLength(0);
    expect(reading.totalPaise).toBeNull();
  });
});

describe("CartInspector line items", () => {
  it("reads a Hindi total line", () => {
    const reading = inspector.inspect(dom([], ["कुल देय ₹1,250.00"]));
    expect(reading.totalPaise).toBe(125000);
  });

  it("derives a unit price only when it divides cleanly", () => {
    const reading = inspector.inspect(
      dom([row("Socks Qty: 2 ₹300.00", "₹300.00", "Qty: 2")], []),
    );
    expect(reading.items[0]?.unitPaise).toBe(15000);
    const odd = inspector.inspect(
      dom([row("Socks Qty: 3 ₹100.00", "₹100.00", "Qty: 3")], []),
    );
    expect(odd.items[0]?.unitPaise).toBeNull();
  });
});

describe("CartCovenant", () => {
  const covenant = new CartCovenant({ capPaise: 150_000, currency: "INR" });
  const readingOf = (totals: readonly string[]) =>
    inspector.inspect(
      dom([row("Item ₹1,000.00", "₹1,000.00", "Qty: 1")], totals),
    );

  it("assists when the cart is inside the cap", () => {
    const verdict = covenant.check(readingOf(["Grand total ₹1,000.00"]));
    expect(verdict.outcome).toBe("within_cap");
    expect(verdict.assists).toBe(true);
  });

  it("withdraws assistance over the cap without claiming control", () => {
    const verdict = covenant.check(readingOf(["Grand total ₹4,299.00"]));
    expect(verdict.outcome).toBe("over_cap");
    expect(verdict.assists).toBe(false);
    expect(verdict.human).toContain("cannot hold a limit");
    expect(verdict.human).toContain("The window is yours");
  });

  it("refuses on an unreadable total rather than guess", () => {
    const verdict = covenant.check(inspector.inspect(dom([], [])));
    expect(verdict.outcome).toBe("unreadable");
    expect(verdict.assists).toBe(false);
  });

  it("treats a low-confidence reading as unreadable", () => {
    const verdict = covenant.check(readingOf([]));
    expect(verdict.confidence).toBe("low");
    expect(verdict.outcome).toBe("unreadable");
    expect(verdict.assists).toBe(false);
  });

  it("will not convert a currency it was not given", () => {
    const usd = new CartCovenant({ capPaise: 150_000, currency: "USD" });
    expect(usd.check(readingOf(["Grand total ₹100.00"])).outcome).toBe("unreadable");
  });
});
