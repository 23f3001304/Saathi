import { beforeEach, describe, expect, it } from "vitest";

import type { IssuedMandate } from "../src/index.js";
import { cartHashOf } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import { PAYMENT_REQUEST, buildHarness } from "./fixtures.js";
import { issueCart, issueIntent } from "./issue-helpers.js";
import { resignSubject } from "./tamper.js";

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;

beforeEach(async () => {
  harness = await buildHarness();
  intent = await issueIntent(harness);
  cart = await issueCart(harness, intent);
});

async function chainCode(cartJwt: string): Promise<string> {
  const result = await harness.chain.verifyChain({
    intentJwt: intent.jwt,
    cartJwt,
  });
  return result.status === "verified" ? "verified" : result.reasonCode;
}

async function cartCode(cartJwt: string): Promise<string> {
  const result = await harness.chain.verifyCart(cartJwt);
  return result.status === "verified" ? "verified" : result.reasonCode;
}

const OTHER_HASH = `sha256:${"a".repeat(64)}`;

describe("cart to intent binding", () => {
  it("rejects a cart naming a different intent hash", async () => {
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      intent_mandate_hash: OTHER_HASH,
    });
    expect(await chainCode(jwt)).toBe("MANDATE_MALFORMED");
  });

  it("rejects a cart naming a different intent jti", async () => {
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      intent_mandate_jti: "urn:uuid:11111111-1111-4111-8111-111111111111",
    });
    expect(await chainCode(jwt)).toBe("MANDATE_MALFORMED");
  });

  it("rejects a cart issued for another tenant", async () => {
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      tenant_id: "tnt_other",
    });
    expect(await chainCode(jwt)).toBe("TENANT_MISMATCH");
  });

  it("accepts the cart the intent actually produced", async () => {
    expect(await chainCode(cart.jwt)).toBe("verified");
  });
});

describe("cart hash binding", () => {
  it("rejects a cart whose cart_hash does not cover its payment_request", async () => {
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      cart_hash: OTHER_HASH,
    });
    expect(await cartCode(jwt)).toBe("CART_HASH_MISMATCH");
  });

  it("rejects a re-priced cart that kept its signed hash", async () => {
    const repriced = {
      ...PAYMENT_REQUEST,
      details: {
        ...PAYMENT_REQUEST.details,
        total: {
          label: "Total",
          amount: { currency: "INR", value: "2899.00" },
        },
      },
    };
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      payment_request: repriced,
    });
    expect(await cartCode(jwt)).toBe("CART_HASH_MISMATCH");
    expect(cartHashOf(repriced)).not.toBe(cartHashOf(PAYMENT_REQUEST));
  });

  it("rejects an inner merchant_authorization over a different cart hash", async () => {
    const authorization = await harness.merchantAuth.issue({
      merchantIss: "urn:covenant:merchant:kolam-run",
      cartId: "urn:covenant:cart:5e88",
      cartHash: OTHER_HASH,
      issuedAt: harness.clock.now(),
      ttlSeconds: 900,
    });
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      merchant_authorization: authorization,
    });
    expect(await cartCode(jwt)).toBe("CART_HASH_MISMATCH");
  });
});

describe("memory digest algorithm", () => {
  it("rejects a cart claiming an unrecognised digest algorithm", async () => {
    const jwt = await resignSubject(harness, cart.jwt, "merchant", {
      memory_digest_alg: "covenant-md-0",
    });
    expect(await cartCode(jwt)).toBe("MANDATE_MALFORMED");
  });
});
