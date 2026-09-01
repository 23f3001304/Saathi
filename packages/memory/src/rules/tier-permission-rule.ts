import {
  tierPermittedForType,
  tierPermittedToSupersede,
} from "@covenant/domain";

import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
} from "./contradiction-rule.js";
import { PASS, reject } from "./contradiction-rule.js";

/**
 * R0, stage 2 of §9.1. A P0 write is *accepted and stored* for `fact` and
 * `episode` — quarantined, and excluded from every action class except `chat`;
 * for `constraint`, `preference` and `procedure` it is rejected outright
 * (§9.2). The tables themselves are `domain`'s, so this rule is the policy
 * statement and never a second copy of the numbers.
 */
export class TierPermissionRule implements ContradictionRule {
  readonly id = "R0.tier-permission";

  appliesTo(): boolean {
    return true;
  }

  evaluate(context: RuleContext): RuleOutcome {
    const { candidate, grantedTier, supersedes } = context;
    if (!tierPermittedForType(candidate.type, grantedTier)) {
      return reject("TYPE_REQUIRES_HIGHER_TIER");
    }
    if (
      supersedes.length > 0 &&
      !tierPermittedToSupersede(candidate.type, grantedTier)
    ) {
      return reject("TYPE_REQUIRES_HIGHER_TIER", supersedes[0]?.id ?? null);
    }
    return PASS;
  }
}
