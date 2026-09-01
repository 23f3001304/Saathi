import { constraintDirectionOf } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import {
  AMENDABLE_RULES,
  axisOf,
  directionOf,
} from "../src/buyer/covenant-amendment.js";

/** The one key where the amendment table and R1's table read a rule
 *  differently, and why, is argued at the table itself. */
const DIVERGENT = new Set(["threshold_paise"]);

const SCALARS = Object.entries(AMENDABLE_RULES)
  .filter(([, shape]) => shape.kind === "scalar")
  .map(([rule]) => rule);

/**
 * A second copy of a direction table is exactly the defect `constraint-keys`
 * exists to close, so the copy is not allowed to drift silently: every scalar
 * rule must file under the axis `domain` files it under, and the one that does
 * not has to be listed here on purpose.
 */
describe("the amendment axes and R1's axes", () => {
  it("covers every scalar rule with an axis", () => {
    expect(SCALARS.length).toBeGreaterThan(0);
    for (const rule of SCALARS) {
      expect(axisOf(rule)).not.toBeNull();
    }
  });

  it("agrees with domain on every key but the documented one", () => {
    for (const rule of SCALARS) {
      if (DIVERGENT.has(rule)) {
        continue;
      }
      expect(axisOf(rule)).toBe(constraintDirectionOf(rule));
    }
  });

  it("still diverges on the one it says it diverges on", () => {
    expect(constraintDirectionOf("threshold_paise")).toBe("floor");
    expect(axisOf("threshold_paise")).toBe("ceiling");
    // Raising the cool-off threshold exempts more purchases from the wait.
    expect(directionOf("threshold_paise", 500_000, 5_000_000)).toBe("widens");
    expect(directionOf("threshold_paise", 500_000, 100_000)).toBe("narrows");
  });
});
