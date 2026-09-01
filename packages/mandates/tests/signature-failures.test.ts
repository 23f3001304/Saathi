import { beforeAll, describe, expect, it } from "vitest";

import type { IssuedMandate } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import { buildHarness } from "./fixtures.js";
import { issueCart, issueIntent } from "./issue-helpers.js";
import { resignAs, tamperSubject, unsignedAlgNone } from "./tamper.js";

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;

beforeAll(async () => {
  harness = await buildHarness();
  intent = await issueIntent(harness);
  cart = await issueCart(harness, intent);
});

async function cartCode(jwt: string): Promise<string | null> {
  const result = await harness.chain.verifyCart(jwt);
  return result.status === "rejected" ? result.reasonCode : null;
}

async function intentCode(jwt: string): Promise<string | null> {
  const result = await harness.chain.verifyIntent(jwt);
  return result.status === "rejected" ? result.reasonCode : null;
}

describe("tampered payloads", () => {
  it.each([
    ["cart id", { id: "urn:covenant:cart:evil" }],
    ["memory digest", { memory_digest: `sha256:${"0".repeat(64)}` }],
    ["tenant", { tenant_id: "tnt_other" }],
  ])("rejects a rewritten %s with SIGNATURE_INVALID", async (_name, patch) => {
    expect(await cartCode(tamperSubject(cart.jwt, patch))).toBe(
      "SIGNATURE_INVALID",
    );
  });
});

describe("algorithm pin", () => {
  it("rejects alg none before jose is called", async () => {
    expect(await cartCode(unsignedAlgNone(cart.jwt))).toBe("SIGNATURE_INVALID");
  });

  it.each(["", "a.b", "not-a-jwt", "a.b.c.d"])(
    'rejects "%s" as malformed',
    async (jwt) => {
      expect(await cartCode(jwt)).toBe("MANDATE_MALFORMED");
    },
  );
});

describe("role binding", () => {
  it("rejects an intent signed by the merchant key as SIGNER_UNKNOWN", async () => {
    const forged = await resignAs(harness, intent.jwt, "merchant");
    expect(await intentCode(forged)).toBe("SIGNER_UNKNOWN");
  });

  it("rejects a cart signed by the gateway key as SIGNER_UNKNOWN", async () => {
    const forged = await resignAs(harness, cart.jwt, "gateway");
    expect(await cartCode(forged)).toBe("SIGNER_UNKNOWN");
  });

  it("rejects an intent presented where a cart is expected", async () => {
    expect(await cartCode(intent.jwt)).toBe("SIGNER_UNKNOWN");
  });
});
