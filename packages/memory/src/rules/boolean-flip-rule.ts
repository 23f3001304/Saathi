import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
} from "./contradiction-rule.js";
import { PASS, reject } from "./contradiction-rule.js";
import { booleanOf } from "./content-value.js";

/** The four booleans a purchase leans on; flipping one is never a fact (§9.1). */
export const PROTECTED_BOOLEANS = [
  "requires_refundability",
  "allow_credit",
  "user_cart_confirmation_required",
  "share_aggregates",
] as const;

const P3: number = 3;

function isProtected(predicate: string | null): boolean {
  return (
    predicate !== null &&
    (PROTECTED_BOOLEANS as readonly string[]).includes(predicate)
  );
}

/**
 * R3 (§9.1). A *flip* needs something to flip: the rule fires only against a
 * live constraint that already holds the opposite value. Why not reject every
 * sub-P3 assertion outright: with no constraint present there is no protected
 * boolean yet, and `constraint` itself is P3-only by R0, so nothing has been
 * loosened — the write is an opinion, not an override.
 */
export class BooleanFlipRule implements ContradictionRule {
  readonly id = "R3.boolean-flip";

  appliesTo(context: RuleContext): boolean {
    return (
      context.grantedTier < P3 &&
      isProtected(context.candidate.predicate) &&
      this.asserted(context) !== null
    );
  }

  evaluate(context: RuleContext): RuleOutcome {
    const asserted = this.asserted(context);
    if (asserted === null || context.grantedTier >= P3) {
      return PASS;
    }
    for (const constraint of context.constraints) {
      if (constraint.predicate !== context.candidate.predicate) {
        continue;
      }
      const held = booleanOf(constraint.content, constraint.predicate);
      if (held !== null && held !== asserted) {
        return reject("PROTECTED_BOOLEAN_FLIP", constraint.id);
      }
    }
    return PASS;
  }

  private asserted(context: RuleContext): boolean | null {
    const { content, predicate } = context.candidate;
    return booleanOf(content, predicate);
  }
}
