import { describe, expect, it } from "vitest";
import {
  cartLinesOf,
  cartTotalOf,
  categoriesOf,
  categoryDrawPaise,
  declaredTotalOf,
  declaresRefundPolicy,
  lineTotalPaise,
  type PaymentRequest,
} from "../src/index.js";
import { paymentRequest } from "./fixtures.js";

const twoLines: PaymentRequest = {
  ...paymentRequest,
  details: {
    ...paymentRequest.details,
    displayItems: [
      ...paymentRequest.details.displayItems,
      {
        label: "Cotton socks (3 pack)",
        amount: { currency: "INR", value: "249.50" },
        sku: "KLM-SOCK-3",
        category: "apparel",
        quantity: 2,
      },
    ],
    total: { label: "Total", amount: { currency: "INR", value: "2398.00" } },
  },
};

const noRefundPolicy: PaymentRequest = {
  ...paymentRequest,
  details: { ...paymentRequest.details, modifiers: [] },
};

describe("cart lines", () => {
  it("reads sku, category, quantity and unit price off the W3C request", () => {
    expect(cartLinesOf(paymentRequest)).toEqual([
      {
        sku: "ASC-GC9-UK8",
        category: "footwear",
        qty: 1,
        unitPaise: 189900,
      },
    ]);
  });

  it("prices a line as unit times quantity", () => {
    const socks = cartLinesOf(twoLines)[1];
    expect(socks?.unitPaise).toBe(24950);
    expect(socks === undefined ? -1 : lineTotalPaise(socks)).toBe(49900);
  });

  it("lists each category once", () => {
    expect(categoriesOf(twoLines)).toEqual(["footwear", "apparel"]);
  });

  it("sums a category's draw for the envelope check", () => {
    expect(categoryDrawPaise(cartLinesOf(twoLines), "apparel")).toBe(49900);
    expect(categoryDrawPaise(cartLinesOf(twoLines), "toys")).toBe(0);
  });
});

describe("cart totals", () => {
  it("recomputes the total from the lines rather than trusting the field", () => {
    expect(cartTotalOf(paymentRequest).paise).toBe(189900);
    expect(cartTotalOf(twoLines).paise).toBe(239800);
  });

  it("keeps the merchant's declared total separately comparable", () => {
    expect(declaredTotalOf(twoLines).paise).toBe(239800);
    expect(
      declaredTotalOf(paymentRequest).equals(cartTotalOf(paymentRequest)),
    ).toBe(true);
  });

  it("exposes drip pricing as a disagreement between the two", () => {
    const dripped: PaymentRequest = {
      ...paymentRequest,
      details: {
        ...paymentRequest.details,
        total: {
          label: "Total",
          amount: { currency: "INR", value: "1999.00" },
        },
      },
    };
    expect(declaredTotalOf(dripped).paise - cartTotalOf(dripped).paise).toBe(
      10000,
    );
  });
});

describe("refundability", () => {
  it("sees a declared refund policy in the modifiers", () => {
    expect(declaresRefundPolicy(paymentRequest)).toBe(true);
  });

  it("reports no policy when the merchant declared none", () => {
    expect(declaresRefundPolicy(noRefundPolicy)).toBe(false);
  });
});
