import { describe, expect, it } from "vitest";
import {
  ACTION_CLASSES,
  ACTION_POLICY,
  CART_CONSTRUCTION_TIER_FLOOR,
  type ActionClass,
  type Tier,
} from "../src/index.js";

// §9.3, one row per action class.
const policyTable: readonly (readonly [
  ActionClass,
  Tier,
  boolean,
  boolean,
  number | null,
  boolean,
])[] = [
  ["chat", 0, true, true, 20, false],
  ["cart-construction", 1, false, true, 12, true],
  ["constraint-evaluation", 3, false, false, 50, true],
  ["price-history", 2, false, false, 200, false],
  ["recs-training", 1, false, true, null, false],
];

describe("read-gate action policy", () => {
  it.each(policyTable)(
    "%s: floor P%d, quarantined %s, decay %s, limit %s, digest %s",
    (actionClass, floor, quarantined, decay, limit, digest) => {
      const policy = ACTION_POLICY[actionClass];
      expect(policy.tierFloor).toBe(floor);
      expect(policy.quarantinedVisible).toBe(quarantined);
      expect(policy.decayApplied).toBe(decay);
      expect(policy.defaultLimit).toBe(limit);
      expect(policy.mintsDigest).toBe(digest);
    },
  );

  it("covers every declared action class", () => {
    expect(policyTable).toHaveLength(ACTION_CLASSES.length);
  });
});

describe("read-gate policy invariants", () => {
  it("keeps a P0 entry out of every class except chat", () => {
    const visible = ACTION_CLASSES.filter(
      (name) => ACTION_POLICY[name].tierFloor === 0,
    );
    expect(visible).toEqual(["chat"]);
  });

  it("never decays a constraint", () => {
    expect(ACTION_POLICY["constraint-evaluation"].decayApplied).toBe(false);
    expect(ACTION_POLICY["constraint-evaluation"].types).toEqual([
      "constraint",
    ]);
  });

  it("mints a digest only where a cart is being justified", () => {
    const minting = ACTION_CLASSES.filter(
      (name) => ACTION_POLICY[name].mintsDigest,
    );
    expect(minting).toEqual(["cart-construction", "constraint-evaluation"]);
  });

  it("holds a signed cart to the cart-construction floor", () => {
    expect(CART_CONSTRUCTION_TIER_FLOOR).toBe(1);
  });

  it("scopes price history to price facts only", () => {
    expect(ACTION_POLICY["price-history"].predicates).toEqual(["price"]);
    expect(ACTION_POLICY["price-history"].types).toEqual(["fact"]);
  });
});
