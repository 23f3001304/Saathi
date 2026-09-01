import type { EnvelopeToPass, IntentBounds } from "@covenant/domain";
import { beforeEach, describe, expect, it } from "vitest";

import { verifyCartCommand } from "./commands.js";
import { BOUNDS, CART_TOTAL_PAISE, QUOTE } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import type { VerifyCartOutcome } from "../src/index.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

/** Room for one purchase and 110100 paise of change — not room for two. */
const TIGHT: IntentBounds = {
  ...BOUNDS,
  envelopes: [{ category: "footwear", period: "month", cap_paise: 300000 }],
};

let harness: Harness;
let first: VerifyCartOutcome;
let second: VerifyCartOutcome;

/**
 * The double-spend, simulated as two **sequential** verifies against one
 * envelope. Sequential is the honest test: `gateway-svc` is the only writer and
 * better-sqlite3 is synchronous, so the schedule of write transactions is
 * serial by construction (§5.3). What is proved here is the reservation
 * arithmetic — capacity consumed at verify time, not at capture time — and not
 * some parallelism the runtime never offers.
 */
beforeEach(async () => {
  harness = await newHarness();
  const intent = await issueIntent(harness.crypto, TIGHT);
  const cartA = await issueCart(harness.crypto, intent);
  const cartB = await issueCart(harness.crypto, intent, {
    quote: { ...QUOTE, reservation_id: "rsv_stk_second" },
  });
  first = await harness.verifyCart.verify(
    verifyCartCommand(intent, cartA, "key-1"),
  );
  second = await harness.verifyCart.verify(
    verifyCartCommand(intent, cartB, "key-2"),
  );
});

function bodies() {
  if (first.status !== "verdict" || second.status !== "verdict") {
    throw new Error("expected verdict bodies");
  }
  return { first: first.body, second: second.body };
}

describe("envelope double-spend — who wins", () => {
  it("lets the first committer through and refuses the second", () => {
    const { first: winner, second: loser } = bodies();
    expect(winner.decision).toBe("approve");
    expect(loser.decision).toBe("reject");
    expect(loser.reason_code).toBe("ENVELOPE_EXCEEDED");
  });

  it("subtracts the open reservation, so capacity is gone before any capture", () => {
    const toPass = bodies().second.to_pass as unknown as EnvelopeToPass;
    expect(toPass.cap_paise).toBe(300000);
    expect(toPass.committed_spent_paise).toBe(0);
    expect(toPass.open_reservations_paise).toBe(CART_TOTAL_PAISE);
    expect(toPass.remaining_paise).toBe(300000 - CART_TOTAL_PAISE);
    expect(toPass.requested_paise).toBe(CART_TOTAL_PAISE);
    // The loser is told exactly when capacity frees up.
    expect(toPass.oldest_reservation_expires_at).not.toBeNull();
  });
});

describe("envelope double-spend — what is left behind", () => {
  it("leaves exactly one reservation row and one reservation event", () => {
    const { first: winner, second: loser } = bodies();
    expect(harness.envelopes.byTxn(winner.txn_id)).not.toBeNull();
    expect(harness.envelopes.byTxn(loser.txn_id)).toBeNull();
    expect(
      harness.published.frames.filter(
        (frame) => frame.kind === "envelope.reserved",
      ),
    ).toHaveLength(1);
  });

  it("frees the capacity again once the reservation is released", async () => {
    expect(harness.envelopes.release(bodies().first.txn_id)).toBe(true);
    const intent = await issueIntent(harness.crypto, TIGHT);
    const third = await issueCart(harness.crypto, intent, {
      quote: { ...QUOTE, reservation_id: "rsv_stk_third" },
    });
    const outcome = await harness.verifyCart.verify(
      verifyCartCommand(intent, third, "key-3"),
    );
    if (outcome.status !== "verdict") {
      throw new Error("expected a verdict body");
    }
    expect(outcome.body.decision).toBe("approve");
  });
});
