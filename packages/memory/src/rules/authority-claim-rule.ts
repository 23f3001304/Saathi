import { canonicalize } from "@covenant/domain";

import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
} from "./contradiction-rule.js";
import { PASS, reject } from "./contradiction-rule.js";
import {
  CONTEXT_POISONING_ATTACK_ID,
  matchingAuthorityPattern,
} from "./authority-patterns.js";

const P3: number = 3;

/**
 * R4 (§9.1, decision 39). A **labeller**, not the defence: stages 1 and 2 have
 * already made this text incapable of touching a constraint, and R4 exists so
 * the ledger records `attack_id: 'T-1'` and the audit lane can say "this text
 * tried to raise your limit" instead of "an ordinary P0 fact was written".
 * A defence you cannot see is a defence a judge cannot score.
 *
 * The subject and predicate ride into the match alongside the content: a
 * poisoned catalog string is as likely to smuggle its authority claim through
 * the key it writes under as through the value it writes.
 */
export class AuthorityClaimRule implements ContradictionRule {
  readonly id = "R4.authority-claim";

  appliesTo(context: RuleContext): boolean {
    return context.grantedTier < P3;
  }

  evaluate(context: RuleContext): RuleOutcome {
    if (context.grantedTier >= P3) {
      return PASS;
    }
    const matched = matchingAuthorityPattern(serializeFor(context));
    return matched === null
      ? PASS
      : reject(
          "AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL",
          null,
          CONTEXT_POISONING_ATTACK_ID,
        );
  }
}

function serializeFor(context: RuleContext): string {
  const { content, subject, predicate } = context.candidate;
  return canonicalize({ content, subject, predicate });
}
