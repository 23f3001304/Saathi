import type { TimedVerdict } from "@covenant/domain";

import type { DecisionResult } from "./verdict-decision.js";
import type { VerdictDecision } from "./verdict-decision.js";
import type { ContextRequest } from "./verdict-context-builder.js";
import type { VerdictContextBuilder } from "./verdict-context-builder.js";
import type { VerdictContext } from "./verdict-context.js";
import type { VerdictEngine } from "./verdict-engine.js";

export interface PipelineRun {
  readonly context: VerdictContext;
  readonly verdicts: readonly TimedVerdict[];
  readonly result: DecisionResult;
}

/**
 * Build → run → decide, as one synchronous move. Grouping the three keeps the
 * use case honest about §8.3's two phases: *evaluate* is pure and repeatable,
 * so it can be run once on a read snapshot and again inside the write
 * transaction with no side effect either time.
 */
export class VerdictPipeline {
  constructor(
    private readonly builder: VerdictContextBuilder,
    private readonly engine: VerdictEngine,
    private readonly decision: VerdictDecision,
  ) {}

  evaluate(request: ContextRequest): PipelineRun {
    const context = this.builder.build(request);
    const verdicts = this.engine.run(context);
    return { context, verdicts, result: this.decision.of(verdicts) };
  }

  /** Re-aggregates after the commit phase rewrote a seal (§5.2 a, d). */
  decide(verdicts: readonly TimedVerdict[]): DecisionResult {
    return this.decision.of(verdicts);
  }
}
