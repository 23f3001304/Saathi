// `verdict.emitted` arrives in two shapes and the UI must survive both.
//
// The fixtures in `ledger/fixtures/**` carry §4.2's documented view shape
// (`checks[]` with a boolean `passed`). A live gateway carries its own ledger
// record instead — `{ decision, reason_code, verdicts: [{ check, outcome }],
// to_pass }`, where `outcome` is the three-valued `pass | hold | fail` that
// exists precisely so a cooling-off hold is not forced into a boolean.
//
// Reading `payload.checks.length` on the live shape threw, which took the
// whole Bench down the moment a real verdict landed. Normalising here — once,
// at the reducer boundary, trusting nothing on the wire — is the fix.
import type {
  SealCheck,
  Stage0Rejection,
  ToPass,
  VerdictCheckResult,
} from "./types.ts";

export interface NormalizedVerdict {
  checks: VerdictCheckResult[];
  latencyMs?: number;
  stage0?: Stage0Rejection;
}

interface LiveSeal {
  check?: unknown;
  outcome?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * A `hold` is not a pass and not a failure. It is carried as `passed` (so the
 * strip never paints it red) plus `held`, which is what actually selects D7's
 * countdown — the seal no longer has to wait for a `cooloff.parked` frame to
 * stop looking like an approval.
 */
function sealOf(raw: LiveSeal, toPass: ToPass | undefined): VerdictCheckResult {
  const outcome = stringOr(raw.outcome, "fail");
  return {
    check: stringOr(raw.check, "intent_bounds") as SealCheck,
    passed: outcome !== "fail",
    held: outcome === "hold",
    ...(outcome === "fail" && toPass !== undefined ? { to_pass: toPass } : {}),
  };
}

function fromLive(payload: Record<string, unknown>): NormalizedVerdict | null {
  const verdicts = payload["verdicts"];
  if (!Array.isArray(verdicts)) return null;
  const toPass = record(payload["to_pass"]) as ToPass | null;
  const reason = payload["reason_code"];
  const checks = verdicts.map((seal) =>
    sealOf((record(seal) ?? {}) as LiveSeal, toPass ?? undefined),
  );
  if (checks.length > 0) return { checks };
  // Stage 0: admission refused before a single seal was stamped.
  return {
    checks: [],
    stage0: {
      reason_code: stringOr(reason, "REJECTED"),
      ...(toPass === null ? {} : { to_pass: toPass }),
    },
  };
}

function fromView(payload: Record<string, unknown>): NormalizedVerdict | null {
  const checks = payload["checks"];
  if (!Array.isArray(checks)) return null;
  const latency = payload["latency_ms"];
  const stage0 = record(payload["stage0_rejection"]);
  return {
    checks: checks as VerdictCheckResult[],
    ...(typeof latency === "number" ? { latencyMs: latency } : {}),
    ...(stage0 === null
      ? {}
      : { stage0: stage0 as unknown as Stage0Rejection }),
  };
}

/** Never throws: an unreadable payload is an empty verdict, not a crash. */
export function normalizeVerdict(payload: unknown): NormalizedVerdict {
  const body = record(payload);
  if (body === null) return { checks: [] };
  return fromView(body) ?? fromLive(body) ?? { checks: [] };
}
