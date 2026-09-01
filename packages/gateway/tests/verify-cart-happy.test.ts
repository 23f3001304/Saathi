import { CHECK_IDS } from "@covenant/domain";
import type { IssuedMandate } from "@covenant/mandates";
import { beforeAll, describe, expect, it } from "vitest";

import { verifyCartResponse } from "../src/index.js";
import type { VerifyCartResponse } from "../src/index.js";
import { verifyCartCommand } from "./commands.js";
import { CART_TOTAL_PAISE, QUOTE } from "./fixtures.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

let harness: Harness;
let cart: IssuedMandate;
let body: VerifyCartResponse;

beforeAll(async () => {
  harness = await newHarness();
  const intent = await issueIntent(harness.crypto);
  cart = await issueCart(harness.crypto, intent);
  const outcome = await harness.verifyCart.verify(
    verifyCartCommand(intent, cart, "key-1"),
  );
  if (outcome.status !== "verdict") {
    throw new Error("expected a verdict body");
  }
  body = outcome.body;
});

describe("golden cart — the verdict body", () => {
  it("stamps all eight seals, in pipeline order, and approves", () => {
    expect(body.decision).toBe("approve");
    expect(body.verdicts.map((verdict) => verdict.check)).toEqual([
      ...CHECK_IDS,
    ]);
    expect(body.verdicts.every((verdict) => verdict.outcome === "pass")).toBe(
      true,
    );
    expect(body.reason_code).toBeNull();
  });

  it("matches the §4.4 response schema", () => {
    expect(verifyCartResponse.safeParse(body).success).toBe(true);
  });
});

describe("golden cart — the issued credential", () => {
  it("issues an executable Payment Mandate bound to the cart", async () => {
    const verified = await harness.crypto.chain.verifyPayment(
      body.payment_mandate_jwt ?? "",
    );
    expect(verified.status).toBe("verified");
    if (verified.status !== "verified") {
      return;
    }
    expect(verified.value.cart_mandate_jti).toBe(cart.jti);
    expect(verified.value.amount).toBe(CART_TOTAL_PAISE);
    expect(verified.value.verdicts).toHaveLength(8);
  });

  it("omits the draft field when no user signature is outstanding", () => {
    expect(body.payment_mandate_draft).toBeNull();
  });
});

describe("golden cart — the committed state", () => {
  it("burns the nonce, reserves the envelope and claims the stock unit", () => {
    expect(harness.nonces.peek(cart.jti, "cart_verify")).not.toBeNull();
    expect(harness.envelopes.byTxn(body.txn_id)?.amount_paise).toBe(
      CART_TOTAL_PAISE,
    );
    expect(harness.stock.find(QUOTE.reservation_id)?.state).toBe("claimed");
    expect(harness.transactions.byId(body.txn_id)?.state).toBe("approved");
  });

  it("stores the verbatim response so an identical retry replays it", () => {
    const stored = harness.nonces.peek(cart.jti, "cart_verify");
    expect(JSON.parse(stored?.responseJson ?? "{}")).toEqual(body);
  });
});

describe("golden cart — the ledger", () => {
  it("publishes its frames only after the commit returns, in one batch", () => {
    const kinds = harness.published.frames.map((frame) => frame.kind);
    expect(kinds).toContain("verdict.emitted");
    expect(kinds).toContain("nonce.burned");
    expect(kinds).toContain("envelope.reserved");
    expect(kinds).toContain("mandate.issued");
    expect(harness.published.batches).toHaveLength(1);
  });

  it("materialises the whole presented chain so the txn key resolves", () => {
    expect(harness.mandates.jwtOf(cart.jti)).not.toBeNull();
  });
});
