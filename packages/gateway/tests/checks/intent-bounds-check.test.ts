import type { IntentBoundsToPass, ReasonCode } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { IntentBoundsCheck } from "../../src/index.js";
import type { ContextOverrides } from "../context.js";
import { goldenContext } from "../context.js";
import { MERCHANT_URN, PAYMENT_REQUEST, SKU } from "../fixtures.js";

const check = new IntentBoundsCheck();

const noModifiers = {
  ...PAYMENT_REQUEST,
  details: { ...PAYMENT_REQUEST.details, modifiers: [] },
};

interface Case {
  readonly name: string;
  readonly code: ReasonCode;
  readonly overrides: ContextOverrides;
}

/** One case per predicate, at the boundary the predicate actually guards. */
const FAILURES: readonly Case[] = [
  {
    name: "cart one paise over the signed cap",
    code: "CART_EXCEEDS_INTENT_CAP",
    overrides: {
      intent: {
        allowance: {
          reason: "one_time",
          max_amount: 189899,
          currency: "INR",
          expires_at: "2026-09-01T12:00:00.000Z",
          merchant_id: null,
          checkout_session_id: null,
        },
      },
    },
  },
  {
    name: "allowance names a different currency",
    code: "CURRENCY_MISMATCH",
    overrides: {
      intent: {
        allowance: {
          reason: "one_time",
          max_amount: 200000,
          currency: "USD",
          expires_at: "2026-09-01T12:00:00.000Z",
          merchant_id: null,
          checkout_session_id: null,
        },
      },
    },
  },
  {
    name: "intent expired before now",
    code: "INTENT_EXPIRED",
    overrides: { intent: { intent_expiry: "2026-08-31T09:59:59.000Z" } },
  },
  {
    name: "merchant outside the allowlist",
    code: "MERCHANT_NOT_ALLOWED",
    overrides: { intent: { merchants: ["urn:covenant:merchant:other"] } },
  },
  {
    name: "sku outside the allowlist",
    code: "SKU_NOT_ALLOWED",
    overrides: { intent: { skus: ["OTHER-SKU"] } },
  },
  {
    name: "refundability required but no refund policy declared",
    code: "REFUNDABILITY_REQUIRED",
    overrides: { cart: { payment_request: noModifiers } },
  },
  {
    name: "human absent and cart confirmation still required",
    code: "CONFIRMATION_REQUIRED",
    overrides: {
      intent: { human_present: false, user_cart_confirmation_required: true },
    },
  },
];

describe("IntentBoundsCheck", () => {
  it("passes the golden cart", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it.each([
    ["cart exactly at the cap", { max_amount: 189900 }],
    ["cart under the cap", { max_amount: 200000 }],
  ])("passes with %s", (_name, allowance) => {
    const context = goldenContext({
      intent: {
        allowance: {
          reason: "one_time",
          currency: "INR",
          expires_at: "2026-09-01T12:00:00.000Z",
          merchant_id: null,
          checkout_session_id: null,
          ...allowance,
        },
      },
    });
    expect(check.run(context).outcome).toBe("pass");
  });

  it.each([
    ["null merchant allowlist admits any merchant", { merchants: null }],
    ["null sku allowlist admits any sku", { skus: null }],
    ["explicit allowlists that include the cart", { merchants: [MERCHANT_URN], skus: [SKU] }],
    ["hnp with confirmation waived on a user-signed intent", { human_present: false }],
  ])("passes when %s", (_name, intent) => {
    expect(check.run(goldenContext({ intent })).outcome).toBe("pass");
  });

});

describe("IntentBoundsCheck — the seven failures", () => {
  it.each(FAILURES.map((c) => [c.name, c] as const))(
    "fails %s",
    (_name, testCase) => {
      const verdict = check.run(goldenContext(testCase.overrides));
      expect(verdict.outcome).toBe("fail");
      expect(verdict.reason_code).toBe(testCase.code);
    },
  );

  it("lists every other failure in also_failed, headline first in pipeline order", () => {
    const verdict = check.run(
      goldenContext({
        intent: {
          merchants: ["urn:covenant:merchant:other"],
          skus: ["OTHER-SKU"],
        },
      }),
    );
    expect(verdict.reason_code).toBe("MERCHANT_NOT_ALLOWED");
    const toPass = verdict.to_pass as IntentBoundsToPass;
    expect(toPass.also_failed).toEqual(["SKU_NOT_ALLOWED"]);
  });

  it("reports the overdraw in paise so the agent can reduce the cart", () => {
    const verdict = check.run(goldenContext(FAILURES[0]!.overrides));
    const toPass = verdict.to_pass as IntentBoundsToPass;
    expect(toPass.over_by_paise).toBe(1);
    expect(toPass.remedy).toBe("reduce_cart_or_reissue_intent");
  });

  it("treats a merchant-signed intent as unconfirmed when a human is absent", () => {
    const verdict = check.run(
      goldenContext({ intent: { human_present: false, role: "merchant" } }),
    );
    expect(verdict.reason_code).toBe("CONFIRMATION_REQUIRED");
  });
});
