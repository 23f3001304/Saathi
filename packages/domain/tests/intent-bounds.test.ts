import { describe, expect, it } from "vitest";
import {
  Money,
  cartLinesOf,
  cartTotalOf,
  confirmationSatisfied,
  currencyMatches,
  effectiveExpiry,
  merchantAllowed,
  merchantIdOf,
  notExpired,
  refundabilitySatisfied,
  skusAllowed,
  withinCap,
  type IntentBounds,
} from "../src/index.js";
import { cart, intent, paymentRequest } from "./fixtures.js";

const NOW = "2026-08-31T10:05:00.000Z";
const total = cartTotalOf(paymentRequest);
const lines = cartLinesOf(paymentRequest);

const noRefundPolicy = {
  ...paymentRequest,
  details: { ...paymentRequest.details, modifiers: [] },
};

describe("the seven IntentBounds predicates", () => {
  it("holds the cart to the signed cap", () => {
    expect(withinCap(intent, total)).toBe(true);
    expect(withinCap(intent, Money.fromPaise(200001, "INR"))).toBe(false);
    expect(withinCap(intent, Money.fromPaise(200000, "INR"))).toBe(true);
  });

  it("requires the currency the user signed for", () => {
    expect(currencyMatches(intent, total)).toBe(true);
    expect(currencyMatches(intent, Money.fromPaise(100, "USD"))).toBe(false);
  });

  it("expires at the earliest of jwt exp, allowance expiry and intent expiry", () => {
    const tight: IntentBounds = {
      ...intent,
      intent_expiry: "2026-08-31T11:00:00.000Z",
    };
    expect(effectiveExpiry(tight, intent.exp)).toBe("2026-08-31T11:00:00.000Z");
    expect(notExpired(tight, intent.exp, NOW)).toBe(true);
    expect(notExpired(tight, intent.exp, "2026-08-31T11:30:00.000Z")).toBe(
      false,
    );
  });
});

describe("allowlists, refundability and confirmation", () => {
  it("allows only the merchants on the signed list", () => {
    expect(merchantAllowed(intent, merchantIdOf(cart))).toBe(true);
    expect(merchantAllowed(intent, "urn:covenant:merchant:other")).toBe(false);
  });

  it("treats a null allowlist as any", () => {
    const anyMerchant: IntentBounds = { ...intent, merchants: null };
    expect(merchantAllowed(anyMerchant, "urn:covenant:merchant:other")).toBe(
      true,
    );
    expect(skusAllowed(intent, lines)).toBe(true);
  });

  it("allows only the skus on the signed list", () => {
    const oneSku: IntentBounds = { ...intent, skus: ["ASC-GC9-UK8"] };
    const otherSku: IntentBounds = { ...intent, skus: ["KLM-SOCK-3"] };
    expect(skusAllowed(oneSku, lines)).toBe(true);
    expect(skusAllowed(otherSku, lines)).toBe(false);
  });

  it("requires a declared refund policy when the intent demands one", () => {
    expect(refundabilitySatisfied(intent, paymentRequest)).toBe(true);
    expect(refundabilitySatisfied(intent, noRefundPolicy)).toBe(false);
    const relaxed: IntentBounds = { ...intent, requires_refundability: false };
    expect(refundabilitySatisfied(relaxed, noRefundPolicy)).toBe(true);
  });

  it("admits HNP only for a user-signed intent that waived confirmation", () => {
    const hnp: IntentBounds = { ...intent, human_present: false };
    expect(confirmationSatisfied(hnp, true)).toBe(false);
    const waived: IntentBounds = {
      ...hnp,
      user_cart_confirmation_required: false,
    };
    expect(confirmationSatisfied(waived, true)).toBe(true);
    expect(confirmationSatisfied(waived, false)).toBe(false);
    expect(confirmationSatisfied(intent, false)).toBe(true);
  });
});
