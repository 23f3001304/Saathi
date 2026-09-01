import type { IntentBounds } from "@covenant/domain";
import type { IssuedMandate } from "@covenant/mandates";
import { beforeEach, describe, expect, it } from "vitest";

import type { VerifyCartResponse } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { BOUNDS } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

/** A threshold the golden cart clears, so every cart here parks. */
const PARKING: IntentBounds = {
  ...BOUNDS,
  cooloff: { threshold_paise: 100000, hold_seconds: 86400 },
};

let harness: Harness;
let cart: IssuedMandate;
let parked: VerifyCartResponse;

beforeEach(async () => {
  harness = await newHarness();
  const intent = await issueIntent(harness.crypto, PARKING);
  cart = await issueCart(harness.crypto, intent);
  const outcome = await harness.verifyCart.verify(
    verifyCartCommand(intent, cart, "key-1"),
  );
  if (outcome.status !== "verdict") {
    throw new Error("expected a verdict body");
  }
  parked = outcome.body;
});

function kinds(): readonly string[] {
  return harness.published.frames.map((frame) => frame.kind);
}

describe("cool-off — parking", () => {
  it("holds a cart above the threshold with a hold block and a cancel url", () => {
    expect(parked.decision).toBe("hold");
    expect(parked.reason_code).toBe("COOLOFF_HOLD");
    expect(parked.hold?.hold_id).toBe(cart.jti);
    expect(parked.hold?.seconds).toBe(86400);
    expect(harness.transactions.byId(parked.txn_id)?.state).toBe(
      "pending_cooloff",
    );
    expect(kinds()).toContain("cooloff.parked");
  });

  it("rebuilds pending holds from ledger-derived state at boot", () => {
    expect(harness.cooloff.rebuild()).toBe(1);
  });
});

describe("cool-off — cancel first", () => {
  it("the cancel wins, maturity loses, and both are ledgered", async () => {
    const cancelled = harness.cooloff.cancel(cart.jti, "user_cancelled");
    expect(cancelled.status).toBe("ok");
    if (cancelled.status !== "ok") {
      return;
    }
    expect(cancelled.body.state).toBe("cancelled");
    expect(cancelled.body.restore_deadline).not.toBeNull();

    await harness.cooloff.mature(parked.txn_id);
    expect(harness.transactions.byId(parked.txn_id)?.state).toBe("cancelled");
    // Nothing was ever sent to Razorpay.
    expect(harness.rail.orders).toHaveLength(0);
    expect(kinds()).toContain("cooloff.cancelled");
    expect(kinds()).toContain("envelope.released");
    expect(kinds()).toContain("cooloff.race.lost");
  });

  it("restores inside the 5 s undo window and re-arms the hold", () => {
    harness.cooloff.cancel(cart.jti, "user_cancelled");
    const restored = harness.cooloff.restore(cart.jti);
    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") {
      return;
    }
    expect(restored.body.state).toBe("pending_cooloff");
    expect(harness.transactions.byId(parked.txn_id)?.state).toBe(
      "pending_cooloff",
    );
  });
});

describe("cool-off — maturity first", () => {
  it("the timer wins and the late cancel is answered truthfully", async () => {
    await harness.cooloff.mature(parked.txn_id);
    expect(harness.rail.orders).toHaveLength(1);
    expect(harness.transactions.byId(parked.txn_id)?.state).toBe("link_issued");

    const late = harness.cooloff.cancel(cart.jti, "user_cancelled");
    expect(late.status).toBe("lost");
    if (late.status !== "lost") {
      return;
    }
    expect(late.reasonCode).toBe("TXN_ALREADY_FINALIZED");
    expect(late.toPass.remedy).toBe("none");
    expect(kinds()).toContain("cooloff.released");
    expect(kinds()).toContain("cooloff.race.lost");
  });

  it("exactly one of the two guarded UPDATEs ever changes a row", () => {
    harness.cooloff.cancel(cart.jti, "user_cancelled");
    expect(harness.cooloff.cancel(cart.jti, "user_cancelled").status).toBe(
      "lost",
    );
    expect(harness.transactions.byId(parked.txn_id)?.state).toBe("cancelled");
  });
});
