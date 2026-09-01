import { describe, expect, it } from "vitest";
import {
  CHANNEL_QUARANTINED,
  CHANNEL_REQUIRES_SIGNATURE,
  CHANNEL_TIER,
  MEMORY_TYPES,
  MIN_TIER_TO_CREATE,
  SOURCE_CHANNELS,
  TIER_LABELS,
  isTierLabel,
  parseTier,
  tierAtLeast,
  tierLabel,
  tierPermittedForType,
  tierPermittedToSupersede,
  tierRank,
  type MemoryType,
  type SourceChannel,
  type Tier,
  type TierLabel,
} from "../src/index.js";

const ALL_TIERS: readonly Tier[] = [0, 1, 2, 3];

// Wire → internal, both directions (design §4.3, decision 19).
const wireTable: readonly (readonly [TierLabel, Tier])[] = [
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3],
];

// Channel → granted tier (§9.2), the table content is never consulted for.
const channelTable: readonly (readonly [SourceChannel, Tier, boolean])[] = [
  ["user_signed_mandate", 3, false],
  ["user_confirmation", 3, false],
  ["merchant_attestation", 2, false],
  ["verified_api", 1, false],
  ["untrusted_text", 0, true],
];

// Write gate (§9.2), stated as the tiers each type accepts at creation.
const permittedTiersByType: readonly (readonly [
  MemoryType,
  readonly Tier[],
])[] = [
  ["constraint", [3]],
  ["preference", [1, 2, 3]],
  ["fact", [0, 1, 2, 3]],
  ["episode", [0, 1, 2, 3]],
  ["procedure", [1, 2, 3]],
];

const matrix = permittedTiersByType.flatMap(([type, permitted]) =>
  ALL_TIERS.map((tier) => [type, tier, permitted.includes(tier)] as const),
);

describe("tier wire format", () => {
  it.each(wireTable)('maps "%s" to rank %d and back', (label, rank) => {
    expect(tierRank(label)).toBe(rank);
    expect(tierLabel(rank)).toBe(label);
    expect(parseTier(label)).toBe(rank);
  });

  it("exposes exactly four labels", () => {
    expect(TIER_LABELS).toHaveLength(4);
  });

  it.each(["P4", "p0", "3", ""])('rejects "%s" as a tier label', (value) => {
    expect(isTierLabel(value)).toBe(false);
    expect(() => parseTier(value)).toThrow(RangeError);
  });

  it("orders by rank so a floor comparison is arithmetic", () => {
    expect(tierAtLeast(2, 1)).toBe(true);
    expect(tierAtLeast(1, 2)).toBe(false);
    expect(tierAtLeast(3, 3)).toBe(true);
  });
});

describe("channel to tier", () => {
  it.each(channelTable)(
    "%s grants tier %d (quarantined: %s)",
    (channel, tier, quarantined) => {
      expect(CHANNEL_TIER[channel]).toBe(tier);
      expect(CHANNEL_QUARANTINED[channel]).toBe(quarantined);
    },
  );

  it("requires a signature from exactly the three signed channels", () => {
    const signed = SOURCE_CHANNELS.filter(
      (channel) => CHANNEL_REQUIRES_SIGNATURE[channel],
    );
    expect(signed).toEqual([
      "user_signed_mandate",
      "user_confirmation",
      "merchant_attestation",
    ]);
  });
});

describe("tierPermittedForType", () => {
  it.each(matrix)("%s written at P%d -> %s", (type, tier, expected) => {
    expect(tierPermittedForType(type, tier)).toBe(expected);
  });

  it("covers every type/tier pair", () => {
    expect(matrix).toHaveLength(MEMORY_TYPES.length * ALL_TIERS.length);
  });

  it("lets only user-signed provenance create a constraint", () => {
    expect(MIN_TIER_TO_CREATE.constraint).toBe(3);
  });
});

describe("tierPermittedToSupersede", () => {
  it("never lets an episode be superseded: transcripts are append-only", () => {
    expect(
      ALL_TIERS.map((tier) => tierPermittedToSupersede("episode", tier)),
    ).toEqual([false, false, false, false]);
  });

  it("needs P1 to supersede a fact that P0 could create", () => {
    expect(tierPermittedForType("fact", 0)).toBe(true);
    expect(tierPermittedToSupersede("fact", 0)).toBe(false);
    expect(tierPermittedToSupersede("fact", 1)).toBe(true);
  });
});
