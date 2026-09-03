// A turn can run out of steps having recorded nothing but a trait, and a trait
// is not a move. Reading the collector first, the planner found a plan there,
// skipped the wrap-up, and put the half-written sentence the model was cut off
// in on screen as the reply.
import { describe, expect, it } from "vitest";

import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import { BUYER_TOOL_SERVER, REMEMBER_TOOL } from "../src/buyer/turn-plan.js";
import { SessionTurnPlanner, WRAP_UP_NOTE } from "../src/buyer/turn-planner.js";
import { RecordingLogger } from "./fakes.js";

const FRAGMENT = "There's a navy kurta at 1,8";

const WRAPPED = "I was still comparing two kurtas; give me one more go.";

const HEARD = { key: "shoe_size", value: "UK 8" };

/** Spends its budget mid-sentence with only a `remember_trait` behind it; the
 *  wrap-up turn after it answers in one line, as a real session's does. */
class HeardOnlyATrait {
  readonly asked: string[] = [];

  constructor(private readonly collector: TurnPlanCollector) {}

  async turn(input: { userMessage: string | null }) {
    this.asked.push(input.userMessage ?? "");
    if (this.asked.length > 1) {
      return { text: WRAPPED, toolRequests: [], done: true };
    }
    await this.collector.dispatch({
      tool: REMEMBER_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { ...HEARD },
    });
    return { text: FRAGMENT, toolRequests: [], done: false };
  }

  close() {
    return Promise.resolve();
  }
}

describe("a cut-off turn that had heard something and moved nowhere", () => {
  it("says the wrap-up rather than the fragment, and keeps the trait", async () => {
    const collector = new TurnPlanCollector();
    const session = new HeardOnlyATrait(collector);
    const planner = new SessionTurnPlanner(
      session,
      collector,
      new RecordingLogger(),
    );

    const plan = await planner.plan(["a navy kurta under 2000"]);

    expect(session.asked[1]).toBe(WRAP_UP_NOTE);
    expect(plan.reply).toBe(WRAPPED);
    expect(plan.action).toBe("answer");
    expect(plan.traits).toEqual([HEARD]);
  });
});
