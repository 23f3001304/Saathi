import type {
  OrderRef,
  OrderRequest,
  PaymentLink,
  PaymentRail,
  PaymentSnapshot,
  PaymentState,
} from "@covenant/domain";
import { Money, sha256Of } from "@covenant/domain";
import { beforeEach, describe, expect, it } from "vitest";

import type { PollTarget } from "../src/index.js";
import { bestPayment, PaymentPoller, PaymentWatcher } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { NoopTracer, SilentLogger } from "./fakes.js";
import { TENANT } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

function snapshotOf(state: PaymentState, id = "pay_1"): PaymentSnapshot {
  return {
    paymentId: id,
    orderId: "order_1",
    state,
    amount: Money.fromPaise(189_900, "INR"),
    errorCode: state === "failed" ? "BAD_REQUEST_ERROR" : null,
  };
}

/**
 * A rail that answers a different thing on each look, which is the whole point:
 * the unpaid answer has to be survivable, because it is what the rail says for
 * as long as the shopper is still deciding.
 */
class ScriptedRail implements PaymentRail {
  looks = 0;

  constructor(private readonly script: readonly PaymentSnapshot[][]) {}

  createOrder(request: OrderRequest): Promise<OrderRef> {
    return Promise.resolve({
      orderId: "order_1",
      amount: request.amount,
      receipt: request.receipt,
    });
  }

  createPaymentLink(): Promise<PaymentLink> {
    return Promise.resolve({
      linkId: "plink_1",
      shortUrl: "https://rzp.io/i/1",
    });
  }

  getPayment(paymentId: string): Promise<PaymentSnapshot> {
    return Promise.resolve(snapshotOf("captured", paymentId));
  }

  paymentsForOrder(): Promise<readonly PaymentSnapshot[]> {
    const step =
      this.script[Math.min(this.looks, this.script.length - 1)] ?? [];
    this.looks += 1;
    return Promise.resolve(step);
  }
}

let harness: Harness;
let txnId: string;

beforeEach(async () => {
  harness = await newHarness();
  txnId = await linkIssued();
});

/** A transaction parked at `link_issued`, which is where the gap used to be. */
async function linkIssued(): Promise<string> {
  const intent = await issueIntent(harness.crypto);
  const cart = await issueCart(harness.crypto, intent);
  const verified = await harness.verifyCart.verify(
    verifyCartCommand(intent, cart, "key-1"),
  );
  if (verified.status !== "verdict") throw new Error("expected a verdict");
  const jwt = verified.body.payment_mandate_jwt ?? "";
  const executed = await harness.executePayment.execute({
    body: { payment_mandate_jwt: jwt, tenant_id: TENANT },
    requestId: "req-exec",
    idempotencyKey: "exec-1",
    payloadHash: sha256Of({ payment_mandate_jwt: jwt, tenant_id: TENANT }),
  });
  if (executed.status !== "ok") throw new Error("expected an ok execution");
  return executed.body.txn_id;
}

function pollerFor(rail: PaymentRail): PaymentPoller {
  return new PaymentPoller(
    rail,
    harness.outcomes,
    harness.events,
    harness.ledger,
    harness.clock,
    (ms) => {
      harness.clock.advance(ms);
      return Promise.resolve();
    },
    new SilentLogger(),
    new NoopTracer(),
    { intervalMs: 1_000, timeoutMs: 5_000 },
  );
}

function target(): PollTarget {
  return { txnId, tenantId: TENANT, mandateId: null, orderId: "order_1" };
}

function kindsFor(): string[] {
  return harness.reader.byTxn(txnId).map((event) => event.kind);
}

describe("bestPayment", () => {
  it("reports the capture, not the failed attempt beside it", () => {
    const best = bestPayment([
      snapshotOf("failed", "pay_a"),
      snapshotOf("captured", "pay_b"),
    ]);
    expect(best?.paymentId).toBe("pay_b");
  });

  it("has nothing to report when nobody has paid", () => {
    expect(bestPayment([])).toBeNull();
  });
});

describe("PaymentPoller on an order nobody has paid", () => {
  it("takes a look anyway and leaves the transaction open", async () => {
    const rail = new ScriptedRail([[]]);
    const settled = await pollerFor(rail).poll(target());

    expect(settled).toBeNull();
    // The old shape could not even start here: it needed a payment id that
    // does not exist until someone pays.
    expect(rail.looks).toBeGreaterThan(1);
    expect(kindsFor()).toContain("rzp.polled");
    expect(kindsFor()).not.toContain("payment.captured");
    expect(harness.transactions.byId(txnId)?.state).toBe("link_issued");
  });

  it("records that it looked and found nobody had paid", async () => {
    await pollerFor(new ScriptedRail([[]])).poll(target());
    const polled = harness.reader
      .byTxn(txnId)
      .filter((event) => event.kind === "rzp.polled");
    expect(polled[0]?.payload["state"]).toBe("unpaid");
    expect(polled[0]?.payload["rzp_payment_id"]).toBeNull();
  });
});

describe("PaymentPoller once the order is paid", () => {
  it("captures on the look that first sees the payment", async () => {
    const rail = new ScriptedRail([[], [], [snapshotOf("captured")]]);
    const settled = await pollerFor(rail).poll(target());

    expect(settled?.state).toBe("captured");
    expect(kindsFor()).toContain("payment.captured");
    expect(harness.transactions.byId(txnId)?.state).toBe("captured");
  });

  it("settles a failed attempt as failed and releases the envelope", async () => {
    const rail = new ScriptedRail([[], [snapshotOf("failed")]]);
    await pollerFor(rail).poll(target());

    expect(kindsFor()).toContain("payment.failed");
    expect(harness.transactions.byId(txnId)?.state).toBe("failed");
  });
});

describe("PaymentWatcher", () => {
  it("runs one watch per transaction and releases it when settled", async () => {
    const watcher = new PaymentWatcher(
      pollerFor(new ScriptedRail([[snapshotOf("captured")]])),
      new SilentLogger(),
    );
    expect(watcher.ensure(target())).toBe(true);
    expect(watcher.ensure(target())).toBe(false);
    await new Promise((done) => setTimeout(done, 0));
    expect(watcher.active).toBe(0);
  });

  it("releases the watch when the rail throws, so a later read re-arms", async () => {
    const broken: PaymentRail = {
      ...new ScriptedRail([[]]),
      paymentsForOrder: () => Promise.reject(new Error("rail down")),
    };
    const watcher = new PaymentWatcher(pollerFor(broken), new SilentLogger());
    watcher.ensure(target());
    await new Promise((done) => setTimeout(done, 0));
    expect(watcher.active).toBe(0);
  });
});
