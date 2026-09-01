import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Money } from "@covenant/domain";
import { RazorpayWebhookVerifier } from "../src/webhook-verifier.js";
import {
  PAYMENT_CAPTURED_WEBHOOK_FIXTURE,
  PAYMENT_FAILED_WEBHOOK_FIXTURE,
  PAYMENT_LINK_PAID_WEBHOOK_FIXTURE,
} from "./fixtures.js";

// Independently computed with `node -e "crypto.createHmac('sha256', secret)
// .update(body,'utf8').digest('hex')"` — a separate invocation of Node's
// crypto module, not the class under test — per the task's "hand-computed
// HMAC vector" requirement.
const HAND_COMPUTED_SECRET = "whsec_test_fixture";
const HAND_COMPUTED_BODY =
  '{"entity":"event","account_id":"acc_test","event":"payment.captured","contains":["payment"],' +
  '"payload":{"payment":{"entity":{"id":"pay_test123","entity":"payment","amount":100,' +
  '"currency":"INR","status":"captured","order_id":"order_test123","error_code":null,' +
  '"created_at":1700000000}}},"created_at":1700000001}';
const HAND_COMPUTED_SIGNATURE =
  "75c941bdad47be8a781326478285e09e790ec881aeeee1964b916c98e296e41c";

// These parsing-focused tests only need *a* valid signature to reach the
// parse path; the signature-correctness claim itself is carried entirely by
// the hand-computed vector above.
function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("RazorpayWebhookVerifier signature check", () => {
  const verifier = new RazorpayWebhookVerifier(HAND_COMPUTED_SECRET);

  it("accepts a signature matching the independently computed HMAC vector", () => {
    const result = verifier.verify(HAND_COMPUTED_BODY, HAND_COMPUTED_SIGNATURE);
    expect(result.valid).toBe(true);
    expect(result.event).toEqual({
      type: "payment.captured",
      paymentId: "pay_test123",
      orderId: "order_test123",
      amount: Money.fromPaise(100, "INR"),
    });
  });

  it("rejects a single flipped character in the signature", () => {
    const tampered = `f${HAND_COMPUTED_SIGNATURE.slice(1)}`;
    const result = verifier.verify(HAND_COMPUTED_BODY, tampered);
    expect(result).toEqual({ valid: false, event: null });
  });

  it("rejects when the body is tampered but the signature is not recomputed", () => {
    const tamperedBody = HAND_COMPUTED_BODY.replace('"amount":100', '"amount":999999');
    const result = verifier.verify(tamperedBody, HAND_COMPUTED_SIGNATURE);
    expect(result).toEqual({ valid: false, event: null });
  });

  it("rejects a missing signature header outright", () => {
    expect(verifier.verify(HAND_COMPUTED_BODY, null)).toEqual({ valid: false, event: null });
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifier.verify(HAND_COMPUTED_BODY, "short")).toEqual({ valid: false, event: null });
  });
});

describe("RazorpayWebhookVerifier parses payment.* events (recorded live-docs fixtures)", () => {
  it("parses payment.captured", () => {
    const secret = "s1";
    const body = JSON.stringify(PAYMENT_CAPTURED_WEBHOOK_FIXTURE);
    const verifier = new RazorpayWebhookVerifier(secret);
    const result = verifier.verify(body, sign(secret, body));
    expect(result.valid).toBe(true);
    expect(result.event).toEqual({
      type: "payment.captured",
      paymentId: "pay_DESlfW9H8K9uqM",
      orderId: "order_DESlLckIVRkHWj",
      amount: Money.fromPaise(100, "INR"),
    });
  });

  it("parses payment.failed, carrying the error code", () => {
    const secret = "s2";
    const body = JSON.stringify(PAYMENT_FAILED_WEBHOOK_FIXTURE);
    const verifier = new RazorpayWebhookVerifier(secret);
    const result = verifier.verify(body, sign(secret, body));
    expect(result.event).toEqual({
      type: "payment.failed",
      paymentId: "pay_DEAU825sJlCbGa",
      orderId: "order_DEATVTRRctwEGb",
      amount: Money.fromPaise(50_000, "INR"),
      errorCode: "BAD_REQUEST_ERROR",
    });
  });
});

describe("RazorpayWebhookVerifier parses payment_link.paid and unknown events", () => {
  it("parses payment_link.paid", () => {
    const secret = "s3";
    const body = JSON.stringify(PAYMENT_LINK_PAID_WEBHOOK_FIXTURE);
    const verifier = new RazorpayWebhookVerifier(secret);
    const result = verifier.verify(body, sign(secret, body));
    expect(result.event).toEqual({
      type: "payment_link.paid",
      paymentLinkId: "plink_QflcnnZqCekuvL",
      paymentId: "pay_Qfldmt5StKZFCB",
      orderId: "order_QflczVVaNJciLq",
      amount: Money.fromPaise(1_000, "INR"),
    });
  });

  it("returns a valid result with a null event for an unrecognised event type", () => {
    const secret = "s4";
    const body = JSON.stringify({ entity: "event", event: "refund.processed", payload: {} });
    const verifier = new RazorpayWebhookVerifier(secret);
    const result = verifier.verify(body, sign(secret, body));
    expect(result).toEqual({ valid: true, event: null });
  });
});
