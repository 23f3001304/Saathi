import { describe, expect, it } from "vitest";

import type { MemoryType, SourceChannel, Tier } from "@covenant/domain";
import { MEMORY_TYPES, MIN_TIER_TO_CREATE } from "@covenant/domain";

import { MERCHANT_SIG, USER_SIG } from "./fakes.js";
import { candidate, kindsOf } from "./builders.js";
import { newStack } from "./harness.js";

interface ChannelRow {
  readonly channel: SourceChannel;
  readonly sig: string | null;
  readonly tier: Tier;
  readonly quarantined: boolean;
}

/** §9.2's channel table, verbatim. Content is never consulted. */
const CHANNELS: readonly ChannelRow[] = [
  {
    channel: "user_signed_mandate",
    sig: USER_SIG,
    tier: 3,
    quarantined: false,
  },
  { channel: "user_confirmation", sig: USER_SIG, tier: 3, quarantined: false },
  {
    channel: "merchant_attestation",
    sig: MERCHANT_SIG,
    tier: 2,
    quarantined: false,
  },
  { channel: "verified_api", sig: null, tier: 1, quarantined: false },
  { channel: "untrusted_text", sig: null, tier: 0, quarantined: true },
];

function expectedStatus(row: ChannelRow, type: MemoryType): string {
  if (row.tier < MIN_TIER_TO_CREATE[type]) {
    return "rejected";
  }
  return row.quarantined ? "quarantined" : "committed";
}

describe("write gate: channel x type x outcome", () => {
  for (const row of CHANNELS) {
    for (const type of MEMORY_TYPES) {
      it(`${row.channel} writing ${type} -> ${expectedStatus(row, type)}`, async () => {
        const stack = newStack();
        const result = await stack.gate.submit(
          candidate({ type, sourceChannel: row.channel, sig: row.sig }),
        );
        const status = expectedStatus(row, type);
        expect(result.status).toBe(status);
        expect(result.tierGranted).toBe(row.tier);
        if (status === "rejected") {
          expect(result.reasonCode).toBe("TYPE_REQUIRES_HIGHER_TIER");
          expect(result.memoryId).toBeNull();
          expect(kindsOf(stack)).toEqual(["memory.write.rejected"]);
          return;
        }
        expect(result.memoryId).not.toBeNull();
        expect(kindsOf(stack)).toEqual(["memory.write.committed"]);
      });
    }
  }
});

describe("write gate: stage 1 tier claims", () => {
  it("rejects a claim above the channel's grant", async () => {
    const stack = newStack();
    const result = await stack.gate.submit(
      candidate({ sourceChannel: "untrusted_text", tierClaim: 3 }),
    );
    expect(result.status).toBe("rejected");
    expect(result.reasonCode).toBe("TIER_CLAIM_EXCEEDS_CHANNEL");
    expect(result.tierGranted).toBeNull();
    expect(kindsOf(stack)).toEqual(["memory.write.rejected"]);
  });

  it("honours a voluntary downgrade below the channel's grant", async () => {
    const stack = newStack();
    const result = await stack.gate.submit(
      candidate({
        sourceChannel: "user_signed_mandate",
        sig: USER_SIG,
        tierClaim: 1,
        type: "preference",
      }),
    );
    expect(result.status).toBe("committed");
    expect(result.tierGranted).toBe(1);
  });

  it("grants exactly the channel tier when the claim equals it", async () => {
    const stack = newStack();
    const result = await stack.gate.submit(
      candidate({ sourceChannel: "verified_api", tierClaim: 1 }),
    );
    expect(result.tierGranted).toBe(1);
    expect(result.status).toBe("committed");
  });
});

describe("write gate: stage 1 signatures", () => {
  const SIGNED: readonly SourceChannel[] = [
    "user_signed_mandate",
    "user_confirmation",
    "merchant_attestation",
  ];

  for (const channel of SIGNED) {
    it(`${channel} without a signature fails closed`, async () => {
      const stack = newStack();
      const result = await stack.gate.submit(
        candidate({ sourceChannel: channel, sig: null }),
      );
      expect(result.status).toBe("rejected");
      expect(result.reasonCode).toBe("SIGNATURE_INVALID");
    });
  }

  it("rejects a merchant signature presented as a user channel", async () => {
    const stack = newStack();
    const result = await stack.gate.submit(
      candidate({ sourceChannel: "user_signed_mandate", sig: MERCHANT_SIG }),
    );
    expect(result.reasonCode).toBe("SIGNATURE_INVALID");
  });

  it("rejects an unpinned signature", async () => {
    const stack = newStack();
    const result = await stack.gate.submit(
      candidate({ sourceChannel: "merchant_attestation", sig: "jws.forged" }),
    );
    expect(result.reasonCode).toBe("SIGNATURE_INVALID");
  });
});

describe("write gate: dedupe", () => {
  it("returns the live id for an identical re-observed fact", async () => {
    const stack = newStack();
    const twice = candidate({
      subject: "sku_9",
      predicate: "price",
      content: { value: 149900, currency: "INR" },
      sourceChannel: "merchant_attestation",
      sig: MERCHANT_SIG,
    });
    const first = await stack.gate.submit(twice);
    const second = await stack.gate.submit(twice);
    expect(second.deduped).toBe(true);
    expect(second.memoryId).toBe(first.memoryId);
    expect(kindsOf(stack)).toEqual([
      "memory.write.committed",
      "memory.write.committed",
    ]);
  });
});
