import { describe, expect, it } from "vitest";

import { AP2_EXTENSION_URI, W3C_CREDENTIALS_CONTEXT } from "@covenant/domain";

import { checkPinnedUris } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import { buildHarness } from "./fixtures.js";
import { issueCart, issueIntent } from "./issue-helpers.js";
import { payloadOf, resignSubject } from "./tamper.js";

/** T-27: the merchant advertises an older AP2 extension profile. */
const V0_1 = "https://covenant.dev/ns/ap2/v0.1";

async function downgradedCart(harness: Harness): Promise<string> {
  const cart = await issueCart(harness, await issueIntent(harness));
  return resignSubject(harness, cart.jwt, "merchant", {
    ap2_extension_uri: V0_1,
  });
}

describe("URI downgrade fails closed", () => {
  it("rejects a validly signed cart carrying the v0.1 extension URI", async () => {
    const harness = await buildHarness();
    const jwt = await downgradedCart(harness);
    const result = await harness.chain.verifyCart(jwt);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") {
      return;
    }
    expect(result.reasonCode).toBe("URI_DOWNGRADE");
    expect(result.toPass).toEqual({
      expected_uri: AP2_EXTENSION_URI,
      received_uri: V0_1,
      pinned_contexts: [W3C_CREDENTIALS_CONTEXT, AP2_EXTENSION_URI],
      remedy: "upgrade_extension_uri",
    });
  });

  it("keeps the signature valid, proving the rejection is the pin and not the key", async () => {
    const harness = await buildHarness();
    const jwt = await downgradedCart(harness);
    const subject = (payloadOf(jwt)["vc"] as Record<string, unknown>)[
      "credentialSubject"
    ] as Record<string, unknown>;
    expect(subject["ap2_extension_uri"]).toBe(V0_1);
    const verified = await harness.verifier.verify(jwt, {
      role: "merchant",
      audience: "urn:covenant:gateway",
      issuer: null,
    });
    expect(verified.role).toBe("merchant");
  });
});

describe("context pinning", () => {
  it.each([
    [
      "a v0.1 extension uri",
      V0_1,
      [W3C_CREDENTIALS_CONTEXT, AP2_EXTENSION_URI],
    ],
    ["a prefix of the pin", "https://covenant.dev/ns/ap2/v", []],
    ["an empty uri", "", []],
    ["a non-string uri", null, []],
  ])("rejects %s", (_name, uri, contexts) => {
    expect(checkPinnedUris(uri, contexts)?.reasonCode).toBe("URI_DOWNGRADE");
  });

  it.each([
    [
      "an unpinned extra context",
      [W3C_CREDENTIALS_CONTEXT, AP2_EXTENSION_URI, V0_1],
    ],
    ["a reordered context array", [AP2_EXTENSION_URI, W3C_CREDENTIALS_CONTEXT]],
    ["an empty context array", []],
  ])("rejects %s", (_name, contexts) => {
    expect(checkPinnedUris(AP2_EXTENSION_URI, contexts)?.reasonCode).toBe(
      "URI_DOWNGRADE",
    );
  });

  it("accepts exactly the pinned pair", () => {
    expect(
      checkPinnedUris(AP2_EXTENSION_URI, [
        W3C_CREDENTIALS_CONTEXT,
        AP2_EXTENSION_URI,
      ]),
    ).toBeNull();
  });
});
