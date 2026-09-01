import { sha256Of } from "@covenant/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { executePaymentResponse } from "../src/index.js";
import type { ExecutePaymentCommand } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { CART_TOTAL_PAISE, TENANT } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

let harness: Harness;
let mandateJwt: string;

function command(jwt: string, key: string): ExecutePaymentCommand {
  const body = { payment_mandate_jwt: jwt, tenant_id: TENANT };
  return {
    body,
    requestId: `req-${key}`,
    idempotencyKey: key,
    payloadHash: sha256Of(body),
  };
}

beforeEach(async () => {
  harness = await newHarness();
  const intent = await issueIntent(harness.crypto);
  const cart = await issueCart(harness.crypto, intent);
  const verified = await harness.verifyCart.verify(
    verifyCartCommand(intent, cart, "key-1"),
  );
  if (verified.status !== "verdict") {
    throw new Error("expected a verdict body");
  }
  mandateJwt = verified.body.payment_mandate_jwt ?? "";
});

function execute(key = "exec-1") {
  return harness.executePayment.execute(command(mandateJwt, key));
}

describe("ExecutePaymentService — the rail request", () => {
  it("stamps receipt = the payment mandate jti and the required notes", async () => {
    const outcome = await execute();
    expect(outcome.status).toBe("ok");
    const verified = await harness.crypto.chain.verifyPayment(mandateJwt);
    if (verified.status !== "verified") {
      throw new Error("payment mandate should verify");
    }
    const order = harness.rail.orders[0];
    expect(order?.receipt).toBe(verified.value.jti);
    expect(order?.notes).toEqual({
      agent_present: "true",
      mandate_id: verified.value.jti,
    });
    expect(order?.amount.paise).toBe(CART_TOTAL_PAISE);
    expect(harness.rail.links[0]?.referenceId).toBe(verified.value.jti);
  });
});

describe("ExecutePaymentService — the bracket", () => {
  it("burns before the call and ledgers the ids after it", async () => {
    const outcome = await execute();
    if (outcome.status !== "ok") {
      throw new Error("expected an ok outcome");
    }
    expect(executePaymentResponse.safeParse(outcome.body).success).toBe(true);
    expect(outcome.body.state).toBe("link_issued");
    const kinds = harness.published.frames.map((frame) => frame.kind);
    expect(kinds).toContain("rzp.order.created");
    expect(kinds).toContain("rzp.link.created");
    expect(harness.transactions.byId(outcome.body.txn_id)?.state).toBe(
      "link_issued",
    );
  });
});

describe("ExecutePaymentService — idempotency", () => {
  it("replays the stored response and calls the rail once", async () => {
    const first = await execute();
    const retry = await execute();
    if (first.status !== "ok" || retry.status !== "ok") {
      throw new Error("expected ok outcomes");
    }
    expect(retry.replay).toBe(true);
    expect(retry.body).toEqual(first.body);
    expect(harness.rail.orders).toHaveLength(1);
  });

  it("rejects a re-present under a fresh key without charging again", async () => {
    await execute("exec-1");
    const replayed = await execute("exec-2");
    expect(replayed.status).toBe("rejected");
    if (replayed.status !== "rejected") {
      return;
    }
    expect(replayed.reasonCode).toBe("NONCE_BURNED");
    expect(harness.rail.orders).toHaveLength(1);
  });
});

describe("PaymentOutcomeService", () => {
  const observation = {
    tenantId: TENANT,
    mandateId: null,
    paymentId: "pay_1",
    state: "captured" as const,
    errorCode: null,
    rzpEventId: "evt_1",
  };

  it("settles the envelope reservation when the capture is observed", async () => {
    const outcome = await execute();
    if (outcome.status !== "ok") {
      throw new Error("expected an ok outcome");
    }
    const applied = harness.outcomes.apply({
      ...observation,
      txnId: outcome.body.txn_id,
    });
    expect(applied.applied).toBe(true);
    const kinds = harness.published.frames.map((frame) => frame.kind);
    expect(harness.transactions.byId(outcome.body.txn_id)?.state).toBe("captured");
    expect(kinds).toContain("payment.captured");
    expect(kinds).toContain("envelope.captured");
  });

  it("dedupes a second observation of the same outcome", async () => {
    const outcome = await execute();
    if (outcome.status !== "ok") {
      throw new Error("expected an ok outcome");
    }
    const seen = { ...observation, txnId: outcome.body.txn_id };
    harness.outcomes.apply(seen);
    expect(harness.outcomes.apply(seen)).toEqual({
      applied: false,
      reason: "duplicate",
    });
  });
});
