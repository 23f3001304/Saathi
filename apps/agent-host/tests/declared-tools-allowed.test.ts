import {
  GATEWAY_MONEY_TOOLS,
  GATEWAY_TOOL_SERVER,
  MoneyToolRegistry,
  NON_MONEY_TOOLS,
} from "@covenant/agents";
import type { ToolDeclaration } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { DEVICE_TOOL_DECLARATIONS } from "../src/purchase/web-device-tools.js";
import { RESEARCH_TOOL_DECLARATIONS } from "../src/purchase/web-research-tools.js";
import { SHARED_TOOL_DECLARATIONS } from "../src/purchase/web-shared-tools.js";
import { WEB_TOOL_DECLARATIONS } from "../src/purchase/web-buy-tools.js";

const DECLARED: readonly ToolDeclaration[] = [
  ...WEB_TOOL_DECLARATIONS,
  ...RESEARCH_TOOL_DECLARATIONS,
  ...SHARED_TOOL_DECLARATIONS,
  ...DEVICE_TOOL_DECLARATIONS,
];

/**
 * `MoneyToolRegistry` fails closed: a tool it has not been told about is a
 * money tool, and `PreToolUseHook` refuses one that did not arrive on the
 * gateway server. That default is right and stays. What it cannot do on its
 * own is notice that a tool was offered to the model and never added to the
 * list, and the failure mode is silent in the worst way - the model is told it
 * has a tool, calls it, and is told the tool moves money.
 *
 * Six tools sat like that: app_state, see_cards, see_profile, ask_shopper,
 * mouse and keyboard. This is the test that would have said so.
 */
describe("every tool this host declares to the model", () => {
  const registry = new MoneyToolRegistry();

  it("is one the hook will actually allow", () => {
    const refused = DECLARED.filter((declaration) => {
      const money = registry.isMoneyAffecting(declaration.tool);
      const viaGateway = registry.targetsGatewayClient({
        tool: declaration.tool,
        server: declaration.server,
        args: {},
      });
      return money && !viaGateway;
    }).map((declaration) => declaration.tool);
    expect(refused).toEqual([]);
  });

  /** The other direction: nothing may be waved through by being listed as
   *  harmless when the gateway is the only place it should be reachable. */
  it("is never a gateway money tool wearing another server's name", () => {
    const smuggled = DECLARED.filter(
      (declaration) =>
        GATEWAY_MONEY_TOOLS.includes(declaration.tool) &&
        declaration.server !== GATEWAY_TOOL_SERVER,
    ).map((declaration) => declaration.tool);
    expect(smuggled).toEqual([]);
  });

  it("does not quietly add a money tool to the harmless list", () => {
    const overlap = GATEWAY_MONEY_TOOLS.filter((tool) =>
      NON_MONEY_TOOLS.includes(tool),
    );
    expect(overlap).toEqual([]);
  });
});
