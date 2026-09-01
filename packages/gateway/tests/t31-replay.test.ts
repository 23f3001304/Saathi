import type { IssuedMandate } from "@covenant/mandates";
import { beforeEach, describe, expect, it } from "vitest";

import { verifyCartCommand } from "./commands.js";
import type { Harness } from "./harness.js";
import { newHarness } from "./harness.js";
import { issueCart, issueIntent } from "./mandate-harness.js";

let harness: Harness;
let intent: IssuedMandate;
let cart: IssuedMandate;

beforeEach(async () => {
  harness = await newHarness();
  intent = await issueIntent(harness.crypto);
  cart = await issueCart(harness.crypto, intent);
});

function present(key: string) {
  return harness.verifyCart.verify(verifyCartCommand(intent, cart, key));
}

/**
 * T-31, and the whole of §4.5 made visible: a replay is not a retry, a retry is
 * not a replay, and a mutated retry is neither.
 */
describe("T-31 — a replay under a fresh key", () => {
  it("approves once, then rejects NONCE_BURNED with all eight seals", async () => {
    const first = await present("key-1");
    const second = await present("key-2");
    if (first.status !== "verdict" || second.status !== "verdict") {
      throw new Error("expected verdict bodies");
    }
    expect(first.body.decision).toBe("approve");
    expect(second.body.decision).toBe("reject");
    expect(second.body.reason_code).toBe("NONCE_BURNED");
    expect(second.body.verdicts).toHaveLength(8);
    expect(second.body.verdicts.find((v) => v.check === "nonce")?.outcome).toBe(
      "fail",
    );
    expect(second.body.payment_mandate_jwt).toBeNull();
  });

  it("is ledgered as an attack as well as a rejection", async () => {
    await present("key-1");
    await present("key-2");
    const attacks = harness.published.frames.filter(
      (frame) => frame.kind === "attack.detected",
    );
    expect(attacks).toHaveLength(1);
    expect(attacks[0]?.payload).toMatchObject({
      attack_id: "T-31",
      reason_code: "NONCE_BURNED",
      detail_kind: "nonce.replay",
    });
  });
});

describe("T-31 — an identical retry is not a replay", () => {
  it("returns the stored response verbatim", async () => {
    const first = await present("key-1");
    const retry = await present("key-1");
    if (first.status !== "verdict" || retry.status !== "verdict") {
      throw new Error("expected verdict bodies");
    }
    expect(retry.replay).toBe(true);
    expect(retry.body).toEqual(first.body);
  });

  it("appends nothing — the answer is already durable", async () => {
    await present("key-1");
    const height = harness.reader.head()?.seq ?? 0;
    await present("key-1");
    expect(harness.reader.head()?.seq).toBe(height);
  });
});

describe("T-31 — a mutated retry is neither", () => {
  it("answers 409 with both payload hashes", async () => {
    await present("key-1");
    const conflict = await harness.verifyCart.verify({
      ...verifyCartCommand(intent, cart, "key-1"),
      payloadHash: "f".repeat(64),
    });
    expect(conflict.status).toBe("conflict");
    if (conflict.status !== "conflict") {
      return;
    }
    expect(conflict.toPass.received_payload_hash).toBe("f".repeat(64));
    expect(conflict.toPass.remedy).toBe("retry_with_new_idempotency_key");
  });
});
