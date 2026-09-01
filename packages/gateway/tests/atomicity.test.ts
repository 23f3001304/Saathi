import type { IntentBounds } from "@covenant/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { verifyCartCommand } from "./commands.js";
import { BOUNDS, QUOTE } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

/** A cap the golden cart cannot fit under, so the pipeline rejects it. */
const TOO_SMALL: IntentBounds = {
  ...BOUNDS,
  allowance: { ...BOUNDS.allowance, max_amount: 100000 },
};

function countRows(harness: Harness, table: string): number {
  const row = harness.db
    .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
    .get() as { n: number };
  return row.n;
}

let harness: Harness;

beforeEach(async () => {
  harness = await newHarness();
});

describe("atomicity — a rejected cart", () => {
  it("a rejected cart leaves its nonce unburned, so it can be legitimately retried", async () => {
    const intent = await issueIntent(harness.crypto, TOO_SMALL);
    const cart = await issueCart(harness.crypto, intent);
    const outcome = await harness.verifyCart.verify(
      verifyCartCommand(intent, cart, "key-1"),
    );
    if (outcome.status !== "verdict") {
      throw new Error("expected a verdict body");
    }
    expect(outcome.body.reason_code).toBe("CART_EXCEEDS_INTENT_CAP");
    expect(harness.nonces.peek(cart.jti, "cart_verify")).toBeNull();
    expect(countRows(harness, "nonces")).toBe(0);
    expect(countRows(harness, "envelope_reservations")).toBe(0);
    expect(countRows(harness, "stock_reservations")).toBe(0);
    expect(countRows(harness, "transactions")).toBe(0);
  });

  it("still ledgers the rejection — a block nobody can see is not a block", async () => {
    const intent = await issueIntent(harness.crypto, TOO_SMALL);
    const cart = await issueCart(harness.crypto, intent);
    await harness.verifyCart.verify(verifyCartCommand(intent, cart, "key-1"));
    const verdicts = harness.published.frames.filter(
      (frame) => frame.kind === "verdict.emitted",
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.payload).toMatchObject({ decision: "reject" });
  });

});

describe("atomicity — a mid-transaction failure", () => {
  it("a mid-transaction throw leaves NO events and NO state at all", async () => {
    const intent = await issueIntent(harness.crypto);
    const cart = await issueCart(harness.crypto, intent);
    // A failure the design does not model: not a constraint, so not translated.
    harness.stock.claim = () => {
      throw new Error("disk on fire");
    };
    await expect(
      harness.verifyCart.verify(verifyCartCommand(intent, cart, "key-1")),
    ).rejects.toThrow("disk on fire");

    expect(harness.reader.head()).toBeNull();
    expect(countRows(harness, "events")).toBe(0);
    expect(countRows(harness, "nonces")).toBe(0);
    expect(countRows(harness, "mandates")).toBe(0);
    expect(countRows(harness, "transactions")).toBe(0);
    expect(countRows(harness, "envelope_reservations")).toBe(0);
    expect(countRows(harness, "stock_reservations")).toBe(0);
    // A rolled-back transaction publishes nothing: the UI never saw a verdict.
    expect(harness.published.batches).toHaveLength(0);
  });

});

describe("atomicity — a lost race", () => {
  it("a lost last-unit race becomes STOCK_CONFLICT, not a 500 and not a charge", async () => {
    const intent = await issueIntent(harness.crypto);
    const first = await issueCart(harness.crypto, intent);
    await harness.verifyCart.verify(verifyCartCommand(intent, first, "key-1"));

    const second = await issueCart(harness.crypto, intent, { quote: QUOTE });
    const outcome = await harness.verifyCart.verify(
      verifyCartCommand(intent, second, "key-2"),
    );
    if (outcome.status !== "verdict") {
      throw new Error("expected a verdict body");
    }
    expect(outcome.body.decision).toBe("reject");
    expect(outcome.body.reason_code).toBe("STOCK_CONFLICT");
    expect(
      outcome.body.verdicts.find((v) => v.check === "quote_match")?.outcome,
    ).toBe("fail");
    expect(harness.nonces.peek(second.jti, "cart_verify")).toBeNull();
    expect(countRows(harness, "stock_reservations")).toBe(1);
    expect(countRows(harness, "transactions")).toBe(1);
  });
});
