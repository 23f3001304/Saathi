import type { MemoryEntry, ReasonCode, Tier } from "@covenant/domain";

import type { MemoryWriteCandidate } from "../write-candidate.js";

/**
 * DECISION: the interface of §2.2 takes one `RuleContext` bundle instead of
 * `appliesTo(candidate)` / `evaluate(candidate, constraints)`. Why: R0 keys on
 * the rows a supersede would touch and R3/R4 key on the *granted* tier, which
 * is stage 1's output and not a field of the candidate — passing them as extra
 * positional arguments would give three rules three different signatures.
 */
export interface RuleContext {
  readonly candidate: MemoryWriteCandidate;
  readonly grantedTier: Tier;
  /** Live P3 constraints for `(tenant, user)` — `idx_memory_constraints`. */
  readonly constraints: readonly MemoryEntry[];
  /** Live rows the guarded UPDATE of §5.2 f would touch; `[]` for episodes. */
  readonly supersedes: readonly MemoryEntry[];
}

export interface RulePass {
  readonly verdict: "pass";
}

export interface RuleReject {
  readonly verdict: "reject";
  readonly reasonCode: ReasonCode;
  readonly constraintId: string | null;
  /** `T-1` when the write is a recognised poisoning attempt (§9.1 R4). */
  readonly attackId: string | null;
}

export type RuleOutcome = RulePass | RuleReject;

export const PASS: RuleOutcome = { verdict: "pass" };

export function reject(
  reasonCode: ReasonCode,
  constraintId: string | null = null,
  attackId: string | null = null,
): RuleOutcome {
  return { verdict: "reject", reasonCode, constraintId, attackId };
}

export interface ContradictionRule {
  /** `R1.numeric-relaxation` — the string the ledger records (§4.4). */
  readonly id: string;
  appliesTo(context: RuleContext): boolean;
  evaluate(context: RuleContext): RuleOutcome;
}
