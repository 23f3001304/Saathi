import type {
  Decision,
  ReasonCode,
  ToPass,
  Verdict,
  VerdictOutcome,
  VerdictSeal,
} from "@covenant/domain";
import {
  checkOrder,
  decisionOf,
  headlineReasonCode,
  isCompletePipeline,
  sealOf,
} from "@covenant/domain";

export interface DecisionResult {
  readonly decision: Decision;
  readonly reasonCode: ReasonCode | null;
  readonly human: string | null;
  readonly toPass: ToPass | null;
  /** The two fields per check that the Payment Mandate carries (§6.4). */
  readonly seals: readonly VerdictSeal[];
  readonly complete: boolean;
}

const OUTCOME_SOUGHT: Record<Decision, VerdictOutcome | null> = {
  reject: "fail",
  hold: "hold",
  approve: null,
};

/**
 * Aggregates verdicts into `approve | hold | reject` and selects the headline.
 *
 * Both rules are **delegated to `domain/verdict`** (deviation D3): `decisionOf`
 * owns the fail > hold > pass precedence and `headlineReasonCode` owns "first
 * failure in *pipeline* order, not in evaluation order". The pipeline order of
 * §8.1 is a deliberate narrative — bounds first, because "you asked for a
 * ₹2,000 shoe" is the sentence a human understands — and it must not depend on
 * evaluation timing, so this class re-derives nothing.
 */
export class VerdictDecision {
  of(verdicts: readonly Verdict[]): DecisionResult {
    const decision = decisionOf(verdicts);
    const headline = this.headlineVerdict(verdicts, decision);
    return {
      decision,
      reasonCode: headlineReasonCode(verdicts),
      human: headline?.human ?? null,
      toPass: headline?.to_pass ?? null,
      seals: verdicts.map(sealOf),
      complete: isCompletePipeline(verdicts),
    };
  }

  private headlineVerdict(
    verdicts: readonly Verdict[],
    decision: Decision,
  ): Verdict | null {
    const wanted = OUTCOME_SOUGHT[decision];
    if (wanted === null) {
      return null;
    }
    return (
      [...verdicts]
        .sort((left, right) => checkOrder(left.check) - checkOrder(right.check))
        .find((verdict) => verdict.outcome === wanted) ?? null
    );
  }
}
