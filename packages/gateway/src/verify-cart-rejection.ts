import type { CooloffToPass, ReasonCode, ToPass } from "@covenant/domain";
import { REASON_HUMAN } from "@covenant/domain";

import type { VerifyCartResponse } from "./schemas/money-routes.js";
import type { PipelineRun } from "./verdict-pipeline.js";

/** The instant `CooloffCheck` computed, read back off its own `to_pass`. */
export function holdUntilOf(run: PipelineRun): string | null {
  if (run.result.decision !== "hold") {
    return null;
  }
  const toPass = run.result.toPass as CooloffToPass | null;
  return toPass?.executes_at ?? null;
}

export interface StageZeroRejection {
  readonly txnId: string;
  readonly reasonCode: ReasonCode;
  readonly toPass: ToPass | null;
}

/**
 * A stage-0 rejection carries **zero** seals (§8.1): the pipeline never ran, so
 * claiming eight seals would be a lie about what was checked. The body is still
 * a 200 verdict body — a credential that does not verify is an answer, not a
 * gateway failure.
 */
export function zeroSealBodyOf(
  rejection: StageZeroRejection,
): VerifyCartResponse {
  return {
    ok: true,
    decision: "reject",
    verdicts: [],
    txn_id: rejection.txnId,
    payment_mandate_jwt: null,
    payment_mandate_draft: null,
    hold: null,
    reason_code: rejection.reasonCode,
    human: REASON_HUMAN[rejection.reasonCode],
    to_pass: rejection.toPass === null ? null : { ...rejection.toPass },
  };
}
