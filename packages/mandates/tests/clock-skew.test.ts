import { beforeEach, describe, expect, it } from "vitest";

import type { IssuedMandate } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import { NOW, buildHarness } from "./fixtures.js";
import { CART_TTL, issueCart, issueIntent } from "./issue-helpers.js";

let harness: Harness;
let cart: IssuedMandate;

beforeEach(async () => {
  harness = await buildHarness();
  cart = await issueCart(harness, await issueIntent(harness));
});

async function verifyAt(offsetSeconds: number): Promise<string> {
  harness.clock.set(new Date(NOW.getTime() + offsetSeconds * 1000));
  const result = await harness.chain.verifyCart(cart.jwt);
  return result.status === "verified" ? "verified" : result.reasonCode;
}

describe("expiry is hard", () => {
  it.each([
    [CART_TTL - 1, "verified"],
    [CART_TTL, "TIMESTAMP_SKEW"],
    [CART_TTL + 60, "TIMESTAMP_SKEW"],
    [CART_TTL + 3600, "TIMESTAMP_SKEW"],
  ])("at +%is the cart is %s", async (offset, expected) => {
    expect(await verifyAt(offset)).toBe(expected);
  });
});

describe("issued-at skew is +/-120s", () => {
  it.each([
    [-119, "verified"],
    [-121, "TIMESTAMP_SKEW"],
    [-600, "TIMESTAMP_SKEW"],
  ])("at %is relative to iat the cart is %s", async (offset, expected) => {
    expect(await verifyAt(offset)).toBe(expected);
  });
});
