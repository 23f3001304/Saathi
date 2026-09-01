import type { Tracer } from "@covenant/domain";

import type {
  ContradictionRule,
  RuleContext,
  RuleOutcome,
  RuleReject,
} from "./rules/contradiction-rule.js";
import { PASS } from "./rules/contradiction-rule.js";

export interface RuleChainOutcome {
  readonly outcome: RuleOutcome;
  /** The id of the rule that decided, for `memory.write.rejected.rule`. */
  readonly rule: string | null;
  /** `T-1` when any rule recognised a poisoning attempt (§9.1 R4). */
  readonly attackId: string | null;
}

/**
 * Runs `ContradictionRule`s in registered order; the **first failure wins**,
 * and the rules are a one-way ratchet — nothing downstream may overturn a
 * rejection (decision 42).
 *
 * DECISION: every applicable rule is evaluated even after one has rejected,
 * rather than short-circuiting. Why: R4 is a labeller (decision 39), and §7.2
 * shows the T-1 write rejected by R1 *and* carrying R4's `attack_id: 'T-1'`.
 * Short-circuiting would keep the block and lose the sentence the audit lane
 * exists to show. The rules are regex and integer comparisons, so the cost of
 * running all five is not measurable next to one SQLite page read.
 */
export class RuleChain {
  constructor(
    private readonly rules: readonly ContradictionRule[],
    private readonly tracer: Tracer,
  ) {}

  run(context: RuleContext): RuleChainOutcome {
    const span = this.tracer.startSpan("memory.rule_chain", {
      "covenant.memory.type": context.candidate.type,
      "covenant.memory.tier": context.grantedTier,
    });
    try {
      const rejections = this.rejectionsIn(context);
      return this.decide(rejections);
    } finally {
      span.setStatus("ok");
      span.end();
    }
  }

  private rejectionsIn(
    context: RuleContext,
  ): readonly { readonly id: string; readonly reject: RuleReject }[] {
    const found: { readonly id: string; readonly reject: RuleReject }[] = [];
    for (const rule of this.rules) {
      if (!rule.appliesTo(context)) {
        continue;
      }
      const outcome = rule.evaluate(context);
      if (outcome.verdict === "reject") {
        found.push({ id: rule.id, reject: outcome });
      }
    }
    return found;
  }

  private decide(
    rejections: readonly { readonly id: string; readonly reject: RuleReject }[],
  ): RuleChainOutcome {
    const attackId =
      rejections.find((entry) => entry.reject.attackId !== null)?.reject
        .attackId ?? null;
    const first = rejections[0];
    if (first === undefined) {
      return { outcome: PASS, rule: null, attackId: null };
    }
    return { outcome: first.reject, rule: first.id, attackId };
  }
}
