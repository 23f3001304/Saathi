import { describe, expect, it } from "vitest";
import { DomainError, type ReasonCode } from "@covenant/domain";
import {
  RazorpayErrorMapper,
  isRazorpayApiErrorBody,
} from "../src/razorpay-error-mapper.js";
import { NOT_FOUND_ERROR_FIXTURE } from "./fixtures.js";

// Every row verified live: `docs/api/understand.md` (HTTP status catalog) +
// an unauthenticated curl probe of `POST /v1/orders` (401 -> BAD_REQUEST_ERROR).
const statusTable: readonly (readonly [
  string,
  number | null,
  string,
  ReasonCode,
  boolean,
])[] = [
  [
    "network failure",
    null,
    "service_unavailable",
    "RAZORPAY_UNAVAILABLE",
    true,
  ],
  ["400 bad request", 400, "invalid_request", "SCHEMA_VIOLATION", false],
  [
    "401 unauthorized (bad key pair)",
    401,
    "invalid_request",
    "SCHEMA_VIOLATION",
    false,
  ],
  ["404 not found", 404, "invalid_request", "SCHEMA_VIOLATION", false],
  ["429 throttled", 429, "rate_limit_exceeded", "RATE_LIMITED", false],
  [
    "500 internal server error",
    500,
    "processing_error",
    "RAZORPAY_UNAVAILABLE",
    true,
  ],
  ["502 bad gateway", 502, "service_unavailable", "RAZORPAY_UNAVAILABLE", true],
  [
    "503 service unavailable",
    503,
    "service_unavailable",
    "RAZORPAY_UNAVAILABLE",
    true,
  ],
  [
    "504 gateway timeout",
    504,
    "service_unavailable",
    "RAZORPAY_UNAVAILABLE",
    true,
  ],
];

describe("RazorpayErrorMapper", () => {
  const mapper = new RazorpayErrorMapper();

  it.each(statusTable)(
    "%s -> acpType %s, reasonCode %s, retryable=%s",
    (_name, status, acpType, reasonCode, retryable) => {
      expect(mapper.classifyAcpType(status)).toBe(acpType);
      const error = mapper.toDomainError(status);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.reasonCode).toBe(reasonCode);
      expect(mapper.isRetryable(error)).toBe(retryable);
    },
  );

  it("never leaks a raw error past the mapper: every path returns a DomainError", () => {
    for (const [, status] of statusTable) {
      expect(mapper.toDomainError(status)).toBeInstanceOf(DomainError);
    }
  });

  it("does not treat an arbitrary thrown error as retryable", () => {
    expect(mapper.isRetryable(new Error("boom"))).toBe(false);
    expect(mapper.isRetryable("not even an error")).toBe(false);
  });
});

describe("isRazorpayApiErrorBody", () => {
  it("recognises Razorpay's documented error envelope", () => {
    expect(isRazorpayApiErrorBody(NOT_FOUND_ERROR_FIXTURE)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "string",
    42,
    {},
    { error: {} },
    { error: { code: 1 } },
  ])("rejects %j", (value) => {
    expect(isRazorpayApiErrorBody(value)).toBe(false);
  });

  it("tells an exhausted test-mode quota apart from throttling", () => {
    const mapper = new RazorpayErrorMapper();
    const exhausted = mapper.toDomainError(429, {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        description: "test mode limit of 30 reached for payment_link",
      },
    });
    expect(exhausted.reasonCode).toBe("RAIL_QUOTA_EXHAUSTED");
    // A retry can never cure a lifetime cap, so the parker must not spin on it.
    expect(mapper.isRetryable(exhausted)).toBe(false);
    expect(mapper.toDomainError(429, null).reasonCode).toBe("RATE_LIMITED");
  });
});
