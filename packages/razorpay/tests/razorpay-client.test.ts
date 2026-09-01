import { describe, expect, it } from "vitest";
import { DomainError } from "@covenant/domain";
import { RazorpayClient } from "../src/razorpay-client.js";
import { RazorpayErrorMapper } from "../src/razorpay-error-mapper.js";
import { RetryPolicy } from "../src/retry-policy.js";
import {
  FakeClock,
  RecordingLogger,
  RecordingTracer,
  fakeFetchSequence,
  jsonResponse,
  recordingSleep,
  testConfig,
} from "./fixtures.js";

function buildClient(fetchImpl: typeof fetch, sleeps: number[] = []) {
  const clock = new FakeClock(0, 10);
  const retryPolicy = new RetryPolicy(clock, recordingSleep(sleeps));
  const logger = new RecordingLogger();
  const tracer = new RecordingTracer();
  const mapper = new RazorpayErrorMapper();
  const client = new RazorpayClient(testConfig, fetchImpl, retryPolicy, clock, logger, tracer, mapper);
  return { client, logger, tracer };
}

describe("RazorpayClient request/response basics", () => {
  it("sends Basic auth built from the injected key pair, never process.env", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([jsonResponse(200, { id: "x" })]);
    const { client } = buildClient(fetchImpl);
    await client.request("op", "GET", "/payments/pay_x", null);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    const expected = Buffer.from(`${testConfig.keyId}:${testConfig.keySecret}`).toString("base64");
    expect(headers["authorization"]).toBe(`Basic ${expected}`);
  });

  it("omits X-Razorpay-Account when no linked account is configured", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([jsonResponse(200, { id: "x" })]);
    const { client } = buildClient(fetchImpl);
    await client.request("op", "GET", "/payments/pay_x", null);
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Razorpay-Account"]).toBeUndefined();
  });

  it("returns the parsed JSON body on 200", async () => {
    const body = { id: "order_abc", status: "created" };
    const { fetch: fetchImpl } = fakeFetchSequence([jsonResponse(200, body)]);
    const { client } = buildClient(fetchImpl);
    const result = await client.request<typeof body>("op", "POST", "/orders", { amount: 100 });
    expect(result).toEqual(body);
  });

  it("logs one rzp.call line per attempt with endpoint, status and attempt number", async () => {
    const { fetch: fetchImpl } = fakeFetchSequence([jsonResponse(200, { id: "pay_1" })]);
    const { client, logger } = buildClient(fetchImpl);
    await client.request("op", "GET", "/payments/pay_1", null);
    const line = logger.lines.find((entry) => entry.evt === "rzp.call");
    expect(line?.fields).toMatchObject({ endpoint: "/payments/pay_1", status: 200, attempt: 1 });
  });
});

describe("RazorpayClient retry and error-mapping integration", () => {
  it("retries once on a 500 and succeeds on the second attempt", async () => {
    const sleeps: number[] = [];
    const { fetch: fetchImpl, calls } = fakeFetchSequence([
      jsonResponse(500, { error: { code: "SERVER_ERROR", description: "oops" } }),
      jsonResponse(200, { id: "order_abc" }),
    ]);
    const { client, tracer } = buildClient(fetchImpl, sleeps);
    const result = await client.request<{ id: string }>("razorpay.orders.create", "POST", "/orders", {});
    expect(result).toEqual({ id: "order_abc" });
    expect(calls).toHaveLength(2);
    expect(sleeps).toHaveLength(1);
    expect(tracer.spans[0]).toMatchObject({ name: "razorpay.orders.create", status: "ok" });
  });

  it("does not retry a 400 and surfaces a typed DomainError, not a raw one", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([
      jsonResponse(400, { error: { code: "BAD_REQUEST_ERROR", description: "bad amount" } }),
    ]);
    const { client, tracer } = buildClient(fetchImpl);
    await expect(client.request("op", "POST", "/orders", {})).rejects.toBeInstanceOf(DomainError);
    expect(calls).toHaveLength(1);
    expect(tracer.spans[0]?.status).toBe("error");
  });

  it("retries a network failure up to maxAttempts and then throws RAZORPAY_UNAVAILABLE", async () => {
    const { fetch: fetchImpl, calls } = fakeFetchSequence([{ networkError: true }]);
    const { client } = buildClient(fetchImpl, []);
    const error = await client
      .request("op", "GET", "/payments/pay_x", null)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).reasonCode).toBe("RAZORPAY_UNAVAILABLE");
    expect(calls).toHaveLength(3);
  });
});
