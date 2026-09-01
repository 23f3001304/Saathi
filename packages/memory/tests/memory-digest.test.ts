import { describe, expect, it } from "vitest";

import type { MemoryEntry } from "@covenant/domain";
import {
  MEMORY_DIGEST_ALG,
  canonicalize,
  toCanonicalForm,
} from "@covenant/domain";

import { computeDigest, entryHashOf } from "../src/index.js";

/** A frozen fixture: change it and the golden vector below must change too. */
const CONSTRAINT: MemoryEntry = {
  id: "mem_00000000-0000-4000-8000-000000000001",
  tenantId: "acme",
  userId: "user_kavya",
  type: "constraint",
  tier: 3,
  quarantined: false,
  subject: "user",
  predicate: "max_amount",
  content: { currency: "INR", unit: "paise", value: 200000 },
  contentHash: "c".repeat(64),
  entryHash: "d".repeat(64),
  sourceChannel: "user_signed_mandate",
  sourceRef: "urn:uuid:11111111-1111-4111-8111-111111111111",
  tValid: "2026-08-01T00:00:00.000Z",
  tInvalid: null,
  tCreated: "2026-08-01T09:30:00.000Z",
  tExpired: null,
  supersededBy: null,
  writeEventId: "00000000-0000-4000-8000-000000000009",
};

const QUOTE: MemoryEntry = {
  ...CONSTRAINT,
  id: "mem_00000000-0000-4000-8000-000000000002",
  type: "fact",
  tier: 2,
  subject: "sku_air_1",
  predicate: "price",
  content: { currency: "INR", value: 149900 },
  sourceChannel: "merchant_attestation",
  sourceRef: null,
  tValid: "2026-08-31T11:00:00.000Z",
  tInvalid: "2026-08-31T11:30:00.000Z",
  tCreated: "2026-08-31T11:00:00.000Z",
};

const TASTE: MemoryEntry = {
  ...CONSTRAINT,
  id: "mem_00000000-0000-4000-8000-000000000003",
  type: "preference",
  tier: 1,
  subject: null,
  predicate: null,
  content: { value: "indigo" },
  sourceChannel: "verified_api",
  sourceRef: null,
  tCreated: "2026-08-15T08:00:00.000Z",
};

const GOLDEN_ENTRIES = [CONSTRAINT, QUOTE, TASTE];

/**
 * Golden vector for `covenant-md-1`. If this value moves, the algorithm
 * changed and §9.4 rule 4 says the version bumps to `covenant-md-2` — every
 * mandate already signed keeps verifying under the old rule.
 */
const GOLDEN_DIGEST =
  "sha256:d846600935dc010b05bce24cb08ab3f3dcf579f00ee8f407ea6d1634af684cb5";

describe("covenant-md-1 golden vector (§9.4)", () => {
  it("names its algorithm", () => {
    expect(MEMORY_DIGEST_ALG).toBe("covenant-md-1");
  });

  it("hashes the fixed entry set to the golden digest", () => {
    expect(computeDigest(GOLDEN_ENTRIES)).toBe(GOLDEN_DIGEST);
  });

  it("is stable under entry reordering", () => {
    const shuffled = [TASTE, CONSTRAINT, QUOTE];
    expect(computeDigest(shuffled)).toBe(GOLDEN_DIGEST);
    expect(computeDigest([QUOTE, TASTE, CONSTRAINT])).toBe(GOLDEN_DIGEST);
  });

  it("changes when one character of one entry's content changes", () => {
    const tampered: MemoryEntry = {
      ...QUOTE,
      content: { currency: "INR", value: 149901 },
    };
    expect(computeDigest([CONSTRAINT, tampered, TASTE])).not.toBe(
      GOLDEN_DIGEST,
    );
  });

  it("changes when an entry is dropped", () => {
    expect(computeDigest([CONSTRAINT, QUOTE])).not.toBe(GOLDEN_DIGEST);
  });
});

describe("entry hash field discipline", () => {
  it("ignores fields outside the fixed list", () => {
    const restamped: MemoryEntry = {
      ...CONSTRAINT,
      contentHash: "0".repeat(64),
      entryHash: "1".repeat(64),
      supersededBy: "mem_00000000-0000-4000-8000-0000000000ff",
      writeEventId: "another-event",
      quarantined: true,
    };
    expect(entryHashOf(restamped)).toBe(entryHashOf(CONSTRAINT));
  });

  it("emits absent members as null rather than omitting them", () => {
    const form = canonicalize(toCanonicalForm(TASTE));
    expect(form).toContain('"subject":null');
    expect(form).toContain('"predicate":null');
    expect(form).toContain('"t_expired":null');
  });

  it("distinguishes a retired entry from a live one", () => {
    const retired: MemoryEntry = {
      ...CONSTRAINT,
      tExpired: "2026-09-01T00:00:00.000Z",
    };
    expect(entryHashOf(retired)).not.toBe(entryHashOf(CONSTRAINT));
  });

  it("hashes the integer tier, not the wire label", () => {
    expect(canonicalize(toCanonicalForm(CONSTRAINT))).toContain('"tier":3');
  });
});
