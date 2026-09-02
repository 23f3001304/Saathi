import { describe, expect, it } from "vitest";

import {
  ANSWER_TOOL,
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
  DECLINE_TOOL,
} from "../src/buyer/turn-plan.js";
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";

async function planAfter(tool: string, args: Record<string, unknown>) {
  const collector = new TurnPlanCollector();
  await collector.dispatch({ tool, server: BUYER_TOOL_SERVER, args });
  return collector.take();
}

/**
 * Every conversational turn was printing itself twice, because the model
 * writes its question into `reply` as well as into `question`. The invariant
 * is on the plan, not on whoever renders it: a reply that already asks
 * something is the whole utterance.
 */
describe("one utterance per turn", () => {
  it("drops a question the reply already asked", async () => {
    const plan = await planAfter(ANSWER_TOOL, {
      reply: "Happy to. What size are you after?",
      question: "What size do you wear?",
    });
    expect(plan?.reply).toBe("Happy to. What size are you after?");
    expect(plan?.question).toBeNull();
  });

  it("keeps a question the reply did not ask", async () => {
    const plan = await planAfter(ANSWER_TOOL, {
      reply: "Happy to help.",
      question: "What size do you wear?",
    });
    expect(plan?.question).toBe("What size do you wear?");
  });
});

/**
 * "What shoes do you have" was being answered with a decline. Looking is a
 * move of its own, and it is the one the model should reach for whenever it
 * does not yet know enough — never the refusal.
 */
describe("looking is a move", () => {
  it("records what to show", async () => {
    const plan = await planAfter(BROWSE_TOOL, {
      reply: "Here is what I have.",
      skus: ["ASC-GC9-UK8"],
    });
    expect(plan?.action).toBe("browse");
    expect(plan?.skus).toEqual(["ASC-GC9-UK8"]);
  });

  it("is a different move from refusing", async () => {
    const declined = await planAfter(DECLINE_TOOL, { reply: "No." });
    expect(declined?.action).toBe("decline");
    expect(declined?.query).toBeNull();
  });
});
