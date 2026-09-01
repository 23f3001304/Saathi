import { beforeEach, describe, expect, it } from "vitest";

import { DomainError } from "@covenant/domain";

import type { AuthorizedHashes, IssuedMandate } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import { MEMORY_DIGEST, USER_URN, buildHarness } from "./fixtures.js";
import {
  issueCart,
  issueIntent,
  issuePaymentDraft,
  issuePaymentFinal,
} from "./issue-helpers.js";
import { payloadOf } from "./tamper.js";

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;

beforeEach(async () => {
  harness = await buildHarness();
  intent = await issueIntent(harness);
  cart = await issueCart(harness, intent);
});

function subjectOf(jwt: string): Record<string, unknown> {
  const vc = payloadOf(jwt)["vc"] as Record<string, unknown>;
  return vc["credentialSubject"] as Record<string, unknown>;
}

describe("two-phase payment authorization", () => {
  it("keeps the body hash stable across draft and final", async () => {
    const { draft, final } = await issuePaymentFinal(harness, intent, cart);
    expect(harness.userAuth.bodyHash(subjectOf(final.jwt))).toBe(
      draft.bodyHash,
    );
    expect(payloadOf(final.jwt)["jti"]).toBe(draft.jti);
  });

  it("leaves user_authorization null in the draft", async () => {
    const draft = await issuePaymentDraft(harness, intent, cart);
    expect(subjectOf(draft.jwt)["user_authorization"]).toBeNull();
  });

  it("produces a final mandate that verifies as a gateway credential", async () => {
    const { final } = await issuePaymentFinal(harness, intent, cart);
    const result = await harness.chain.verifyPayment(final.jwt);
    expect(result.status).toBe("verified");
  });
});

describe("the inner authorization JWT", () => {
  it("pins the inner user_authorization claim set (§6.5)", async () => {
    const { draft, final } = await issuePaymentFinal(harness, intent, cart);
    const inner = payloadOf(
      subjectOf(final.jwt)["user_authorization"] as string,
    );
    expect(Object.keys(inner)).toEqual([
      "iss",
      "sub",
      "aud",
      "iat",
      "exp",
      "jti",
      "authorized_hashes",
      "amount",
      "currency",
    ]);
    expect(inner["authorized_hashes"]).toEqual({
      cart_mandate_hash: `sha256:${cart.jwtHash}`,
      payment_mandate_body_hash: draft.bodyHash,
      memory_digest: MEMORY_DIGEST,
    });
  });
});

async function hashesFor(): Promise<AuthorizedHashes> {
  const draft = await issuePaymentDraft(harness, intent, cart);
  return {
    cart_mandate_hash: `sha256:${cart.jwtHash}`,
    payment_mandate_body_hash: draft.bodyHash,
    memory_digest: MEMORY_DIGEST,
  };
}

async function verifyWith(
  signed: AuthorizedHashes,
  expected: AuthorizedHashes,
  amount = 189900,
): Promise<string> {
  const jwt = await harness.userAuth.issue({
    userIss: USER_URN,
    hashes: signed,
    amount,
    currency: "INR",
    issuedAt: harness.clock.now(),
    ttlSeconds: 600,
  });
  try {
    await harness.userAuth.verify(jwt, {
      userIss: USER_URN,
      hashes: expected,
      amount: 189900,
      currency: "INR",
    });
    return "verified";
  } catch (cause) {
    return cause instanceof DomainError ? cause.reasonCode : "threw";
  }
}

const OTHER = `sha256:${"b".repeat(64)}`;

describe("the signed hash set", () => {
  it("verifies when every hash matches", async () => {
    const hashes = await hashesFor();
    expect(await verifyWith(hashes, hashes)).toBe("verified");
  });

  it.each([
    ["cart_mandate_hash"],
    ["payment_mandate_body_hash"],
    ["memory_digest"],
  ] as const)("rejects a signature over a different %s", async (field) => {
    const hashes = await hashesFor();
    expect(await verifyWith({ ...hashes, [field]: OTHER }, hashes)).toBe(
      "MANDATE_MALFORMED",
    );
  });

  it("rejects a signature over a different amount", async () => {
    const hashes = await hashesFor();
    expect(await verifyWith(hashes, hashes, 99900)).toBe("MANDATE_MALFORMED");
  });
});
