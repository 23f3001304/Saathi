import { describe, expect, it } from "vitest";
import { DomainError, Money, type OrderRequest, type PaymentLinkRequest } from "@covenant/domain";
import { RazorpayClient } from "../src/razorpay-client.js";
import { RazorpayErrorMapper } from "../src/razorpay-error-mapper.js";
import { RazorpayPaymentRail } from "../src/razorpay-payment-rail.js";
import { RetryPolicy } from "../src/retry-policy.js";
import {
  FakeClock,
  ORDER_RESPONSE_FIXTURE,
  PAYMENT_LINK_RESPONSE_FIXTURE,
  PAYMENT_RESPONSE_FIXTURE,
  RecordingLogger,
  RecordingTracer,
  fakeFetchSequence,
  jsonResponse,
  recordingSleep,
  testConfig,
} from "./fixtures.js";

function buildRail(fetchImpl: typeof fetch): RazorpayPaymentRail {
  const clock = new FakeClock(0, 5);
  const retryPolicy = new RetryPolicy(clock, recordingSleep([]));
  const client = new RazorpayClient(
    testConfig,
    fetchImpl,
    retryPolicy,
    clock,
    new RecordingLogger(),
    new RecordingTracer(),
    new RazorpayErrorMapper(),
  );
  return new RazorpayPaymentRail(client);
}

describe("RazorpayPaymentRail.createOrder", () => {
  it("forwards the caller-supplied receipt and notes verbatim (port contract, not adapter policy)", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([jsonResponse(200, ORDER_RESPONSE_FIXTURE)]);
    const rail = buildRail(fetchImpl);
    const request: OrderRequest = {
      amount: Money.fromPaise(5000, "INR"),
      receipt: "receipt#1",
      notes: { agent_present: "true", mandate_id: "urn:covenant:payment:a904" },
    };
    await rail.createOrder(request);
    const sentBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(sentBody["receipt"]).toBe("receipt#1");
    expect(sentBody["notes"]).toEqual(request.notes);
    expect(sentBody["amount"]).toBe(5000);
    expect(sentBody["currency"]).toBe("INR");
  });

  it("maps a recorded live-docs order response onto the domain OrderRef", async () => {
    const { fetch: fetchImpl } = fakeFetchSequence([jsonResponse(200, ORDER_RESPONSE_FIXTURE)]);
    const rail = buildRail(fetchImpl);
    const ref = await rail.createOrder({
      amount: Money.fromPaise(5000, "INR"),
      receipt: "receipt#1",
      notes: {},
    });
    expect(ref.orderId).toBe("order_RB58MiP5SPFYyM");
    expect(ref.receipt).toBe("receipt#1");
    expect(ref.amount.equals(Money.fromPaise(5000, "INR"))).toBe(true);
  });

  it("converts a malformed success response into SCHEMA_VIOLATION, not a raw error", async () => {
    const { fetch: fetchImpl } = fakeFetchSequence([jsonResponse(200, { amount: 100 })]);
    const rail = buildRail(fetchImpl);
    const error = await rail
      .createOrder({ amount: Money.fromPaise(100, "INR"), receipt: "r1", notes: {} })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).reasonCode).toBe("SCHEMA_VIOLATION");
  });
});

describe("RazorpayPaymentRail.createPaymentLink", () => {
  it("has no order_id request field (verified live docs); orderId travels in notes instead", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([
      jsonResponse(200, PAYMENT_LINK_RESPONSE_FIXTURE),
    ]);
    const rail = buildRail(fetchImpl);
    const request: PaymentLinkRequest = {
      orderId: "order_RB58MiP5SPFYyM",
      amount: Money.fromPaise(1000, "INR"),
      referenceId: "TS1989",
      description: "Payment for policy no #23456",
    };
    await rail.createPaymentLink(request);
    const sentBody = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(sentBody["order_id"]).toBeUndefined();
    expect(sentBody["reference_id"]).toBe("TS1989");
    expect(sentBody["notes"]).toEqual({ covenant_order_id: "order_RB58MiP5SPFYyM" });
    expect(String(calls[0]?.url)).toBe(`${testConfig.baseUrl}/payment_links/`);
  });

  it("maps a recorded live-docs payment-link response onto the domain PaymentLink", async () => {
    const { fetch: fetchImpl } = fakeFetchSequence([jsonResponse(200, PAYMENT_LINK_RESPONSE_FIXTURE)]);
    const rail = buildRail(fetchImpl);
    const link = await rail.createPaymentLink({
      orderId: "order_x",
      amount: Money.fromPaise(1000, "INR"),
      referenceId: "TS1989",
      description: "x",
    });
    expect(link).toEqual({ linkId: "plink_ExjpAUN3gVHrPJ", shortUrl: "https://rzp.io/i/nxrHnLJ" });
  });
});

describe("RazorpayPaymentRail.getPayment", () => {
  it("maps a recorded live-docs payment response onto the domain PaymentSnapshot", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([jsonResponse(200, PAYMENT_RESPONSE_FIXTURE)]);
    const rail = buildRail(fetchImpl);
    const snapshot = await rail.getPayment("pay_DG4ZdRK8ZnXC3k");
    expect(snapshot).toEqual({
      paymentId: "pay_DG4ZdRK8ZnXC3k",
      orderId: "order_GjCr5oKh4AVC51",
      state: "captured",
      amount: Money.fromPaise(100, "INR"),
      errorCode: null,
    });
    expect(String(calls[0]?.url)).toBe(`${testConfig.baseUrl}/payments/pay_DG4ZdRK8ZnXC3k`);
  });

  it("rejects an unrecognised payment status as SCHEMA_VIOLATION", async () => {
    const { fetch: fetchImpl } = fakeFetchSequence([
      jsonResponse(200, { ...PAYMENT_RESPONSE_FIXTURE, status: "disputed" }),
    ]);
    const rail = buildRail(fetchImpl);
    const error = await rail.getPayment("pay_x").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).reasonCode).toBe("SCHEMA_VIOLATION");
  });
});
