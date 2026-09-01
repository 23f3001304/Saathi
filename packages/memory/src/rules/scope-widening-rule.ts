import type { MemoryContent, MemoryEntry } from "@covenant/domain";
import { isMembershipPredicate } from "@covenant/domain";

import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
} from "./contradiction-rule.js";
import { PASS, reject } from "./contradiction-rule.js";
import { listOf, stringOf } from "./content-value.js";

const ALLOW_KEYS = [
  "allow",
  "allowlist",
  "allowed",
  "allowed_merchants",
  "allowed_skus",
  "allowed_categories",
] as const;

const DENY_KEYS = [
  "deny",
  "denylist",
  "denied",
  "denied_merchants",
  "denied_skus",
  "denied_categories",
] as const;

/**
 * R2 (§9.1). An allowlist a candidate is absent from and a denylist it is
 * present in are the same claim — "this merchant is fine now" — arriving from
 * a channel that does not get to decide that. The membership axes are
 * `domain`'s, shared with the route that files them (§6.2).
 */
export class ScopeWideningRule implements ContradictionRule {
  readonly id = "R2.scope-widening";

  appliesTo(context: RuleContext): boolean {
    return (
      isMembershipPredicate(context.candidate.predicate) &&
      member(context) !== null
    );
  }

  evaluate(context: RuleContext): RuleOutcome {
    const asserted = member(context);
    if (asserted === null) {
      return PASS;
    }
    for (const constraint of this.constraintsOn(context)) {
      if (excludes(constraint, asserted)) {
        return reject("SCOPE_WIDENING_ATTEMPT", constraint.id);
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

/**
 * The membership being asserted: the content value, else the subject key.
 *
 * A candidate that *carries* an allow- or denylist is declaring the bound, not
 * claiming to be inside one, so it asserts no member. Without this a signed
 * covenant could not be re-signed: `POST /covenant/sign` files
 * `merchant: {allow: [...]}` under `subject: 'user'`, and the subject fallback
 * would read that as the merchant `user` asking to join its own allowlist.
 * Nothing is loosened — declaring a list creates no constraint below P3, and a
 * candidate that names a merchant still meets the rule below.
 */
function member(context: RuleContext): string | null {
  const { content, predicate, subject } = context.candidate;
  if (declaresList(content)) {
    return null;
  }
  return stringOf(content, predicate) ?? subject;
}

function declaresList(content: MemoryContent): boolean {
  return (
    listOf(content, ALLOW_KEYS) !== null || listOf(content, DENY_KEYS) !== null
  );
}

function excludes(constraint: MemoryEntry, asserted: string): boolean {
  const allowed = listOf(constraint.content, ALLOW_KEYS);
  if (allowed !== null && !allowed.includes(asserted)) {
    return true;
  }
  const denied = listOf(constraint.content, DENY_KEYS);
  return denied !== null && denied.includes(asserted);
}
