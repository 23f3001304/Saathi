import { AP2_EXTENSION_URI } from "@covenant/domain";
import type { IssuedMandate } from "@covenant/mandates";
import { beforeEach, describe, expect, it } from "vitest";

import { UriPinCheck } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { goldenContext } from "./context.js";
import { QUOTE } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";
import { resignWith } from "./tamper.js";

const DOWNGRADED = "https://covenant.dev/ns/ap2/v0.1";

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;

beforeEach(async () => {
  harness = await newHarness();
  intent = await issueIntent(harness.crypto);
  const honest = await issueCart(harness.crypto, intent);
  // A genuine merchant signature over a downgraded profile: a blob that failed
  // at the signature would prove nothing about the checks after it.
  cart = await resignWith(harness.crypto, honest, "merchant", (subject) => {
    subject["ap2_extension_uri"] = DOWNGRADED;
  });
});

function present() {
  return harness.verifyCart.verify(verifyCartCommand(intent, cart, "key-1"));
}

/**
 * T-27. Fail-closed is a deliberate availability cost: a misconfigured merchant
 * cannot sell, which in payments is the correct side of the trade — a blocked
 * sale is recoverable, an unauthorised charge is an incident.
 *
 * DECISION: the downgrade is caught at **stage 0**, not at seal 3. The frozen
 * `mandates` package applies the URI pin inside `MandateChainVerifier.verifyCart`,
 * so a downgraded credential never reaches the pipeline and §8.1's zero-seal
 * stage-0 rejection is what the caller sees. `UriPinCheck` stays registered as
 * check 3, owns the code, and is exercised directly below.
 */
describe("T-27 — the answer", () => {
  it("rejects URI_DOWNGRADE and names the URI it expected", async () => {
    const outcome = await present();
    if (outcome.status !== "verdict") {
      throw new Error("expected a verdict body");
    }
    expect(outcome.body.decision).toBe("reject");
    expect(outcome.body.reason_code).toBe("URI_DOWNGRADE");
    expect(outcome.body.to_pass).toMatchObject({
      expected_uri: AP2_EXTENSION_URI,
      received_uri: DOWNGRADED,
      remedy: "upgrade_extension_uri",
    });
  });

  it("has no fallback profile: the check itself refuses the old URI", () => {
    const verdict = new UriPinCheck().run(
      goldenContext({ cart: { ap2_extension_uri: DOWNGRADED } }),
    );
    expect(verdict.outcome).toBe("fail");
    expect(verdict.reason_code).toBe("URI_DOWNGRADE");
  });
});

describe("T-27 — the consequences", () => {
  it("charges nothing: no burn, no reservation, no transaction", async () => {
    await present();
    expect(harness.nonces.peek(cart.jti, "cart_verify")).toBeNull();
    expect(harness.stock.find(QUOTE.reservation_id)).toBeNull();
    expect(harness.transactions.byCartMandate(cart.jti)).toBeNull();
  });

  it("ledgers the block as T-27 so the attack lane can show it", async () => {
    await present();
    const kinds = harness.published.frames.map((frame) => frame.kind);
    expect(kinds).toContain("verdict.emitted");
    const attack = harness.published.frames.find(
      (frame) => frame.kind === "attack.detected",
    );
    expect(attack?.payload).toMatchObject({
      attack_id: "T-27",
      detail_kind: "uri.downgrade",
    });
  });
});
