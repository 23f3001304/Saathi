import type { MemoryDigestToPass, MemoryEntry } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { MemoryDigestCheck, computeDigest } from "../../src/index.js";
import type { VerdictContext } from "../../src/index.js";
import { goldenContext } from "../context.js";
import { GOLDEN_ENTRIES, PREFERENCE_ENTRY, memoryEntry } from "../fixtures.js";

const check = new MemoryDigestCheck();

/** The store answered with `entries`; the cart signed over `GOLDEN_ENTRIES`. */
function withEntries(entries: readonly MemoryEntry[]): VerdictContext {
  const base = goldenContext();
  return {
    ...base,
    memory: {
      entries,
      recomputedDigest: computeDigest(entries),
      minTier: 0,
      missingIds: GOLDEN_ENTRIES.map((e) => e.id).filter(
        (id) => !entries.some((entry) => entry.id === id),
      ),
      extraIds: entries
        .map((e) => e.id)
        .filter((id) => !GOLDEN_ENTRIES.some((entry) => entry.id === id)),
    },
  };
}

const EXTRA = memoryEntry({
  id: "mem_00000000-0000-4000-8000-000000000003",
  tier: 1,
  channel: "verified_api",
  predicate: "colour",
  content: { prefers: "black" },
});

describe("MemoryDigestCheck", () => {
  it("passes when the recomputed digest matches the signed one", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it("still matches when the ids are listed in a different order", () => {
    const reversed = [...GOLDEN_ENTRIES].reverse();
    expect(check.run(withEntries(reversed)).outcome).toBe("pass");
  });

  it("fails MEMORY_DIGEST_MISMATCH when one belief was removed", () => {
    const verdict = check.run(withEntries([PREFERENCE_ENTRY]));
    expect(verdict.reason_code).toBe("MEMORY_DIGEST_MISMATCH");
    const toPass = verdict.to_pass as MemoryDigestToPass;
    expect(toPass.missing_ids).toHaveLength(1);
  });

  it("fails MEMORY_DIGEST_MISMATCH when a belief was added", () => {
    const verdict = check.run(withEntries([...GOLDEN_ENTRIES, EXTRA]));
    expect(verdict.reason_code).toBe("MEMORY_DIGEST_MISMATCH");
    const toPass = verdict.to_pass as MemoryDigestToPass;
    expect(toPass.extra_ids).toEqual([EXTRA.id]);
  });

});

describe("MemoryDigestCheck — the entries behind the digest", () => {
  it("fails MEMORY_DIGEST_MISMATCH on an unrecognised digest algorithm", () => {
    const verdict = check.run(
      goldenContext({
        cart: { memory_digest_alg: "covenant-md-9" as never },
      }),
    );
    expect(verdict.reason_code).toBe("MEMORY_DIGEST_MISMATCH");
  });

  it("fails MEMORY_TIER_VIOLATION when a P0 entry is in the signed set", () => {
    const p0 = { ...PREFERENCE_ENTRY, tier: 0 as const };
    const entries = [GOLDEN_ENTRIES[0]!, p0];
    const base = withEntries(entries);
    const verdict = check.run({
      ...base,
      cart: { ...base.cart, memory_digest: computeDigest(entries) },
    });
    expect(verdict.reason_code).toBe("MEMORY_TIER_VIOLATION");
    const toPass = verdict.to_pass as MemoryDigestToPass;
    expect(toPass.offending_entry_ids).toEqual([p0.id]);
    expect(toPass.their_tiers).toEqual(["P0"]);
  });

  it("fails MEMORY_TIER_VIOLATION on a quarantined entry at any tier", () => {
    const entries = [
      GOLDEN_ENTRIES[0]!,
      { ...PREFERENCE_ENTRY, quarantined: true },
    ];
    const base = withEntries(entries);
    expect(
      check.run({
        ...base,
        cart: { ...base.cart, memory_digest: computeDigest(entries) },
      }).reason_code,
    ).toBe("MEMORY_TIER_VIOLATION");
  });

});

describe("MemoryDigestCheck — bi-temporal and tenant scope", () => {
  it("fails MEMORY_ENTRY_EXPIRED: the agent may not sign over retired beliefs", () => {
    const retired = {
      ...PREFERENCE_ENTRY,
      tExpired: "2026-08-31T09:30:00.000Z",
    };
    const entries = [GOLDEN_ENTRIES[0]!, retired];
    const base = withEntries(entries);
    expect(
      check.run({
        ...base,
        cart: { ...base.cart, memory_digest: computeDigest(entries) },
      }).reason_code,
    ).toBe("MEMORY_ENTRY_EXPIRED");
  });

  it("fails MEMORY_TENANT_MISMATCH on a foreign-tenant entry", () => {
    const foreign = { ...PREFERENCE_ENTRY, tenantId: "tnt_other" };
    const entries = [GOLDEN_ENTRIES[0]!, foreign];
    const base = withEntries(entries);
    expect(
      check.run({
        ...base,
        cart: { ...base.cart, memory_digest: computeDigest(entries) },
      }).reason_code,
    ).toBe("MEMORY_TENANT_MISMATCH");
  });
});
