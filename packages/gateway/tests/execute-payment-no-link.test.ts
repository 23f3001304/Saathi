// The refused-link path. A test account that has spent its lifetime quota of
// payment links still creates orders, and an order is payable — so the one
// thing execute-payment must not do is throw away the order it just made.
import { DomainError, sha256Of } from "@covenant/domain";
import { beforeEach, describe, expect, it } from "vitest";

import type { ExecutePaymentCommand } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { TENANT } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

let harness: Harness;
let mandateJwt: string;

function command(jwt: string): ExecutePaymentCommand {
  const body = { payment_mandate_jwt: jwt, tenant_id: TENANT };
  return {
    body,
    requestId: "req-nolink",
    idempotencyKey: "exec-nolink",
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
  if (verified.status !== "verdict") throw new Error("expected a verdict");
  mandateJwt = verified.body.payment_mandate_jwt ?? "";
});

function refuseLinks(reason = "RAIL_QUOTA_EXHAUSTED"): void {
  harness.rail.createPaymentLink = () =>
    Promise.reject(new DomainError(reason as "RAIL_QUOTA_EXHAUSTED"));
}

describe("execute-payment when the rail refuses a payment link", () => {
  it("still succeeds, keeping the order it already created", async () => {
    refuseLinks();
    const outcome = await harness.executePayment.execute(command(mandateJwt));

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.body.rzp_order_id).not.toBe("");
    expect(outcome.body.payment_link).toBeNull();
    expect(outcome.body.state).toBe("link_issued");
  });

  it("records the order on the ledger and against the transaction", async () => {
    refuseLinks();
    const outcome = await harness.executePayment.execute(command(mandateJwt));
    if (outcome.status !== "ok") throw new Error("expected ok");

    const kinds = harness.reader
      .byTxn(outcome.body.txn_id)
      .map((event) => event.kind);
    expect(kinds).toContain("rzp.order.created");
    expect(kinds).not.toContain("rzp.link.created");
    // The order id on the row is what the bill's checkout is opened against.
    expect(harness.transactions.byId(outcome.body.txn_id)?.rzp_order_id).toBe(
      outcome.body.rzp_order_id,
    );
  });

  it("still fails loudly when the rail breaks for any other reason", async () => {
    refuseLinks("RAZORPAY_UNAVAILABLE");
    await expect(
      harness.executePayment.execute(command(mandateJwt)),
    ).rejects.toThrow(DomainError);
  });
});
