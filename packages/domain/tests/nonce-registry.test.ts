import { describe, expect, it } from "vitest";
import {
  NONCE_PURPOSES,
  resolveIdempotency,
  type IdempotencyOutcome,
  type NonceState,
  type PresentedRequest,
} from "../src/index.js";

const STORED_HASH = "1".repeat(64);
const OTHER_HASH = "2".repeat(64);

const burned: NonceState = {
  nonce: "urn:uuid:7c02",
  purpose: "cart_verify",
  tenantId: "tnt_demo",
  payloadHash: STORED_HASH,
  idempotencyKey: "idem_1",
  burnedAt: "2026-08-31T10:01:00.000Z",
  burnEventId: "evt_7",
  responseJson: '{"ok":true,"decision":"approve"}',
};

const presented: PresentedRequest = {
  tenantId: "tnt_demo",
  idempotencyKey: "idem_1",
  payloadHash: STORED_HASH,
};

// §4.5, one row per line of the table.
const table: readonly (readonly [
  string,
  NonceState | null,
  PresentedRequest,
  IdempotencyOutcome["status"],
])[] = [
  ["unseen key, unburned nonce", null, presented, "fresh"],
  ["same key, same payload", burned, presented, "replay"],
  [
    "same key, different payload",
    burned,
    { ...presented, payloadHash: OTHER_HASH },
    "conflict",
  ],
  [
    "different key, burned nonce",
    burned,
    { ...presented, idempotencyKey: "idem_2" },
    "burned",
  ],
  [
    "burned by another tenant",
    burned,
    { ...presented, tenantId: "tnt_other" },
    "burned",
  ],
];

describe("nonce purposes", () => {
  it("separates the cart burn from the payment burn", () => {
    expect(NONCE_PURPOSES).toEqual(["cart_verify", "payment_execute"]);
  });
});

describe("the four idempotency states", () => {
  it.each(table)("%s -> %s", (_name, stored, request, expected) => {
    expect(resolveIdempotency(stored, request).status).toBe(expected);
  });

  it("replays the stored response verbatim on an identical retry", () => {
    const outcome = resolveIdempotency(burned, presented);
    expect(outcome).toEqual({
      status: "replay",
      responseJson: burned.responseJson,
      burnedAt: burned.burnedAt,
    });
  });

  it("reports both hashes on a conflict so the caller can see the difference", () => {
    const outcome = resolveIdempotency(burned, {
      ...presented,
      payloadHash: OTHER_HASH,
    });
    expect(outcome).toEqual({
      status: "conflict",
      storedPayloadHash: STORED_HASH,
      receivedPayloadHash: OTHER_HASH,
    });
  });
});

describe("burned nonce disclosure", () => {
  it("answers a fresh-key replay attack with NONCE_BURNED and the burn record", () => {
    const outcome = resolveIdempotency(burned, {
      ...presented,
      idempotencyKey: "idem_2",
    });
    expect(outcome).toEqual({
      status: "burned",
      reasonCode: "NONCE_BURNED",
      state: burned,
    });
  });

  it("discloses nothing about a burn belonging to another tenant", () => {
    const outcome = resolveIdempotency(burned, {
      ...presented,
      tenantId: "tnt_other",
    });
    expect(outcome).toEqual({
      status: "burned",
      reasonCode: "TENANT_MISMATCH",
      state: null,
    });
  });

  it("checks the tenant before the key, so a cross-tenant key cannot replay", () => {
    const outcome = resolveIdempotency(burned, {
      tenantId: "tnt_other",
      idempotencyKey: burned.idempotencyKey,
      payloadHash: burned.payloadHash,
    });
    expect(outcome.status).toBe("burned");
  });
});
