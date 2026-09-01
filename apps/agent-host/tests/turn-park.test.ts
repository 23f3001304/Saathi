import type { TurnPlan } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { runnerFor } from "./support/turn-harness.js";

describe("a turn that asks does not also act", () => {
  /**
   * The shape the shell enforces, against a plan that asks for the shape it
   * cannot have. `intents`, `buyer` and `gateway` are the forbidden proxies:
   * if any step downstream of the question ran, this throws rather than
   * asserting, which is what makes "nothing below the ask executed" provable.
   */
  it("parks a purchase that still has a question in it", async () => {
    const { runner, hub } = runnerFor({
      action: "draft_intent",
      reply: "A navy kurta under ₹2,000. What size and fit are you after?",
      question: null,
      replies: ["S", "M", "L"],
    } as TurnPlan);
    const result = await runner.run("a navy kurta under 2000, refundable");

    expect(result.status).toBe("answered");
    expect(result.intent).toBeNull();
    const asked = hub
      .snapshot()
      .flatMap((beat) => (beat.kind === "question" ? [beat] : []));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ replies: ["S", "M", "L"] });
  });

});
