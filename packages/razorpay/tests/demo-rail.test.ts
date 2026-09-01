// A demo rail is only useful if its failures are as faithful as its
// successes: these lock each scenario to the outcome it advertises.
import { describe, expect, it } from "vitest";
import { Money, type Clock } from "@covenant/domain";
import { DemoRail } from "../src/demo/demo-rail.js";
import {
  DEMO_SCENARIOS,
  SCENARIO_SCRIPTS,
  TEST_MODE_GUIDE,
  type DemoScenario,
} from "../src/demo/demo-scenarios.js";

const clock: Clock = { now: () => new Date("2026-08-31T10:00:00.000Z") };

function railFor(scenario: DemoScenario): DemoRail {
  return new DemoRail(clock, { scenario });
}

async function order(rail: DemoRail): Promise<string> {
  const ref = await rail.createOrder({
    amount: Money.fromPaise(129_900, "INR"),
    receipt: "jti-demo",
    notes: { agent_present: "true" },
  });
  return ref.orderId;
}

/** Polls until the state stops changing, or the cap is hit. */
async function pollUntilStable(
  rail: DemoRail,
  id: string,
  max = 8,
): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < max; i += 1) {
    const snap = await rail.getPayment(id);
    seen.push(snap.state);
    if (seen.length >= 2 && seen[seen.length - 1] === seen[seen.length - 2]) {
      break;
    }
  }
  return seen;
}

describe("DemoRail — outcomes", () => {
  it("announces that it is a demo", () => {
    expect(railFor("captured").label).toContain("no money moves");
  });

  it("captured reaches captured", async () => {
    const rail = railFor("captured");
    const id = await order(rail);
    expect(await pollUntilStable(rail, id)).toContain("captured");
  });

  it("declined ends failed and carries an error code", async () => {
    const rail = railFor("declined");
    const id = await order(rail);
    await rail.getPayment(id);
    const snap = await rail.getPayment(id);
    expect(snap.state).toBe("failed");
    expect(snap.errorCode).toBe("BAD_REQUEST_ERROR");
  });

  it("stalled never reaches a terminal state", async () => {
    const rail = railFor("stalled");
    const id = await order(rail);
    const seen = await pollUntilStable(rail, id, 6);
    expect(seen).not.toContain("captured");
    expect(seen).not.toContain("failed");
  });

  it("network-error refuses at order time rather than inventing one", async () => {
    await expect(order(railFor("network-error"))).rejects.toThrow();
  });
});

describe("demo scenarios", () => {
  it("every scenario carries a narrative worth showing", () => {
    for (const scenario of DEMO_SCENARIOS) {
      expect(SCENARIO_SCRIPTS[scenario].narrative.length).toBeGreaterThan(20);
    }
  });

  it("points at the docs rather than hardcoding card numbers", () => {
    expect(TEST_MODE_GUIDE.docsUrl).toContain("razorpay.com/docs");
    expect(TEST_MODE_GUIDE.otpSucceeds).toContain("4 to 10");
  });
});
