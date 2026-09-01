import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY_CONFIG,
  RetryPolicy,
  fullJitterDelayMs,
} from "../src/retry-policy.js";
import { FakeClock, recordingSleep } from "./fixtures.js";

function attemptsThatFail(times: number, error: unknown): () => Promise<string> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls <= times) {
      throw error;
    }
    return "ok";
  };
}

describe("fullJitterDelayMs", () => {
  it.each([
    [1, 200],
    [2, 400],
    [3, 800],
    [4, 1_600],
  ])("caps attempt %i at baseDelayMs * 2^(attempt-1) = %ims", (attemptNo, cap) => {
    // `nowMs % (cap + 1)`: at nowMs = cap the result is the cap itself (the
    // maximum the formula ever returns); one more and it wraps to zero.
    expect(fullJitterDelayMs(cap, attemptNo, DEFAULT_RETRY_CONFIG)).toBe(cap);
    expect(fullJitterDelayMs(cap + 1, attemptNo, DEFAULT_RETRY_CONFIG)).toBe(0);
  });

  it("never exceeds maxDelayMs even at high attempt numbers", () => {
    const delay = fullJitterDelayMs(Number.MAX_SAFE_INTEGER, 20, DEFAULT_RETRY_CONFIG);
    expect(delay).toBeLessThanOrEqual(DEFAULT_RETRY_CONFIG.maxDelayMs);
  });

  it("is always non-negative", () => {
    expect(fullJitterDelayMs(0, 1, DEFAULT_RETRY_CONFIG)).toBeGreaterThanOrEqual(0);
  });
});

describe("RetryPolicy success paths", () => {
  it("returns the first successful attempt without sleeping", async () => {
    const sleeps: number[] = [];
    const policy = new RetryPolicy(new FakeClock(0), recordingSleep(sleeps));
    const result = await policy.run(async () => "ok", () => true);
    expect(result).toBe("ok");
    expect(sleeps).toEqual([]);
  });

  it("retries a retryable failure up to maxAttempts, then succeeds", async () => {
    const sleeps: number[] = [];
    const policy = new RetryPolicy(new FakeClock(1_000, 500), recordingSleep(sleeps));
    const attempt = attemptsThatFail(2, new Error("transient"));
    const result = await policy.run(attempt, () => true);
    expect(result).toBe("ok");
    expect(sleeps).toHaveLength(2);
  });
});

describe("RetryPolicy exhaustion and non-retryable failures", () => {
  it("throws the original error after exhausting maxAttempts", async () => {
    const policy = new RetryPolicy(new FakeClock(0, 100), recordingSleep([]));
    const error = new Error("always fails");
    const attempt = attemptsThatFail(DEFAULT_RETRY_CONFIG.maxAttempts, error);
    await expect(policy.run(attempt, () => true)).rejects.toBe(error);
  });

  it("does not retry when isRetryable says no, even on the first attempt", async () => {
    const sleeps: number[] = [];
    const policy = new RetryPolicy(new FakeClock(0), recordingSleep(sleeps));
    let calls = 0;
    const attempt = async () => {
      calls += 1;
      throw new Error("non-retryable");
    };
    await expect(policy.run(attempt, () => false)).rejects.toThrow("non-retryable");
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("calls attempt exactly maxAttempts times, never more, on persistent retryable failure", async () => {
    let calls = 0;
    const policy = new RetryPolicy(new FakeClock(0, 50), recordingSleep([]));
    const attempt = async () => {
      calls += 1;
      throw new Error("still failing");
    };
    await expect(policy.run(attempt, () => true)).rejects.toThrow("still failing");
    expect(calls).toBe(DEFAULT_RETRY_CONFIG.maxAttempts);
  });
});
