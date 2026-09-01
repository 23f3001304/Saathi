/** Memanto-style typed memory, specialised for commerce (§9.2). */
export const MEMORY_TYPES = [
  "constraint",
  "preference",
  "fact",
  "episode",
  "procedure",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Wire representation of a provenance tier (design §4.3, decision 19). */
export const TIER_LABELS = ["P0", "P1", "P2", "P3"] as const;

export type TierLabel = (typeof TIER_LABELS)[number];

/**
 * Storage and scoring representation: the integer rank that the DDL stores
 * (§3.4) and the digest hashes (§9.4). Never crosses the wire.
 */
export type Tier = 0 | 1 | 2 | 3;

const RANK_OF_LABEL: Record<TierLabel, Tier> = { P0: 0, P1: 1, P2: 2, P3: 3 };

const LABEL_OF_RANK: Record<Tier, TierLabel> = {
  0: "P0",
  1: "P1",
  2: "P2",
  3: "P3",
};

export function tierRank(label: TierLabel): Tier {
  return RANK_OF_LABEL[label];
}

export function tierLabel(tier: Tier): TierLabel {
  return LABEL_OF_RANK[tier];
}

export function isTierLabel(value: string): value is TierLabel {
  return Object.hasOwn(RANK_OF_LABEL, value);
}

/** Wire → internal, at the one boundary where a claimed tier is admitted. */
export function parseTier(label: string): Tier {
  if (!isTierLabel(label)) {
    throw new RangeError(`Unknown provenance tier "${label}"`);
  }
  return RANK_OF_LABEL[label];
}

export function tierAtLeast(tier: Tier, floor: Tier): boolean {
  return tier >= floor;
}

/**
 * Provenance tier is derived from the *verified source channel*, never from
 * content (§9.2). A lower claim is honoured; a higher one is rejected.
 */
export const SOURCE_CHANNELS = [
  "user_signed_mandate",
  "user_confirmation",
  "merchant_attestation",
  "verified_api",
  "untrusted_text",
] as const;

export type SourceChannel = (typeof SOURCE_CHANNELS)[number];

export const CHANNEL_TIER: Record<SourceChannel, Tier> = {
  user_signed_mandate: 3,
  user_confirmation: 3,
  merchant_attestation: 2,
  verified_api: 1,
  untrusted_text: 0,
};

/** Only `untrusted_text` is quarantined, and it is quarantined always. */
export const CHANNEL_QUARANTINED: Record<SourceChannel, boolean> = {
  user_signed_mandate: false,
  user_confirmation: false,
  merchant_attestation: false,
  verified_api: false,
  untrusted_text: true,
};

/** The three signed channels must present a JWS before a tier is granted. */
export const CHANNEL_REQUIRES_SIGNATURE: Record<SourceChannel, boolean> = {
  user_signed_mandate: true,
  user_confirmation: true,
  merchant_attestation: true,
  verified_api: false,
  untrusted_text: false,
};

/**
 * Write gate (§9.2). A `constraint` requires P3 because a constraint is the
 * object that bounds spending — poisoned catalog text arriving as P0 must
 * never be able to create or relax one.
 */
export const MIN_TIER_TO_CREATE: Record<MemoryType, Tier> = {
  constraint: 3,
  preference: 1,
  fact: 0,
  episode: 0,
  procedure: 1,
};

/** `null` = never supersedable: episodes are transcripts, append-only. */
export const MIN_TIER_TO_SUPERSEDE: Record<MemoryType, Tier | null> = {
  constraint: 3,
  preference: 1,
  fact: 1,
  episode: null,
  procedure: 1,
};

export function tierPermittedForType(type: MemoryType, tier: Tier): boolean {
  return tierAtLeast(tier, MIN_TIER_TO_CREATE[type]);
}

export function tierPermittedToSupersede(
  type: MemoryType,
  tier: Tier,
): boolean {
  const floor = MIN_TIER_TO_SUPERSEDE[type];
  return floor !== null && tierAtLeast(tier, floor);
}
