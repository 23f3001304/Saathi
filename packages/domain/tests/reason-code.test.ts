import { describe, expect, it } from "vitest";
import {
  REASON_CODES,
  REASON_FAMILY,
  REASON_HUMAN,
  errorTypeOf,
  familyOf,
  httpStatusOf,
  isPolicyCode,
  type ReasonCode,
  type ReasonFamily,
} from "../src/index.js";

// §4.6: the catalog, counted per family so a dropped code fails loudly.
const familySizes: readonly (readonly [ReasonFamily, number])[] = [
  ["invalid_request", 6],
  ["idempotency_conflict", 1],
  ["processing_error", 4],
  ["service_unavailable", 3],
  ["rate_limit_exceeded", 2],
  ["auth", 4],
  ["policy", 27],
  ["memory_write", 9],
];

const statusTable: readonly (readonly [ReasonCode, number])[] = [
  ["CART_EXCEEDS_INTENT_CAP", 200],
  ["STOCK_CONFLICT", 200],
  ["COOLOFF_HOLD", 200],
  ["TYPE_REQUIRES_HIGHER_TIER", 200],
  ["IDEMPOTENCY_CONFLICT", 409],
  ["SCHEMA_VIOLATION", 400],
  ["SIGNATURE_INVALID", 401],
  ["RATE_LIMITED", 429],
  ["LEDGER_FORK_DETECTED", 500],
  ["RAZORPAY_UNAVAILABLE", 503],
];

describe("reason-code catalog", () => {
  it("holds every code in the §4.6 taxonomy", () => {
    expect(REASON_CODES).toHaveLength(56);
  });

  it.each(familySizes)("puts %d codes in the %s family", (family, size) => {
    const members = REASON_CODES.filter((code) => familyOf(code) === family);
    expect(members).toHaveLength(size);
  });

  it("pairs every code with exactly one frozen human sentence", () => {
    const missing = REASON_CODES.filter(
      (code) => (REASON_HUMAN[code] ?? "").length === 0,
    );
    expect(missing).toEqual([]);
  });

  it("keeps the codes and the family map in lockstep", () => {
    expect(REASON_CODES).toEqual(Object.keys(REASON_FAMILY));
  });
});

describe("stock conflict", () => {
  it("is its own code, not an overload of a quote mismatch", () => {
    expect(REASON_CODES).toContain("STOCK_CONFLICT");
    expect(familyOf("STOCK_CONFLICT")).toBe("policy");
    expect(REASON_HUMAN.STOCK_CONFLICT).not.toBe(
      REASON_HUMAN.CART_QUOTE_MISMATCH,
    );
  });
});

describe("ACP taxonomy mapping", () => {
  it.each(statusTable)("answers %s with HTTP %d", (code, status) => {
    expect(httpStatusOf(code)).toBe(status);
  });

  it("gives policy and memory-write rejections no error type: they are 200s", () => {
    expect(errorTypeOf("NONCE_BURNED")).toBeNull();
    expect(errorTypeOf("CONSTRAINT_RELAXATION_ATTEMPT")).toBeNull();
  });

  it("maps every envelope family onto an ACP error type", () => {
    const enveloped = REASON_CODES.filter(
      (code) => !isPolicyCode(code) && familyOf(code) !== "memory_write",
    );
    expect(enveloped.every((code) => errorTypeOf(code) !== null)).toBe(true);
  });

  it("answers a blocked attack as a successful gateway response", () => {
    expect(httpStatusOf("URI_DOWNGRADE")).toBe(200);
    expect(httpStatusOf("MEMORY_TIER_VIOLATION")).toBe(200);
  });
});
