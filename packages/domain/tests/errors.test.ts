import { describe, expect, it } from "vitest";
import {
  DomainError,
  REASON_HUMAN,
  REMEDIES,
  type IntentBoundsToPass,
} from "../src/index.js";

const toPass: IntentBoundsToPass = {
  max_amount_paise: 200000,
  cart_amount_paise: 340000,
  over_by_paise: 140000,
  currency: "INR",
  expires_at: "2026-09-01T12:00:00.000Z",
  now: "2026-08-31T10:05:00.000Z",
  allowed_merchants: ["urn:covenant:merchant:kolam-run"],
  allowed_skus: null,
  also_failed: ["MERCHANT_NOT_ALLOWED"],
  remedy: "reduce_cart_or_reissue_intent",
};

describe("DomainError", () => {
  it("carries a reason code, its frozen sentence and its status", () => {
    const error = new DomainError("IDEMPOTENCY_CONFLICT");
    expect(error).toBeInstanceOf(Error);
    expect(error.reasonCode).toBe("IDEMPOTENCY_CONFLICT");
    expect(error.human).toBe(REASON_HUMAN.IDEMPOTENCY_CONFLICT);
    expect(error.message).toBe(REASON_HUMAN.IDEMPOTENCY_CONFLICT);
    expect(error.httpStatus).toBe(409);
  });

  it("carries the self-correction object when there is one", () => {
    const error = new DomainError("CART_EXCEEDS_INTENT_CAP", toPass);
    expect(error.toPass).toBe(toPass);
    expect(error.httpStatus).toBe(200);
  });

  it("defaults to no to_pass rather than an empty object", () => {
    expect(new DomainError("GATEWAY_DRAINING").toPass).toBeNull();
  });
});

describe("to_pass remedies", () => {
  it("names every remedy the design specifies", () => {
    expect(REMEDIES).toContain("reissue_cart_mandate_with_new_jti");
    expect(REMEDIES).toContain("request_new_quote");
    expect(REMEDIES).toContain("retry_with_new_idempotency_key");
    expect(REMEDIES).toContain("re-derive_digest");
    expect(REMEDIES).toContain("wait_or_cancel");
    expect(REMEDIES).toHaveLength(13);
  });

  it("lists every failed predicate, not only the headline one", () => {
    expect(toPass.also_failed).toEqual(["MERCHANT_NOT_ALLOWED"]);
  });
});
