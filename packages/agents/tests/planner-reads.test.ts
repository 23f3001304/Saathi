// The planner's two eyes. A read records nothing and reaches nothing, so the
// hook lets it through and the model may look before it moves.
import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import { PLANNER_READ_TOOLS } from "../src/buyer/planner-reads.js";
import {
  BUYER_TOOL_SERVER,
  SEE_SHELF_TOOL,
  SEE_STATE_TOOL,
} from "../src/buyer/turn-plan.js";
import { TURN_PLAN_TOOLS } from "../src/buyer/turn-plan-tools.js";
import { wireNameOf } from "../src/providers/tool-declarations.js";

describe("the two reads", () => {
  it("are declared on the buyer's own server and take no arguments", () => {
    expect(PLANNER_READ_TOOLS.map((tool) => tool.tool)).toEqual([
      SEE_SHELF_TOOL,
      SEE_STATE_TOOL,
    ]);
    for (const tool of PLANNER_READ_TOOLS) {
      expect(tool.server).toBe(BUYER_TOOL_SERVER);
      expect(tool.parameters).toMatchObject({ type: "object" });
      expect(tool.parameters["required"] ?? []).toEqual([]);
    }
  });

  it("sit beside the moves in the planner's tool list", () => {
    const names = TURN_PLAN_TOOLS.map((tool) => tool.tool);
    expect(names).toContain(SEE_SHELF_TOOL);
    expect(names).toContain(SEE_STATE_TOOL);
  });

  it("are non-money, so the hook lets a look through", () => {
    const registry = new MoneyToolRegistry();
    expect(registry.isMoneyAffecting(SEE_SHELF_TOOL)).toBe(false);
    expect(registry.isMoneyAffecting(SEE_STATE_TOOL)).toBe(false);
  });

  it("reach every provider under the same wire name", () => {
    expect(PLANNER_READ_TOOLS.map(wireNameOf)).toEqual([
      "mcp__covenant_buyer__see_shelf",
      "mcp__covenant_buyer__see_state",
    ]);
  });
});
