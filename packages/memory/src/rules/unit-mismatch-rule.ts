import type { MemoryEntry } from "@covenant/domain";

import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
} from "./contradiction-rule.js";
import { PASS, reject } from "./contradiction-rule.js";
import { currencyOf, unitOf } from "./content-value.js";

/**
 * R5 (§9.1). ₹ vs $, paise vs rupees, bps vs percent: a unit mismatch on a
 * constrained predicate is a hundredfold relaxation wearing a plausible face,
 * and R1 cannot see it because the *number* went down.
 */
export class UnitMismatchRule implements ContradictionRule {
  readonly id = "R5.unit-mismatch";

  appliesTo(context: RuleContext): boolean {
    const { content } = context.candidate;
    return (
      context.candidate.predicate !== null &&
      (unitOf(content) !== null || currencyOf(content) !== null)
    );
  }

  evaluate(context: RuleContext): RuleOutcome {
    for (const constraint of this.constraintsOn(context)) {
      if (mismatches(context.candidate.content, constraint)) {
        return reject("UNIT_MISMATCH", constraint.id);
      }
    }
    return PASS;
  }

  private constraintsOn(context: RuleContext): readonly MemoryEntry[] {
    return context.constraints.filter(
      (entry) => entry.predicate === context.candidate.predicate,
    );
  }
}

/** Only a declared-on-both-sides difference is a mismatch; silence is not. */
function mismatches(
  content: Readonly<Record<string, unknown>>,
  constraint: MemoryEntry,
): boolean {
  return (
    differs(unitOf(content), unitOf(constraint.content)) ||
    differs(currencyOf(content), currencyOf(constraint.content))
  );
}

function differs(left: string | null, right: string | null): boolean {
  return left !== null && right !== null && left !== right;
}
