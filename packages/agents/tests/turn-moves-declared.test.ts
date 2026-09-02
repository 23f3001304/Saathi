// The six moves the model chooses between, and the one rule about all of them:
// none moves money, so the hook lets the choice through and judges what follows.
import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import {
  AMEND_TOOL,
  ANSWER_TOOL,
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
  DECLINE_TOOL,
  PROPOSE_TOOL,
  REMEMBER_TOOL,
  SEE_SHELF_TOOL,
  SEE_STATE_TOOL,
  WEB_LOOK_TOOL,
} from "../src/buyer/turn-plan.js";
import { TURN_PLAN_TOOLS } from "../src/buyer/turn-plan-tools.js";

describe("the turn tools", () => {
  it("offers the six moves, the trait tool and the two reads, on the buyer's own server", () => {
    expect(TURN_PLAN_TOOLS.map((tool) => tool.tool)).toEqual([
      ANSWER_TOOL,
      BROWSE_TOOL,
      WEB_LOOK_TOOL,
      PROPOSE_TOOL,
      AMEND_TOOL,
      DECLINE_TOOL,
      REMEMBER_TOOL,
      SEE_SHELF_TOOL,
      SEE_STATE_TOOL,
    ]);
    expect(
      TURN_PLAN_TOOLS.every((tool) => tool.server === BUYER_TOOL_SERVER),
    ).toBe(true);
  });

  it("declares them non-money, so the hook lets the choice through", () => {
    const registry = new MoneyToolRegistry();
    for (const tool of TURN_PLAN_TOOLS) {
      expect(registry.isMoneyAffecting(tool.tool)).toBe(false);
    }
  });

  it("still refuses a money tool asked for on the buyer's server", () => {
    const registry = new MoneyToolRegistry();
    expect(registry.isMoneyAffecting("execute_payment")).toBe(true);
    expect(
      registry.targetsGatewayClient({
        tool: "execute_payment",
        server: BUYER_TOOL_SERVER,
        args: {},
      }),
    ).toBe(false);
  });
});
