import type { ConfidenceScore } from "./confidence-score.js";
import type { CatalogModel } from "./model-catalog.js";
import type { RoutingAttemptRecord } from "./router-audit.js";

/** The signal that dragged the score down, named so the record says *why*. */
export function weakestOf(score: ConfidenceScore): string {
  const sorted = [...score.components].sort((a, b) => a.value - b.value);
  return sorted[0]?.name ?? "no_signal";
}

export function escalationReasonOf(
  score: ConfidenceScore,
  threshold: number,
): string {
  return (
    `confidence ${score.value.toFixed(2)} < ${threshold.toFixed(2)}, ` +
    `weakest signal ${weakestOf(score)}`
  );
}

export interface AttemptFacts {
  readonly model: CatalogModel;
  readonly score: ConfidenceScore;
  readonly accepted: boolean;
  readonly threshold: number;
  /** `true` when there was no rung left to climb to. */
  readonly last: boolean;
}

export function attemptRecordOf(facts: AttemptFacts): RoutingAttemptRecord {
  const exhausted = facts.last
    ? "ladder exhausted, no rung left to climb"
    : null;
  return {
    provider: facts.model.provider,
    model: facts.model.id,
    source: facts.model.source,
    confidence: facts.score.value,
    components: facts.score.components,
    accepted: facts.accepted,
    escalatedBecause: facts.accepted
      ? null
      : (exhausted ?? escalationReasonOf(facts.score, facts.threshold)),
  };
}
