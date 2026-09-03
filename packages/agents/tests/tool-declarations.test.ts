// The wire name every adapter declares and reads back: mcp__<server>__<tool>.
// It used to live beside the Agent SDK's hook because that is where the
// convention came from; the SDK is gone and the convention is ours.
import { describe, expect, it } from "vitest";

import {
  BUILTIN_TOOL_SERVER,
  COVENANT_TOOL_DECLARATIONS,
  parseWireToolName,
  wireNameOf,
} from "../src/providers/tool-declarations.js";

describe("parseWireToolName", () => {
  it.each([
    ["mcp__covenant_gateway__verify_cart", "covenant_gateway", "verify_cart"],
    [
      "mcp__covenant_merchant__quote_request",
      "covenant_merchant",
      "quote_request",
    ],
    ["Bash", BUILTIN_TOOL_SERVER, "Bash"],
    ["mcp__srv__a__b", "srv", "a__b"],
  ])("splits %s", (name, server, tool) => {
    expect(parseWireToolName(name)).toEqual({ server, tool });
  });

  it("reads back exactly what wireNameOf wrote, for every declared tool", () => {
    for (const declaration of COVENANT_TOOL_DECLARATIONS) {
      expect(parseWireToolName(wireNameOf(declaration))).toEqual({
        server: declaration.server,
        tool: declaration.tool,
      });
    }
  });
});
