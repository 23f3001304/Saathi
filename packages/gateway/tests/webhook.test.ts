import { createHmac } from "node:crypto";

import { sha256Of } from "@covenant/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { RazorpayWebhookVerifier, WebhookService } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { TENANT } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

const SECRET = "whsec_covenant_demo";

function body(orderId: string, event = "payment.captured"): string {
  return JSON.stringify({
    entity: "event",
    event,
    created_at: 1_772_000_000,
    account_id: "acc_test",
    payload: {
      payment: {
        entity: {
          id: "pay_hook_1",
          order_id: orderId,
          amount: 189900,
          currency: "INR",
        },
      },
    },
  });
}

function sign(raw: string): string {
  return createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
}

describe("RazorpayWebhookVerifier", () => {
  const verifier = new RazorpayWebhookVerifier(SECRET);

  it("accepts an HMAC over the exact bytes received", () => {
    const raw = body("order_1");
    expect(verifier.verify(raw, sign(raw))).toBe(true);
  });

  it("rejects a re-serialised body — the bytes are what was signed", () => {
    const raw = body("order_1");
    const reserialised = JSON.stringify(JSON.parse(raw), null, 2);
    expect(verifier.verify(reserialised, sign(raw))).toBe(false);
  });

  it("rejects a missing or wrong-length signature without throwing", () => {
    expect(verifier.verify(body("order_1"), null)).toBe(false);
    expect(verifier.verify(body("order_1"), "deadbeef")).toBe(false);
  });
});

let harness: Harness;
let service: WebhookService;
let orderId: string;

beforeEach(async () => {
  harness = await newHarness();
  service = new WebhookService(
    new RazorpayWebhookVerifier(SECRET),
    harness.outcomes,
    harness.transactions,
    harness.events,
    harness.ledger,
  );
  orderId = await linkIssuedOrder();
});

/** A transaction that has actually reached the rail, so an order id exists. */
async function linkIssuedOrder(): Promise<string> {
  const intent = await issueIntent(harness.crypto);
  const cart = await issueCart(harness.crypto, intent);
  const verified = await harness.verifyCart.verify(
    verifyCartCommand(intent, cart, "key-1"),
  );
  if (verified.status !== "verdict") {
    throw new Error("expected a verdict body");
  }
  const jwt = verified.body.payment_mandate_jwt ?? "";
  const executed = await harness.executePayment.execute({
    body: { payment_mandate_jwt: jwt, tenant_id: TENANT },
    requestId: "req-exec",
    idempotencyKey: "exec-1",
    payloadHash: sha256Of({ payment_mandate_jwt: jwt, tenant_id: TENANT }),
  });
  if (executed.status !== "ok") {
    throw new Error("expected an ok execution");
  }
  return executed.body.rzp_order_id;
}

describe("WebhookService — applying an outcome", () => {
  it("applies a verified capture and settles the envelope", () => {
    const raw = body(orderId);
    const response = service.receive({
      rawBody: raw,
      signature: sign(raw),
      tenantId: TENANT,
    });
    expect(response.applied).toBe(true);
    expect(harness.transactions.byOrder(orderId)?.state).toBe("captured");
  });

  it("dedupes against the poller: whichever arrives first wins", () => {
    const raw = body(orderId);
    service.receive({ rawBody: raw, signature: sign(raw), tenantId: TENANT });
    const second = service.receive({
      rawBody: raw,
      signature: sign(raw),
      tenantId: TENANT,
    });
    expect(second).toEqual({ ok: true, applied: false, reason: "duplicate" });
  });
});

describe("WebhookService — refusing an outcome", () => {
  it("changes no state on a forged signature and ledgers the rejection", () => {
    const raw = body(orderId);
    const response = service.receive({
      rawBody: raw,
      signature: sign("tampered"),
      tenantId: TENANT,
    });
    expect(response).toMatchObject({
      applied: false,
      reason: "WEBHOOK_SIGNATURE_INVALID",
    });
    expect(harness.transactions.byOrder(orderId)?.state).toBe("link_issued");
    expect(
      harness.published.frames.some((frame) => frame.kind === "webhook.rejected"),
    ).toBe(true);
  });

  it("answers 200 for an order it does not know", () => {
    const raw = body("order_unknown");
    expect(
      service.receive({ rawBody: raw, signature: sign(raw), tenantId: TENANT }),
    ).toEqual({ ok: true, applied: false, reason: "unknown_transaction" });
  });
});
