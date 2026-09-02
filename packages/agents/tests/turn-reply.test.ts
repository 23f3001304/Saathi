// The utterance a turn ends up with. One per turn, and on a browse it is the
// sentence written after the shop answered, not the one written before it.
import { describe, expect, it } from "vitest";

import {
  ANSWER_TOOL,
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
} from "../src/buyer/turn-plan.js";
import {
  SessionTurnPlanner,
  TurnPlanCollector,
} from "../src/buyer/turn-planner.js";
import { ScriptedSession, say } from "./doubles.js";
import { RecordingLogger } from "./fakes.js";

/**
 * A browse's `reply` is an argument to the tool that asks the shop, so it is
 * written before the answer. The sentence that knows what was found is the one
 * the model writes after reading the tool result, and it was being thrown
 * away, so a shopper got "I'm checking this shop for 1TB SSDs." and nothing.
 */
describe("the sentence that knows what the shop holds", () => {
  it("prefers what the model said after the count, and says it once", async () => {
    const collector = new TurnPlanCollector();
    await collector.dispatch({
      tool: BROWSE_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { reply: "I am checking this shop.", skus: ["ST-KURTA-NAVY-M"] },
    });
    const planner = new SessionTurnPlanner(
      new ScriptedSession([
        say(
          "I am checking this shop.This shop has no 1TB SSD. Shall I look on the web?",
        ),
      ]),
      collector,
      new RecordingLogger(),
    );
    const plan = await planner.plan(["do you have a 1tb ssd"]);
    expect(plan.reply).toBe(
      "This shop has no 1TB SSD. Shall I look on the web?",
    );
  });

  it("keeps the tool's own reply on every other move", async () => {
    const collector = new TurnPlanCollector();
    await collector.dispatch({
      tool: ANSWER_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { reply: "Hello." },
    });
    const planner = new SessionTurnPlanner(
      new ScriptedSession([say("Hello. And some stray narration.")]),
      collector,
      new RecordingLogger(),
    );
    expect((await planner.plan(["hi"])).reply).toBe("Hello.");
  });
});
