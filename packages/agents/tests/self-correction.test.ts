import { describe, expect, it } from "vitest";

import type { CheckoutOutcome } from "../src/buyer/checkout.js";
import { Checkout } from "../src/buyer/checkout.js";
import type { GatewayClientConfig } from "../src/buyer/gateway-client.js";
import {
  DEFAULT_GATEWAY_CONFIG,
  GatewayClient,
} from "../src/buyer/gateway-client.js";
import { JwsRequestSigner } from "../src/buyer/jws-request-signer.js";
import type {
  CorrectionAction,
  CorrectionPlan,
} from "../src/buyer/self-correction.js";
import { SelfCorrector } from "../src/buyer/self-correction.js";
import { capturingFetch, jsonResponse } from "./doubles.js";
import {
  FakeClock,
  HmacMandateSigner,
  RecordingLogger,
  SeqIds,
} from "./fakes.js";
import * as fixtures from "./response-fixtures.js";

const CONFIG: GatewayClientConfig = {
  ...DEFAULT_GATEWAY_CONFIG,
  baseUrl: "https://gateway.test",
  tenantId: "tnt_demo",
};

function checkoutOver(responses: readonly Response[]): Checkout {
  const { fetch: fetchImpl } = capturingFetch(responses);
  const client = new GatewayClient(
    fetchImpl,
    new JwsRequestSigner(new HmacMandateSigner(), "user"),
    new FakeClock("2026-08-31T09:14:02.113Z"),
    new SeqIds(),
    CONFIG,
  );
  return new Checkout(client, new SelfCorrector(), new RecordingLogger());
}

const REQUEST = {
  cartMandateJwt: "a.b.c",
  intentMandateJwt: "d.e.f",
  memoryEntryIds: ["mem_1"],
};

function planOf(outcome: CheckoutOutcome): CorrectionPlan {
  if ("plan" in outcome) {
    return outcome.plan;
  }
  throw new Error(`outcome "${outcome.kind}" carries no correction plan`);
}

interface RemedyRow {
  readonly remedy: string;
  readonly action: CorrectionAction;
}

const REMEDY_ROWS: readonly RemedyRow[] = [
  { remedy: "reduce_cart_or_reissue_intent", action: "reduce_cart" },
  { remedy: "reissue_intent_with_later_expiry", action: "reissue_intent" },
  { remedy: "reissue_cart_mandate_with_new_jti", action: "reissue_cart" },
  { remedy: "upgrade_extension_uri", action: "upgrade_uri" },
  { remedy: "obtain_signed_attestation", action: "obtain_attestation" },
  { remedy: "re-derive_digest", action: "recompute_digest" },
  { remedy: "renegotiate", action: "renegotiate" },
  { remedy: "request_new_quote", action: "request_quote" },
  { remedy: "wait_or_cancel", action: "wait" },
  { remedy: "retry_with_new_idempotency_key", action: "retry" },
  { remedy: "none", action: "escalate_to_user" },
];

describe("SelfCorrector maps to_pass remedies to the next move (§4.7)", () => {
  it.each(REMEDY_ROWS)("$remedy → $action", (row) => {
    const plan = new SelfCorrector().plan({
      reasonCode: "CART_QUOTE_MISMATCH",
      human: null,
      toPass: { remedy: row.remedy },
    });

    expect(plan.action).toBe(row.action);
  });

  it("escalates rather than guessing when to_pass names no remedy", () => {
    const plan = new SelfCorrector().plan({
      reasonCode: "RISK_BLOCKED",
      human: null,
      toPass: { signals: 3 },
    });

    expect(plan.action).toBe("escalate_to_user");
    expect(plan.remedy).toBeNull();
  });
});

describe("Checkout turns a §4.4 verdict body into an outcome", () => {
  it("reduces the cart to the cap the rejection named", async () => {
    const checkout = checkoutOver([jsonResponse(200, fixtures.capExceeded)]);

    const outcome = await checkout.run(REQUEST);

    expect(outcome.kind).toBe("rejected");
    expect(planOf(outcome).action).toBe("reduce_cart");
    expect(planOf(outcome).targetPaise).toBe(200000);
  });
});

describe("Checkout renegotiates against the signed quote", () => {
  it("aims at the merchant's own signed total on a quote mismatch", async () => {
    const checkout = checkoutOver([jsonResponse(200, fixtures.quoteMismatch)]);

    const outcome = await checkout.run(REQUEST);

    expect(planOf(outcome).action).toBe("renegotiate");
    expect(planOf(outcome).targetPaise).toBe(189900);
  });

  it("reissues the cart mandate after a stage-0 nonce burn", async () => {
    const checkout = checkoutOver([
      jsonResponse(200, fixtures.stageZeroReject),
    ]);

    const outcome = await checkout.run(REQUEST);

    expect(planOf(outcome).action).toBe("reissue_cart");
    expect(planOf(outcome).reasonCode).toBe("NONCE_BURNED");
  });
});

describe("Checkout stops rather than spending", () => {
  it("waits out a cooling-off hold instead of retrying it", async () => {
    const checkout = checkoutOver([jsonResponse(200, fixtures.cooloffHold)]);

    const outcome = await checkout.run(REQUEST);

    expect(outcome.kind).toBe("held");
    expect(outcome.kind === "held" && outcome.holdId).toBe(
      "urn:uuid:00000000-0000-4000-8000-000000000009",
    );
  });

  it("stops for the user's authorization when a draft is still outstanding", async () => {
    const checkout = checkoutOver([
      jsonResponse(200, fixtures.approveSupervised),
    ]);

    const outcome = await checkout.run(REQUEST);

    expect(outcome.kind).toBe("awaiting_user");
    expect(outcome.kind === "awaiting_user" && outcome.draft).toBe(
      fixtures.JWS,
    );
  });
});

describe("Checkout completes the money path", () => {
  it("executes payment on an unsupervised approve", async () => {
    const checkout = checkoutOver([
      jsonResponse(200, fixtures.approveUnsupervised),
      jsonResponse(200, fixtures.paymentExecuted),
    ]);

    const outcome = await checkout.run(REQUEST);

    expect(outcome.kind).toBe("paid");
    expect(outcome.kind === "paid" && outcome.paymentLink).toBe(
      "https://rzp.io/i/abc123",
    );
  });

  it("self-corrects from a 409 error envelope with a fresh idempotency key", async () => {
    const checkout = checkoutOver([
      jsonResponse(409, fixtures.idempotencyConflict),
    ]);

    const outcome = await checkout.run(REQUEST);

    expect(outcome.kind).toBe("failed");
    expect(planOf(outcome).action).toBe("retry");
  });
});
