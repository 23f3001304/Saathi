import type { Clock } from "@covenant/domain";

/**
 * An actual pause between attempts. `Clock` only answers "what time is it"
 * (the determinism seam, §2.0); it has no way to suspend execution, so the
 * wait itself is a second, equally swappable, seam.
 */
export type Sleep = (ms: number) => Promise<void>;

export interface RetryPolicyConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/** §2.5: three attempts, safe because every retried call is receipt-idempotent. */
export const DEFAULT_RETRY_CONFIG: RetryPolicyConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2_000,
};

/**
 * Full jitter (AWS's formula: `random(0, min(cap, base * 2^attempt))`)
 * derived from `nowMs` instead of `Math.random()`: `Clock` is already the
 * codebase's one non-determinism seam (decision 3 of the backend spec), so a
 * `FakeClock` makes retry delays reproducible in tests without a second seam
 * for randomness. Exported as a pure function so the cap growth and the
 * modulus are each directly testable without reaching into `RetryPolicy`.
 */
export function fullJitterDelayMs(
  nowMs: number,
  attemptNo: number,
  config: RetryPolicyConfig,
): number {
  const cap = Math.min(config.maxDelayMs, config.baseDelayMs * 2 ** (attemptNo - 1));
  return nowMs % (cap + 1);
}

/**
 * Exponential backoff with full jitter, retrying only what `isRetryable`
 * approves (network failures and 5xx — never a 4xx, per §2.5). `attempt`
 * receives the 1-based attempt number so callers can log/trace it.
 */
export class RetryPolicy {
  constructor(
    private readonly clock: Clock,
    private readonly sleep: Sleep,
    private readonly config: RetryPolicyConfig = DEFAULT_RETRY_CONFIG,
  ) {}

  async run<T>(
    attempt: (attemptNo: number) => Promise<T>,
    isRetryable: (error: unknown) => boolean,
  ): Promise<T> {
    for (let attemptNo = 1; attemptNo <= this.config.maxAttempts; attemptNo += 1) {
      try {
        return await attempt(attemptNo);
      } catch (error) {
        const isLastAttempt = attemptNo === this.config.maxAttempts;
        if (isLastAttempt || !isRetryable(error)) {
          throw error;
        }
        const delayMs = fullJitterDelayMs(this.clock.now().getTime(), attemptNo, this.config);
        await this.sleep(delayMs);
      }
    }
    // Reachable only if `maxAttempts < 1`, which `DEFAULT_RETRY_CONFIG` never is.
    throw new Error("RetryPolicy misconfigured: maxAttempts must be >= 1");
  }
}
