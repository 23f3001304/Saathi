import { describe, expect, it } from "vitest";
import {
  Money,
  type PaymentRail,
  type PaymentSnapshot,
} from "@covenant/domain";
import {
  DEFAULT_POLL_CONFIG,
  pollPaymentOutcome,
} from "../src/payment-poller.js";
import { FakeClock, recordingSleep } from "./fixtures.js";

function snapshot(state: PaymentSnapshot["state"]): PaymentSnapshot {
  return {
    paymentId: "pay_1",
    orderId: "order_1",
    state,
    amount: Money.fromPaise(100, "INR"),
    errorCode: null,
  };
}

function stubRail(states: readonly PaymentSnapshot["state"][]): PaymentRail {
  let index = 0;
  return {
    createOrder: () => Promise.reject(new Error("not used")),
    createPaymentLink: () => Promise.reject(new Error("not used")),
    paymentsForOrder: () => Promise.reject(new Error("not used")),
    getPayment: async () => {
      const state = states[Math.min(index, states.length - 1)];
      index += 1;
      return snapshot(state ?? "created");
    },
  };
}

describe("pollPaymentOutcome cadence", () => {
  it("returns immediately when the first poll is already terminal", async () => {
    const rail = stubRail(["captured"]);
    const seen: PaymentSnapshot[] = [];
    const result = await pollPaymentOutcome(
      rail,
      "pay_1",
      new FakeClock(0, 1),
      recordingSleep([]),
      (s) => seen.push(s),
    );
    expect(result.state).toBe("captured");
    expect(seen).toHaveLength(1);
  });

  it("polls on the configured cadence until a terminal state arrives", async () => {
    const rail = stubRail(["created", "authorized", "captured"]);
    const sleeps: number[] = [];
    const seen: PaymentSnapshot[] = [];
    const result = await pollPaymentOutcome(
      rail,
      "pay_1",
      new FakeClock(0, 1),
      recordingSleep(sleeps),
      (s) => seen.push(s),
      { intervalMs: 3_000, timeoutMs: 300_000 },
    );
    expect(result.state).toBe("captured");
    expect(seen.map((s) => s.state)).toEqual([
      "created",
      "authorized",
      "captured",
    ]);
    expect(sleeps).toEqual([3_000, 3_000]);
  });
});

describe("pollPaymentOutcome terminal-state classification", () => {
  it.each(["captured", "failed", "refunded"] as const)(
    "treats %s as terminal — stops polling immediately",
    async (terminalState) => {
      const rail = stubRail([terminalState]);
      const result = await pollPaymentOutcome(
        rail,
        "pay_1",
        new FakeClock(0, 1),
        recordingSleep([]),
        () => undefined,
      );
      expect(result.state).toBe(terminalState);
    },
  );

  it.each(["created", "authorized"] as const)(
    "does not treat %s as terminal",
    async (nonTerminalState) => {
      const rail = stubRail([nonTerminalState, "captured"]);
      const sleeps: number[] = [];
      await pollPaymentOutcome(
        rail,
        "pay_1",
        new FakeClock(0, 1),
        recordingSleep(sleeps),
        () => undefined,
      );
      expect(sleeps).toHaveLength(1);
    },
  );
});

describe("pollPaymentOutcome timeout and defaults", () => {
  it("gives up at the timeout and returns the last observed snapshot, even if pending", async () => {
    // Clock jumps past the deadline after the very first read.
    const clock = new FakeClock(0, 400_000);
    const rail = stubRail(["created"]);
    const sleeps: number[] = [];
    const result = await pollPaymentOutcome(
      rail,
      "pay_1",
      clock,
      recordingSleep(sleeps),
      () => undefined,
      DEFAULT_POLL_CONFIG,
    );
    expect(result.state).toBe("created");
    expect(sleeps).toEqual([]);
  });

  it("uses the design's default cadence and timeout when no config is given", () => {
    expect(DEFAULT_POLL_CONFIG).toEqual({
      intervalMs: 3_000,
      timeoutMs: 300_000,
    });
  });
});
