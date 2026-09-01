import type { ConstraintDirection, MemoryEntry } from "@covenant/domain";
import { constraintDirectionOf } from "@covenant/domain";

import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
} from "./contradiction-rule.js";
import { PASS, reject } from "./contradiction-rule.js";
import { instantOf, numberOf } from "./content-value.js";

/**
 * R1 (§9.1). Widening a bound is the attack; narrowing it is a user tightening
 * their own covenant, which is always allowed. The direction table is the
 * whole rule: a bound is widened by a *higher* ceiling, a *lower* floor, or a
 * *later* blackout end.
 *
 * The table itself is `domain`'s `constraint-keys` module, shared with
 * `POST /covenant/sign`. This rule is the policy statement, never a second
 * copy of the key names — a bound filed under a name the rule does not know is
 * a bound nothing defends.
 */
function widens(
  direction: ConstraintDirection,
  candidate: number,
  bound: number,
): boolean {
  return direction === "ceiling" || direction === "blackout_end"
    ? candidate > bound
    : candidate < bound;
}

export class NumericRelaxationRule implements ContradictionRule {
  readonly id = "R1.numeric-relaxation";

  appliesTo(context: RuleContext): boolean {
    const direction = constraintDirectionOf(context.candidate.predicate);
    return direction !== null && this.assertedBy(context, direction) !== null;
  }

  evaluate(context: RuleContext): RuleOutcome {
    const direction = constraintDirectionOf(context.candidate.predicate);
    const asserted =
      direction === null ? null : this.assertedBy(context, direction);
    if (direction === null || asserted === null) {
      return PASS;
    }
    for (const bound of this.boundsIn(context)) {
      const value = this.readIn(bound, direction);
      if (value !== null && widens(direction, asserted, value)) {
        return reject("CONSTRAINT_RELAXATION_ATTEMPT", bound.id);
      }
    }
    return PASS;
  }

  private assertedBy(
    context: RuleContext,
    direction: ConstraintDirection,
  ): number | null {
    const { content, predicate } = context.candidate;
    return direction === "blackout_end"
      ? instantOf(content, predicate)
      : numberOf(content, predicate);
  }

  /** Only constraints on the same predicate bound this write. */
  private boundsIn(context: RuleContext): readonly MemoryEntry[] {
    return context.constraints.filter(
      (entry) => entry.predicate === context.candidate.predicate,
    );
  }

  private readIn(
    entry: MemoryEntry,
    direction: ConstraintDirection,
  ): number | null {
    return direction === "blackout_end"
      ? instantOf(entry.content, entry.predicate)
      : numberOf(entry.content, entry.predicate);
  }
}
