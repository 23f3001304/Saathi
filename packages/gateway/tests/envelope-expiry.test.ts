import type { IntentBounds } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { verifyCartCommand } from "./commands.js";
import { BOUNDS, QUOTE } from "./fixtures.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

/** Room for one purchase at a time — the second only fits if the first frees. */
const TIGHT: IntentBounds = {
  ...BOUNDS,
  envelopes: [{ category: "footwear", period: "month", cap_paise: 300000 }],
};

/** Past the first cart's exp (15 min) plus the 10-minute reservation grace. */
const LATER = new Date("2026-08-31T10:30:00.000Z");

/** Same signed quote — the merchant's attestation is resolved by its jti —
 *  refreshed only in the fields half an hour moved past. */
const FRESH_QUOTE = {
  ...QUOTE,
  reservation_id: "rsv_stk_second",
  quote_expiry: "2026-08-31T10:45:00.000Z",
  reservation_expires_at: "2026-08-31T10:45:00.000Z",
};

async function approvedFirstHold() {
  const harness = await newHarness();
  const intent = await issueIntent(harness.crypto, TIGHT);
  const cart = await issueCart(harness.crypto, intent);
  const first = await harness.verifyCart.verify(
    verifyCartCommand(intent, cart, "key-1"),
  );
  if (first.status !== "verdict") throw new Error("expected a verdict");
  if (first.body.decision !== "approve") throw new Error("arrange failed");
  return { harness, intent };
}

describe("an abandoned hold frees its capacity", () => {
  it("stops counting an open reservation once it has expired", async () => {
    const { harness } = await approvedFirstHold();

    // The link was never paid. Half an hour later — same month, same period
    // key — a second purchase must not find the cap still spoken for by a
    // verification everyone has abandoned.
    harness.clock.set(LATER);
    const intentB = await issueIntent(harness.crypto, TIGHT, LATER);
    const cartB = await issueCart(harness.crypto, intentB, {
      quote: FRESH_QUOTE,
      issuedAt: LATER,
    });
    const second = await harness.verifyCart.verify(
      verifyCartCommand(intentB, cartB, "key-2"),
    );
    if (second.status !== "verdict") throw new Error("expected a verdict");
    expect(second.body.reason_code ?? null).toBeNull();
    expect(second.body.decision).toBe("approve");
  });

  it("still refuses while the first hold is genuinely live", async () => {
    const { harness, intent } = await approvedFirstHold();
    const cartB = await issueCart(harness.crypto, intent, {
      quote: { ...QUOTE, reservation_id: "rsv_stk_live_second" },
    });
    const second = await harness.verifyCart.verify(
      verifyCartCommand(intent, cartB, "key-2"),
    );
    if (second.status !== "verdict") throw new Error("expected a verdict");
    expect(second.body.decision).toBe("reject");
  });
});
