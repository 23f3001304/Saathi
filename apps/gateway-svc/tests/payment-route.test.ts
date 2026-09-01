// The bill's own route, end to end over HTTP: what a card on screen asks, and
// what makes the answer change. The fake rail reports the order unpaid on the
// first look and captured after it, which is exactly the crossing the bill
// renders as waiting → paid.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TENANT } from "./support/fixtures.js";
import type { Chain, Harness, SeededMemory } from "./support/flow.js";
import { boot, issueChain, seedMemory, teardown } from "./support/flow.js";

let harness: Harness;
let seeded: SeededMemory;
let chain: Chain;
let txnId: string;
let orderId: string;

interface PaymentBody {
  txn_id: string;
  txn_state: string;
  payment_state: string;
  rzp_order_id: string | null;
  rzp_payment_id: string | null;
  payment_link_url: string | null;
  amount_paise: number;
  currency: string;
  checkout_key_id: string;
}

async function paymentView(): Promise<PaymentBody> {
  const response = await harness.client.get(
    `/v1/transactions/${txnId}/payment`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as PaymentBody;
}

/**
 * Ask until the ledger has settled, the way the card's poll does. The window
 * has to clear the poller's own 3 s cadence: the first look finds the order
 * unpaid and the one after it is what settles.
 */
async function settledView(): Promise<PaymentBody> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const view = await paymentView();
    if (view.payment_state !== "waiting") return view;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("payment never settled");
}

beforeAll(async () => {
  harness = await boot();
  seeded = await seedMemory(harness);
  chain = await issueChain(harness, seeded);
  const verified = await harness.client.post("/v1/verify-cart", {
    cart_mandate_jwt: chain.cart.jwt,
    intent_mandate_jwt: chain.intent.jwt,
    memory_entry_ids: [...seeded.entryIds],
    tenant_id: TENANT,
  });
  const verdict = (await verified.json()) as {
    txn_id: string;
    payment_mandate_jwt: string;
  };
  txnId = verdict.txn_id;
  const executed = await harness.client.post("/v1/execute-payment", {
    payment_mandate_jwt: verdict.payment_mandate_jwt,
    tenant_id: TENANT,
  });
  orderId = ((await executed.json()) as { rzp_order_id: string }).rzp_order_id;
}, 60_000);

afterAll(async () => {
  await teardown(harness);
});

describe("GET /v1/transactions/:id/payment", () => {
  it("hands the bill everything it needs to be paid", async () => {
    const view = await paymentView();
    expect(view.txn_id).toBe(txnId);
    // The order is what embedded checkout pays; the link is the phone route.
    expect(view.rzp_order_id).toBe(orderId);
    expect(view.payment_link_url).toMatch(/^https:\/\/rzp\.local\/fake\//);
    expect(view.amount_paise).toBeGreaterThan(0);
  });

  it("answers 404 for a transaction this tenant does not have", async () => {
    const response = await harness.client.get(
      "/v1/transactions/txn_not_here/payment",
    );
    expect(response.status).toBe(404);
  });

  it("flips to paid once the rail has a payment, and names it", async () => {
    const view = await settledView();
    expect(view.payment_state).toBe("paid");
    expect(view.txn_state).toBe("captured");
    // The payment id is read back off the `payment.captured` line, so a bill
    // that says "paid" can point at the event that says so.
    expect(view.rzp_payment_id).toMatch(/^pay_fake_/);
  });

  it("keeps answering paid on the reads after it settled", async () => {
    await settledView();
    const again = await paymentView();
    expect(again.payment_state).toBe("paid");
  });
});
