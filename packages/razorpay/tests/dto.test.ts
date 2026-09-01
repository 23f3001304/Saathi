import { describe, expect, it } from "vitest";
import { isRazorpayOrderResponse } from "../src/dto/order-dto.js";
import { isRazorpayPaymentLinkResponse } from "../src/dto/payment-link-dto.js";
import { isRazorpayPaymentResponse } from "../src/dto/payment-dto.js";
import { parseWebhookEvent } from "../src/dto/webhook-event-dto.js";
import {
  ORDER_RESPONSE_FIXTURE,
  PAYMENT_LINK_RESPONSE_FIXTURE,
  PAYMENT_RESPONSE_FIXTURE,
} from "./fixtures.js";

describe("isRazorpayOrderResponse", () => {
  it("accepts the recorded live-docs fixture", () => {
    expect(isRazorpayOrderResponse(ORDER_RESPONSE_FIXTURE)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "order_abc"],
    ["missing id", { amount: 100, currency: "INR", status: "created", receipt: null }],
    ["amount as a string", { id: "x", amount: "100", currency: "INR", status: "created", receipt: null }],
    ["missing status", { id: "x", amount: 100, currency: "INR", receipt: null }],
    ["receipt as a number", { id: "x", amount: 100, currency: "INR", status: "created", receipt: 1 }],
  ])("rejects %s", (_label, value) => {
    expect(isRazorpayOrderResponse(value)).toBe(false);
  });
});

describe("isRazorpayPaymentLinkResponse", () => {
  it("accepts the recorded live-docs fixture", () => {
    expect(isRazorpayPaymentLinkResponse(PAYMENT_LINK_RESPONSE_FIXTURE)).toBe(true);
  });

  it.each([
    ["null", null],
    ["missing short_url", { id: "plink_x" }],
    ["short_url as a number", { id: "plink_x", short_url: 1 }],
  ])("rejects %s", (_label, value) => {
    expect(isRazorpayPaymentLinkResponse(value)).toBe(false);
  });
});

describe("isRazorpayPaymentResponse", () => {
  it("accepts the recorded live-docs fixture", () => {
    expect(isRazorpayPaymentResponse(PAYMENT_RESPONSE_FIXTURE)).toBe(true);
  });

  it.each([
    ["null", null],
    [
      "order_id as a number",
      { id: "pay_x", order_id: 1, status: "created", amount: 100, currency: "INR", error_code: null },
    ],
    [
      "missing currency",
      { id: "pay_x", order_id: null, status: "created", amount: 100, error_code: null },
    ],
    [
      "error_code as a number",
      { id: "pay_x", order_id: null, status: "failed", amount: 100, currency: "INR", error_code: 1 },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isRazorpayPaymentResponse(value)).toBe(false);
  });
});

describe("parseWebhookEvent malformed input handling", () => {
  it.each([
    ["null", null],
    ["a string", "not an envelope"],
    ["missing event", { payload: {} }],
    ["missing payload", { event: "payment.captured" }],
    ["payment.captured with no payment object", { event: "payment.captured", payload: {} }],
    [
      "payment.captured with a non-numeric amount",
      { event: "payment.captured", payload: { payment: { entity: { id: "p1", amount: "oops", currency: "INR" } } } },
    ],
  ])("returns null for %s", (_label, value) => {
    expect(parseWebhookEvent(value)).toBeNull();
  });
});
