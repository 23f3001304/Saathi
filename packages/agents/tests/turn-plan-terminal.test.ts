import { describe, expect, it } from "vitest";

import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import {
  ANSWER_TOOL,
  BROWSE_TOOL,
  SEE_SHELF_TOOL,
  REMEMBER_TOOL,
} from "../src/buyer/turn-plan.js";
import { BUYER_TOOL_SERVER } from "../src/buyer/turn-plan-declare.js";

function call(tool: string, args: Record<string, unknown> = {}) {
  return { tool, server: BUYER_TOOL_SERVER, args };
}

/**
 * The planner's contract is "pick one move for this turn", so a recorded move
 * ends the turn. It did not say so, and the loop in `runGuardedTurn` only
 * stops on a terminal result or a repeat - so the model read "recorded", was
 * not told the turn was over, and helpfully rewrote its question. Because it
 * reworded each time, RepeatGuard saw no repeat and it ran the whole iteration
 * budget: fifteen versions of the same sentence, and the shopper was asked
 * none of them.
 */
describe("choosing a move", () => {
  it("ends the turn", async () => {
    const collector = new TurnPlanCollector();
    const outcome = await collector.dispatch(
      call(ANSWER_TOOL, { reply: "Which capacity?", question: "Which?" }),
    );
    expect(outcome.isError).toBe(false);
    expect(outcome.terminal).toBe(true);
  });

  it("ends it whichever move was chosen", async () => {
    const collector = new TurnPlanCollector();
    const outcome = await collector.dispatch(
      call(BROWSE_TOOL, { reply: "Here you go", skus: ["item_1"] }),
    );
    expect(outcome.terminal).toBe(true);
  });
});

describe("everything that is not a move", () => {
  /** A read is how the model decides WHICH move to make; ending the turn on
   *  one would leave it having looked and done nothing. */
  it("leaves the turn running so the model can still move", async () => {
    const collector = new TurnPlanCollector();
    const read = await collector.dispatch(call(SEE_SHELF_TOOL));
    expect(read.terminal).toBeUndefined();
    const trait = await collector.dispatch(
      call(REMEMBER_TOOL, { trait: "size", value: "M" }),
    );
    expect(trait.terminal).toBeUndefined();
  });

  it("does not end the turn when the move was refused", async () => {
    const collector = new TurnPlanCollector();
    const outcome = await collector.dispatch(call("not_a_move"));
    expect(outcome.isError).toBe(true);
    expect(outcome.terminal).toBeUndefined();
  });
});
