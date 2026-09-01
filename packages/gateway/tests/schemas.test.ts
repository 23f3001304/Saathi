import { CHECK_IDS } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import {
  cooloffActionRequest,
  covenantSignRequest,
  errorEnvelope,
  executePaymentRequest,
  memoryRetrieveRequest,
  memoryWriteRequest,
  verifyCartRequest,
  verifyCartResponse,
  verdictSchema,
  webhookRequest,
} from "../src/index.js";

const JWS = "eyJhbGciOiJFUzI1NiJ9.eyJhIjoxfQ.c2ln";

const VERIFY_BODY = {
  cart_mandate_jwt: JWS,
  intent_mandate_jwt: JWS,
  memory_entry_ids: ["mem_1"],
  tenant_id: "tnt_demo",
};

function seal(check: (typeof CHECK_IDS)[number]) {
  return {
    check,
    outcome: "pass" as const,
    reason_code: null,
    human: null,
    to_pass: null,
    ms: 0.4,
  };
}

describe("§4 request schemas — verify-cart", () => {
  it("accepts the verify-cart body", () => {
    expect(verifyCartRequest.safeParse(VERIFY_BODY).success).toBe(true);
  });

  it("rejects an unknown key — strict is AM5 applied to the transport", () => {
    const result = verifyCartRequest.safeParse({
      ...VERIFY_BODY,
      admin_override: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a body that is not a compact JWS", () => {
    expect(
      verifyCartRequest.safeParse({ ...VERIFY_BODY, cart_mandate_jwt: "nope" })
        .success,
    ).toBe(false);
  });

  it("caps the signed memory id list at 64", () => {
    const ids = Array.from({ length: 65 }, (_, index) => `mem_${index}`);
    expect(
      verifyCartRequest.safeParse({ ...VERIFY_BODY, memory_entry_ids: ids })
        .success,
    ).toBe(false);
  });

});

describe("§4 request schemas — memory and control", () => {
  it("defaults the retrieval limit to 12", () => {
    const parsed = memoryRetrieveRequest.parse({
      query: "running shoes",
      action_class: "cart-construction",
      as_of: null,
      user_id: "u1",
      tenant_id: "tnt_demo",
    });
    expect(parsed.limit).toBe(12);
  });

  it("takes the tier as a label, never as an integer", () => {
    const base = {
      type: "preference",
      content: {},
      source_channel: "user_confirmation",
      source_ref: null,
      sig: null,
      subject: null,
      predicate: null,
      t_valid: "2026-08-31T10:00:00.000Z",
      t_invalid: null,
      user_id: "u1",
      tenant_id: "tnt_demo",
    };
    expect(memoryWriteRequest.safeParse({ ...base, tier_claim: "P3" }).success).toBe(
      true,
    );
    expect(memoryWriteRequest.safeParse({ ...base, tier_claim: 3 }).success).toBe(
      false,
    );
  });

});

describe("§4 request schemas — control surface", () => {
  it("accepts the remaining money and control bodies", () => {
    expect(
      executePaymentRequest.safeParse({
        payment_mandate_jwt: JWS,
        tenant_id: "t",
      }).success,
    ).toBe(true);
    expect(
      covenantSignRequest.safeParse({ intent_mandate_jwt: JWS, tenant_id: "t" })
        .success,
    ).toBe(true);
    expect(
      cooloffActionRequest.safeParse({ reason: "undo", tenant_id: "t" }).success,
    ).toBe(true);
  });

  it("lets Razorpay own the webhook shape and pins only what is read", () => {
    const parsed = webhookRequest.safeParse({
      entity: "event",
      event: "payment.captured",
      created_at: 1,
      payload: {},
      account_id: "acc_1",
    });
    expect(parsed.success).toBe(true);
  });
});

const RESPONSE_BODY = {
  ok: true as const,
  decision: "approve" as const,
  verdicts: CHECK_IDS.map(seal),
  txn_id: "txn_1",
  payment_mandate_jwt: JWS,
  payment_mandate_draft: null,
  hold: null,
  reason_code: null,
  human: null,
  to_pass: null,
};

describe("§4 response schemas — the verdict body", () => {
  it("accepts a full eight-seal verdict body", () => {
    expect(verifyCartResponse.safeParse(RESPONSE_BODY).success).toBe(true);
  });

  it("accepts a zero-seal stage-0 rejection", () => {
    expect(
      verifyCartResponse.safeParse({
        ...RESPONSE_BODY,
        decision: "reject",
        verdicts: [],
        payment_mandate_jwt: null,
        reason_code: "MANDATE_MALFORMED",
        human: "That mandate could not be read as a signed credential.",
      }).success,
    ).toBe(true);
  });

  it("refuses a partial pipeline — seven seals is a lie about what ran", () => {
    expect(
      verifyCartResponse.safeParse({
        ...RESPONSE_BODY,
        verdicts: CHECK_IDS.slice(0, 7).map(seal),
      }).success,
    ).toBe(false);
  });
});

describe("§4 response schemas — seals and errors", () => {
  it("pins the seal id enum to the eight checks", () => {
    expect(verdictSchema.safeParse({ ...seal("nonce"), check: "made_up" }).success).toBe(
      false,
    );
  });

  it("shapes the error envelope for a 409", () => {
    expect(
      errorEnvelope.safeParse({
        ok: false,
        error: {
          type: "idempotency_conflict",
          reason_code: "IDEMPOTENCY_CONFLICT",
          human: "This Idempotency-Key was already used with different parameters.",
          to_pass: { remedy: "retry_with_new_idempotency_key" },
          request_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
          ts: "2026-08-31T09:14:02.113Z",
        },
      }).success,
    ).toBe(true);
  });
});
