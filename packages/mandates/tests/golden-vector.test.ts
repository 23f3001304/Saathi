import { beforeAll, describe, expect, it } from "vitest";

import type { IssuedMandate, PaymentMandateDraft } from "../src/index.js";
import { cartHashOf } from "../src/index.js";
import type { Harness } from "./fixtures.js";
import {
  MERCHANT_URN,
  NOW,
  PAYMENT_REQUEST,
  USER_URN,
  buildHarness,
} from "./fixtures.js";
import {
  CONTEXTS,
  GOLDEN_INTENT_SUBJECT,
  REGISTERED_CLAIM_ORDER,
  VC_CLAIM_ORDER,
  goldenCartSubject,
  goldenPaymentSubject,
  seqUuid,
} from "./golden.js";
import {
  CART_TTL,
  issueCart,
  issueIntent,
  issuePaymentDraft,
} from "./issue-helpers.js";
import { headerOf, payloadOf } from "./tamper.js";

const IAT = Math.floor(NOW.getTime() / 1000);

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;
let draft: PaymentMandateDraft;

beforeAll(async () => {
  harness = await buildHarness();
  intent = await issueIntent(harness);
  cart = await issueCart(harness, intent);
  draft = await issuePaymentDraft(harness, intent, cart);
});

function vcOf(jwt: string): Record<string, unknown> {
  return payloadOf(jwt)["vc"] as Record<string, unknown>;
}

function subjectOf(jwt: string): Record<string, unknown> {
  return vcOf(jwt)["credentialSubject"] as Record<string, unknown>;
}

describe("JWS header", () => {
  it.each([
    ["intent", "user"],
    ["cart", "merchant"],
    ["payment", "gateway"],
  ])("%s is ES256/JWT with a %s kid", (kind, role) => {
    const jwt = { intent: intent.jwt, cart: cart.jwt, payment: draft.jwt }[
      kind
    ] as string;
    const header = headerOf(jwt);
    expect(Object.keys(header)).toEqual(["alg", "typ", "kid"]);
    expect(header["alg"]).toBe("ES256");
    expect(header["typ"]).toBe("JWT");
    expect(String(header["kid"])).toMatch(
      new RegExp(`^${role}-\\d{4}-\\d{2}-[0-9a-f]{8}$`),
    );
  });
});

describe("registered claim sets", () => {
  it("pins the intent claim order and values (§6.2)", () => {
    const claims = payloadOf(intent.jwt);
    expect(Object.keys(claims)).toEqual(REGISTERED_CLAIM_ORDER.intent);
    expect({ ...claims, vc: undefined }).toMatchObject({
      iss: USER_URN,
      sub: USER_URN,
      aud: "urn:covenant:gateway",
      iat: IAT,
      nbf: IAT,
      exp: IAT + 86400,
      jti: seqUuid(0),
    });
  });

  it("pins the cart claim order and values (§6.3)", () => {
    const claims = payloadOf(cart.jwt);
    expect(Object.keys(claims)).toEqual(REGISTERED_CLAIM_ORDER.cart);
    expect({ ...claims, vc: undefined }).toMatchObject({
      iss: MERCHANT_URN,
      sub: USER_URN,
      aud: "urn:covenant:gateway",
      iat: IAT,
      nbf: IAT,
      exp: IAT + CART_TTL,
      jti: seqUuid(2),
    });
  });
});

describe("payment registered claims", () => {
  it("pins the payment claim order and values, with no nbf (§6.4)", () => {
    const claims = payloadOf(draft.jwt);
    expect(Object.keys(claims)).toEqual(REGISTERED_CLAIM_ORDER.payment);
    expect(claims["nbf"]).toBeUndefined();
    expect({ ...claims, vc: undefined }).toMatchObject({
      iss: "urn:covenant:gateway",
      sub: USER_URN,
      aud: "urn:covenant:gateway:executor",
      iat: IAT,
      exp: IAT + CART_TTL,
      jti: seqUuid(3),
    });
  });
});

describe("vc claim", () => {
  it.each([
    ["intent", VC_CLAIM_ORDER.intent, "IntentMandate"],
    ["cart", VC_CLAIM_ORDER.cart, "CartMandate"],
    ["payment", VC_CLAIM_ORDER.payment, "PaymentMandate"],
  ])("%s carries the pinned contexts and type pair", (kind, order, type) => {
    const jwt = { intent: intent.jwt, cart: cart.jwt, payment: draft.jwt }[
      kind
    ] as string;
    const vc = vcOf(jwt);
    expect(Object.keys(vc)).toEqual(order);
    expect(vc["@context"]).toEqual(CONTEXTS);
    expect(vc["type"]).toEqual(["VerifiableCredential", type]);
  });

  it("stamps validFrom on the intent only", () => {
    expect(vcOf(intent.jwt)["validFrom"]).toBe(NOW.toISOString());
    expect(vcOf(cart.jwt)["validFrom"]).toBeUndefined();
    expect(vcOf(draft.jwt)["validFrom"]).toBeUndefined();
  });
});

describe("credential subjects", () => {
  it("pins the intent subject field for field", () => {
    expect(subjectOf(intent.jwt)).toEqual(GOLDEN_INTENT_SUBJECT);
  });

  it("pins the cart subject field for field", () => {
    const subject = subjectOf(cart.jwt);
    expect(subject).toEqual(
      goldenCartSubject(
        `sha256:${intent.jwtHash}`,
        subject["merchant_authorization"] as string,
        cartHashOf(PAYMENT_REQUEST),
      ),
    );
  });

  it("pins the draft payment subject field for field", () => {
    expect(subjectOf(draft.jwt)).toEqual(
      goldenPaymentSubject(
        `sha256:${cart.jwtHash}`,
        `sha256:${intent.jwtHash}`,
        null,
      ),
    );
  });
});

describe("inner authorization JWTs", () => {
  it("pins the merchant_authorization claim set (§6.6)", () => {
    const inner = payloadOf(
      subjectOf(cart.jwt)["merchant_authorization"] as string,
    );
    expect(Object.keys(inner)).toEqual([
      "iss",
      "sub",
      "aud",
      "iat",
      "exp",
      "jti",
      "cart_hash",
    ]);
    expect(inner["cart_hash"]).toBe(cartHashOf(PAYMENT_REQUEST));
    expect(inner["jti"]).toBe(seqUuid(1));
  });
});
