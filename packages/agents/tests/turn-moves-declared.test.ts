// The moves the model chooses between, and the one rule about all of them:
// none moves money, so the hook lets the choice through and judges what follows.
import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import {
  AMEND_TOOL,
  ANSWER_TOOL,
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
  DECLINE_TOOL,
  PICK_TOOL,
  PROPOSE_TOOL,
  REMEMBER_TOOL,
  WEB_LOOK_TOOL,
} from "../src/buyer/turn-plan.js";
import { TURN_PLAN_TOOLS } from "../src/buyer/turn-plan-tools.js";

describe("the turn tools", () => {
  it("offers the moves and the trait tool, the pick beside the proposal, on the buyer's own server", () => {
    const names = TURN_PLAN_TOOLS.map((tool) => tool.tool);
    for (const move of [
      ANSWER_TOOL,
      BROWSE_TOOL,
      WEB_LOOK_TOOL,
      PROPOSE_TOOL,
      PICK_TOOL,
      AMEND_TOOL,
      DECLINE_TOOL,
      REMEMBER_TOOL,
    ]) {
      expect(names).toContain(move);
    }
    expect(names.indexOf(PICK_TOOL)).toBe(names.indexOf(PROPOSE_TOOL) + 1);
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

/** The shop is the model's own declaration, passed through in the shopper's
 *  characters. The host resolves it to hosts and holds the errand to them; a
 *  shop named in prose and nowhere else holds nothing. */
describe("the shop the web look carries", () => {
  it("is declared beside the query, and is optional", () => {
    const look = TURN_PLAN_TOOLS.find((tool) => tool.tool === WEB_LOOK_TOOL);
    const props = look?.parameters["properties"] as Record<string, unknown>;
    expect(props["shop"]).toMatchObject({
      type: "string",
      maxLength: 60,
      description:
        "The shop the shopper named, as they said it, or leave it out",
    });
    expect(look?.parameters["required"]).not.toContain("shop");
  });
});
