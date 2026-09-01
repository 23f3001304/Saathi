import { beforeAll, describe, expect, it } from "vitest";

import type { CartMandate, PaymentMandate } from "@covenant/domain";

import { PURPOSE_OF } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import { buildHarness } from "./fixtures.js";
import { issueCart, issueIntent, issuePaymentFinal } from "./issue-helpers.js";

let harness: Harness;
let cart: CartMandate;
let payment: PaymentMandate;

beforeAll(async () => {
  harness = await buildHarness();
  const intent = await issueIntent(harness);
  const issuedCart = await issueCart(harness, intent);
  const { final } = await issuePaymentFinal(harness, intent, issuedCart);
  const cartResult = await harness.chain.verifyCart(issuedCart.jwt);
  const paymentResult = await harness.chain.verifyPayment(final.jwt);
  if (cartResult.status !== "verified" || paymentResult.status !== "verified") {
    throw new Error("fixture chain did not verify");
  }
  cart = cartResult.value;
  payment = paymentResult.value;
});

describe("payment to cart binding", () => {
  it("accepts the payment mandate the cart produced", () => {
    expect(harness.binder.paymentToCart(payment, cart, cart)).toBeNull();
  });

  it.each([
    ["cart_mandate_jti", "urn:uuid:99999999-9999-4999-8999-999999999999"],
    ["cart_mandate_hash", `sha256:${"c".repeat(64)}`],
    ["intent_mandate_hash", `sha256:${"d".repeat(64)}`],
    ["memory_digest", `sha256:${"e".repeat(64)}`],
  ])("rejects a payment naming a different %s", (field, value) => {
    const forged = { ...payment, [field]: value } as PaymentMandate;
    expect(harness.binder.paymentToCart(forged, cart, cart)).toBe(
      "MANDATE_MALFORMED",
    );
  });

  it("rejects a payment issued for another tenant", () => {
    const forged = { ...payment, tenant_id: "tnt_other" };
    expect(harness.binder.tenantBinding(forged, cart)).toBe("TENANT_MISMATCH");
  });
});

describe("nonce extraction", () => {
  it("takes the nonce from the jti and the purpose from the kind", () => {
    expect(cart.jti).toMatch(/^urn:uuid:/);
    expect(PURPOSE_OF[cart.kind]).toBe("cart_verify");
    expect(PURPOSE_OF[payment.kind]).toBe("payment_execute");
    expect(cart.jti).not.toBe(payment.jti);
  });

  it("hashes the compact JWS, not the decoded body", () => {
    expect(harness.binder.jwtHashRef("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
