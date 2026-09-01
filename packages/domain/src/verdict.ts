import type { ReasonCode } from "./reason-code.js";
import { REASON_HUMAN } from "./reason-human.js";
import type { ToPass } from "./to-pass.js";

/**
 * The eight checks, in pipeline order (§8.1). The id is a snake_case wire
 * value decoupled from the class name, matching the audit UI's `SealProps`
 * (decision 20).
 */
export const CHECK_IDS = [
  "intent_bounds",
  "nonce",
  "uri_pin",
  "risk_data",
  "memory_digest",
  "quote_match",
  "envelope",
  "cooloff",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

/**
 * Three outcomes, not two (decision 37): a cooling-off hold is neither an
 * approval nor a rejection, and forcing it into a boolean would render the
 * correct user story as a failure.
 */
export const VERDICT_OUTCOMES = ["pass", "hold", "fail"] as const;

export type VerdictOutcome = (typeof VERDICT_OUTCOMES)[number];

export const DECISIONS = ["approve", "hold", "reject"] as const;

export type Decision = (typeof DECISIONS)[number];

/** The two fields the Payment Mandate carries per check (§6.4). */
export interface VerdictSeal {
  readonly check: CheckId;
  readonly outcome: VerdictOutcome;
}

export interface Verdict extends VerdictSeal {
  readonly reason_code: ReasonCode | null;
  readonly human: string | null;
  readonly to_pass: ToPass | null;
}

/** What the engine emits: a check cannot time itself. */
export interface TimedVerdict extends Verdict {
  readonly ms: number;
}

export function pass(check: CheckId): Verdict {
  return {
    check,
    outcome: "pass",
    reason_code: null,
    human: null,
    to_pass: null,
  };
}

export function hold(
  check: CheckId,
  reasonCode: ReasonCode,
  toPass: ToPass | null,
): Verdict {
  return {
    check,
    outcome: "hold",
    reason_code: reasonCode,
    human: REASON_HUMAN[reasonCode],
    to_pass: toPass,
  };
}

export function fail(
  check: CheckId,
  reasonCode: ReasonCode,
  toPass: ToPass | null,
): Verdict {
  return {
    check,
    outcome: "fail",
    reason_code: reasonCode,
    human: REASON_HUMAN[reasonCode],
    to_pass: toPass,
  };
}

export function timed(verdict: Verdict, ms: number): TimedVerdict {
  return { ...verdict, ms };
}

export function sealOf(verdict: Verdict): VerdictSeal {
  return { check: verdict.check, outcome: verdict.outcome };
}

export function checkOrder(check: CheckId): number {
  return CHECK_IDS.indexOf(check);
}

/**
 * The engine never short-circuits (decision 34): eight seals are stamped on
 * every request, so a caller can prove which one broke *and* that the rest
 * still ran.
 */
export function isCompletePipeline(verdicts: readonly Verdict[]): boolean {
  const stamped = new Set(verdicts.map((verdict) => verdict.check));
  return (
    verdicts.length === CHECK_IDS.length && stamped.size === CHECK_IDS.length
  );
}

export function decisionOf(verdicts: readonly Verdict[]): Decision {
  if (verdicts.some((verdict) => verdict.outcome === "fail")) {
    return "reject";
  }
  return verdicts.some((verdict) => verdict.outcome === "hold")
    ? "hold"
    : "approve";
}

/**
 * The first failure in **pipeline** order, never in evaluation order (§8.5):
 * the order in §8.1 is a deliberate narrative and must not depend on timing.
 */
export function headlineReasonCode(
  verdicts: readonly Verdict[],
): ReasonCode | null {
  const decision = decisionOf(verdicts);
  if (decision === "approve") {
    return null;
  }
  const wanted = decision === "reject" ? "fail" : "hold";
  const ordered = [...verdicts].sort(
    (left, right) => checkOrder(left.check) - checkOrder(right.check),
  );
  return (
    ordered.find((verdict) => verdict.outcome === wanted)?.reason_code ?? null
  );
}
