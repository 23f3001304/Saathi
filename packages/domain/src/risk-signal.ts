import type { MandateRole } from "./trust-role.js";

/** ACP `{type, score, action}` — schema-exact, no unknown keys (§8.4 check 4). */
export const RISK_SIGNAL_ACTIONS = [
  "blocked",
  "manual_review",
  "authorized",
] as const;

export type RiskSignalAction = (typeof RISK_SIGNAL_ACTIONS)[number];

export interface RiskSignal {
  readonly type: string;
  /** Range invariant: `0 <= score <= 1`; anything else is off-schema. */
  readonly score: number;
  readonly action: RiskSignalAction;
}

export const RISK_SIGNAL_FIELDS: readonly string[] = [
  "type",
  "score",
  "action",
];

export const RISK_SCHEMA_REF = "acp/risk_signals@2026-04-17";

/** Only a trust-ring key in one of these roles may attest risk signals. */
export const RISK_ATTESTATION_ROLES: readonly MandateRole[] = [
  "merchant",
  "gateway",
];

export interface RiskData {
  readonly signals: readonly RiskSignal[];
  /** Compact JWS over `sha256(canonicalize(signals))`. */
  readonly attestation: string;
}

export function isScoreInRange(signal: RiskSignal): boolean {
  return (
    Number.isFinite(signal.score) && signal.score >= 0 && signal.score <= 1
  );
}

export function hasBlockedSignal(data: RiskData): boolean {
  return data.signals.some((signal) => signal.action === "blocked");
}

/**
 * `manual_review` passes the check and turns the verdict into a `hold`, so the
 * audit trail records that a human was asked (§8.4 check 4).
 */
export function hasManualReview(data: RiskData): boolean {
  return data.signals.some((signal) => signal.action === "manual_review");
}

export function blockedSignalTypes(data: RiskData): readonly string[] {
  return data.signals
    .filter((signal) => signal.action === "blocked")
    .map((signal) => signal.type);
}
