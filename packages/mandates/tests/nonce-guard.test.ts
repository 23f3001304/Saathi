import { beforeEach, describe, expect, it } from "vitest";

import type { PresentedRequest } from "@covenant/domain";

import { NonceGuard, PURPOSE_OF, nonceToPass } from "../src/index.js";
import { FixedClock, MapNonceRegistry } from "./doubles.js";
import { NOW, TENANT } from "./fixtures.js";

const NONCE = "urn:uuid:7c02c0de-0000-4000-8000-000000000003";

let registry: MapNonceRegistry;
let guard: NonceGuard;

beforeEach(() => {
  registry = new MapNonceRegistry();
  guard = new NonceGuard(registry, new FixedClock(NOW));
});

function presented(
  overrides: Partial<PresentedRequest> = {},
): PresentedRequest {
  return {
    tenantId: TENANT,
    idempotencyKey: "idem-1",
    payloadHash: guard.payloadHash({ cart: "5e88" }),
    ...overrides,
  };
}

function burn(request: PresentedRequest): void {
  guard.burn({
    nonce: NONCE,
    purpose: "cart_verify",
    presented: request,
    burnEventId: "evt_1",
    responseJson: '{"decision":"approve"}',
  });
}

describe("purposes", () => {
  it("maps a mandate kind to the nonce purpose it burns", () => {
    expect(PURPOSE_OF).toEqual({
      intent: null,
      cart: "cart_verify",
      payment: "payment_execute",
    });
  });
});

describe("the four states of §4.5", () => {
  it("is fresh when the nonce has never been burned", () => {
    expect(guard.inspect(NONCE, "cart_verify", presented()).status).toBe(
      "fresh",
    );
  });

  it("replays the stored response for the same key and the same body", () => {
    burn(presented());
    const outcome = guard.inspect(NONCE, "cart_verify", presented());
    expect(outcome).toMatchObject({
      status: "replay",
      responseJson: '{"decision":"approve"}',
    });
  });

  it("conflicts on the same key with a different body", () => {
    burn(presented());
    const outcome = guard.inspect(
      NONCE,
      "cart_verify",
      presented({ payloadHash: guard.payloadHash({ cart: "other" }) }),
    );
    expect(outcome.status).toBe("conflict");
  });
});

describe("a burned nonce under a different key", () => {
  it("reports NONCE_BURNED to a different idempotency key", () => {
    burn(presented());
    const outcome = guard.inspect(
      NONCE,
      "cart_verify",
      presented({ idempotencyKey: "idem-2" }),
    );
    expect(outcome).toMatchObject({
      status: "burned",
      reasonCode: "NONCE_BURNED",
    });
  });

  it("discloses nothing about a burn belonging to another tenant", () => {
    burn(presented());
    const outcome = guard.inspect(
      NONCE,
      "cart_verify",
      presented({ tenantId: "tnt_other" }),
    );
    expect(outcome).toEqual({
      status: "burned",
      reasonCode: "TENANT_MISMATCH",
      state: null,
    });
  });
});

describe("the burn itself is the enforcement", () => {
  it("lets the first presenter through and refuses the second", () => {
    expect(
      guard.burn({
        nonce: NONCE,
        purpose: "cart_verify",
        presented: presented(),
        burnEventId: "evt_1",
        responseJson: "{}",
      }).status,
    ).toBe("burned");
    expect(
      guard.burn({
        nonce: NONCE,
        purpose: "cart_verify",
        presented: presented({ idempotencyKey: "idem-2" }),
        burnEventId: "evt_2",
        responseJson: "{}",
      }).status,
    ).toBe("conflict");
  });

  it("keeps cart and payment purposes on separate rows", () => {
    burn(presented());
    expect(guard.inspect(NONCE, "payment_execute", presented()).status).toBe(
      "fresh",
    );
  });
});

describe("payload hashing is canonical", () => {
  it("ignores key order and whitespace", () => {
    expect(guard.payloadHash({ a: 1, b: 2 })).toBe(
      guard.payloadHash({ b: 2, a: 1 }),
    );
  });

  it("tells the loser exactly how to recover", () => {
    burn(presented());
    expect(nonceToPass(registry.peek(NONCE, "cart_verify"))).toMatchObject({
      burn_event_id: "evt_1",
      remedy: "reissue_cart_mandate_with_new_jti",
    });
    expect(nonceToPass(null)).toBeNull();
  });
});
