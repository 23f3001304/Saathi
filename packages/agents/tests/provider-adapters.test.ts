import { describe, expect, it } from "vitest";

import { F2_BLOCK_HUMAN } from "../src/buyer/pre-tool-use-hook.js";
import type { ProviderCase } from "./provider-cases.js";
import {
  bodyAt,
  firstDeclaration,
  GATEWAY_TOOL,
  PROVIDER_CASES,
  runTurn,
  SPOOFED_MONEY_TOOL,
} from "./provider-cases.js";

const cases = PROVIDER_CASES.map(
  (kase) => [kase.id, kase] as readonly [string, ProviderCase],
);

const CATALOG_TOOL = "mcp__covenant_merchant__catalog_search";

const [openAiCase, geminiCase, sarvamCase] = PROVIDER_CASES as readonly [
  ProviderCase,
  ProviderCase,
  ProviderCase,
];

describe.each(cases)("%s adapter tool declarations", (_id, kase) => {
  it("names every covenant tool as mcp__server__tool", async () => {
    const run = await runTurn(kase, [kase.text("nothing to do")]);

    const names = kase.toolNames(bodyAt(run, 0));
    expect(names).toContain(CATALOG_TOOL);
    expect(names).toContain(GATEWAY_TOOL);
    expect(names).toContain("mcp__covenant_gateway__execute_payment");
  });
});

describe.each(cases)("%s adapter money interception", (_id, kase) => {
  it("blocks a money tool off the gateway and feeds the refusal back", async () => {
    const run = await runTurn(kase, [
      kase.call("call_1", SPOOFED_MONEY_TOOL, { amount_paise: 249_900 }),
      kase.text("Understood, I cannot do that."),
    ]);

    expect(run.dispatcher.calls).toEqual([]);
    expect(run.guard.blocked).toHaveLength(1);
    expect(run.sink.kinds()).toEqual(["tool.call.blocked"]);
    // Not silently dropped: the model is told, in its own result channel.
    expect(kase.results(bodyAt(run, 1))).toEqual([
      { id: "call_1", content: F2_BLOCK_HUMAN },
    ]);
  });

  it("allows a gateway-routed money call through to the dispatcher", async () => {
    const run = await runTurn(kase, [
      kase.call("call_2", GATEWAY_TOOL, { cart_mandate_jwt: "jwt" }),
      kase.text("Cart approved."),
    ]);

    expect(run.guard.blocked).toEqual([]);
    expect(run.sink.kinds()).toEqual(["tool.call.allowed"]);
    expect(run.dispatcher.calls).toEqual([
      {
        tool: "verify_cart",
        server: "covenant_gateway",
        args: { cart_mandate_jwt: "jwt" },
      },
    ]);
  });
});

describe.each(cases)("%s adapter tool-result round trip", (_id, kase) => {
  it("returns the result to the model and parses the follow-up turn", async () => {
    const run = await runTurn(kase, [
      kase.call("call_3", GATEWAY_TOOL, { cart_mandate_jwt: "jwt" }),
      kase.text("Cart approved."),
    ]);

    expect(run.bodies).toHaveLength(2);
    expect(kase.results(bodyAt(run, 1))).toEqual([
      { id: "call_3", content: '{"verdict":"approve"}' },
    ]);
    expect(run.turn).toEqual({
      text: "Cart approved.",
      toolRequests: [],
      done: true,
    });
  });
});

describe("openai emits the documented Responses declaration shape", () => {
  it("is flat, carries strict, and drops the $schema key", async () => {
    const run = await runTurn(openAiCase, [{ output: [] }]);

    const declaration = firstDeclaration(run);
    expect(Object.keys(declaration).sort()).toEqual([
      "description",
      "name",
      "parameters",
      "strict",
      "type",
    ]);
    expect(declaration["type"]).toBe("function");
    expect(declaration["parameters"]).toMatchObject({ type: "object" });
    expect(declaration["parameters"]).not.toHaveProperty("$schema");
    expect(bodyAt(run, 0)["store"]).toBe(false);
    expect(run.urls).toEqual(["https://api.openai.com/v1/responses"]);
  });
});

describe("gemini emits the documented Interactions declaration shape", () => {
  it("is flat with no strict, posted to /interactions", async () => {
    const run = await runTurn(geminiCase, [{ steps: [] }]);

    expect(Object.keys(firstDeclaration(run)).sort()).toEqual([
      "description",
      "name",
      "parameters",
      "type",
    ]);
    expect(bodyAt(run, 0)["store"]).toBe(false);
    expect(run.urls).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    ]);
  });
});

describe("sarvam emits the documented Chat Completions shape", () => {
  it("nests the declaration under function, OpenAI-compatible", async () => {
    const run = await runTurn(sarvamCase, [{ choices: [] }]);

    const declaration = firstDeclaration(run);
    expect(Object.keys(declaration).sort()).toEqual(["function", "type"]);
    expect(Object.keys(declaration["function"] as object).sort()).toEqual([
      "description",
      "name",
      "parameters",
    ]);
    expect(run.urls).toEqual(["https://api.sarvam.ai/v1/chat/completions"]);
  });
});
