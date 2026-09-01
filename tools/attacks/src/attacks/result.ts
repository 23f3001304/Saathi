export interface AttackStep {
  readonly label: string;
  readonly blocked: boolean;
  readonly reasonCode: string | null;
}

export interface AttackResult {
  readonly attackId: string;
  readonly title: string;
  /** `false` means the attack got through: a build failure, not a warning. */
  readonly blocked: boolean;
  readonly steps: readonly AttackStep[];
  readonly ledgerSeq: number | null;
  readonly notes: readonly string[];
}

export function allBlocked(steps: readonly AttackStep[]): boolean {
  return steps.length > 0 && steps.every((step) => step.blocked);
}
