import type { MemoryType, Tier } from "./memory-type.js";

/** Read gate (§9.3): what a retrieval is *for* decides what it may see. */
export const ACTION_CLASSES = [
  "chat",
  "cart-construction",
  "constraint-evaluation",
  "price-history",
  "recs-training",
] as const;

export type ActionClass = (typeof ACTION_CLASSES)[number];

export interface ActionPolicy {
  readonly tierFloor: Tier;
  readonly types: readonly MemoryType[];
  readonly predicates: readonly string[] | null;
  readonly quarantinedVisible: boolean;
  readonly decayApplied: boolean;
  /** `null` = unbounded (recs training folds over the whole corpus). */
  readonly defaultLimit: number | null;
  readonly mintsDigest: boolean;
}

const ALL_TYPES: readonly MemoryType[] = [
  "constraint",
  "preference",
  "fact",
  "episode",
  "procedure",
];

/**
 * Constraints do not decay (§9.3): a decayed constraint is a constraint that
 * quietly stops binding, which is the opposite of a Ulysses contract.
 */
export const ACTION_POLICY: Record<ActionClass, ActionPolicy> = {
  chat: {
    tierFloor: 0,
    types: ALL_TYPES,
    predicates: null,
    quarantinedVisible: true,
    decayApplied: true,
    defaultLimit: 20,
    mintsDigest: false,
  },
  "cart-construction": {
    tierFloor: 1,
    types: ["constraint", "preference", "fact", "procedure"],
    predicates: null,
    quarantinedVisible: false,
    decayApplied: true,
    defaultLimit: 12,
    mintsDigest: true,
  },
  "constraint-evaluation": {
    tierFloor: 3,
    types: ["constraint"],
    predicates: null,
    quarantinedVisible: false,
    decayApplied: false,
    defaultLimit: 50,
    mintsDigest: true,
  },
  "price-history": {
    tierFloor: 2,
    types: ["fact"],
    predicates: ["price"],
    quarantinedVisible: false,
    decayApplied: false,
    defaultLimit: 200,
    mintsDigest: false,
  },
  "recs-training": {
    tierFloor: 1,
    types: ["fact", "preference", "episode"],
    predicates: null,
    quarantinedVisible: false,
    decayApplied: true,
    defaultLimit: null,
    mintsDigest: false,
  },
};

/** The tier floor `MemoryDigestCheck` holds a signed cart to (§8.4 check 5). */
export const CART_CONSTRUCTION_TIER_FLOOR: Tier =
  ACTION_POLICY["cart-construction"].tierFloor;
