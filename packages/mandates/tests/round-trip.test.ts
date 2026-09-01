import { beforeAll, describe, expect, it } from "vitest";

import type { IssuedMandate } from "../src/index.js";
import { cartHashOf } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import {
  MERCHANT_URN,
  PAYMENT_REQUEST,
  USER_URN,
  buildHarness,
} from "./fixtures.js";
import { issueCart, issueIntent, issuePaymentFinal } from "./issue-helpers.js";

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;
let payment: IssuedMandate;

beforeAll(async () => {
  harness = await buildHarness();
  intent = await issueIntent(harness);
  cart = await issueCart(harness, intent);
  payment = (await issuePaymentFinal(harness, intent, cart)).final;
});

describe("intent mandate round trip", () => {
  it("verifies against the pinned user key and re-reads its bounds", async () => {
    const result = await harness.chain.verifyIntent(intent.jwt);
    expect(result.status).toBe("verified");
    if (result.status !== "verified") {
      return;
    }
    expect(result.value.kind).toBe("intent");
    expect(result.value.iss).toBe(USER_URN);
    expect(result.value.role).toBe("user");
    expect(result.value.allowance.max_amount).toBe(200000);
    expect(result.value.jwtHash).toBe(intent.jwtHash);
  });
});

describe("cart mandate round trip", () => {
  it("verifies against the pinned merchant key and its inner authorization", async () => {
    const result = await harness.chain.verifyCart(cart.jwt);
    expect(result.status).toBe("verified");
    if (result.status !== "verified") {
      return;
    }
    expect(result.value.role).toBe("merchant");
    expect(result.value.iss).toBe(MERCHANT_URN);
    expect(result.value.cart_hash).toBe(cartHashOf(PAYMENT_REQUEST));
    expect(result.value.memory_digest_alg).toBe("covenant-md-1");
    expect(result.value.memory_entry_ids).toHaveLength(3);
  });
});

describe("payment mandate round trip", () => {
  it("verifies against the pinned gateway key with the executor audience", async () => {
    const result = await harness.chain.verifyPayment(payment.jwt);
    expect(result.status).toBe("verified");
    if (result.status !== "verified") {
      return;
    }
    expect(result.value.role).toBe("gateway");
    expect(result.value.aud).toBe("urn:covenant:gateway:executor");
    expect(result.value.amount).toBe(189900);
    expect(result.value.verdicts).toHaveLength(8);
    expect(result.value.user_authorization).not.toBeNull();
  });
});

describe("full chain", () => {
  it("binds cart to intent by jti and by hash", async () => {
    const result = await harness.chain.verifyChain({
      intentJwt: intent.jwt,
      cartJwt: cart.jwt,
    });
    expect(result.status).toBe("verified");
    if (result.status !== "verified") {
      return;
    }
    expect(result.value.cart.intent_mandate_jti).toBe(intent.jti);
    expect(result.value.cart.intent_mandate_hash).toBe(
      `sha256:${intent.jwtHash}`,
    );
  });
});
