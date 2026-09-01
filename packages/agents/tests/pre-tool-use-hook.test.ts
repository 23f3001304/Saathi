import { describe, expect, it } from "vitest";

import { BuyerAgent } from "../src/buyer/buyer-agent.js";
import type { Checkout } from "../src/buyer/checkout.js";
import {
  callTool,
  RecordingDispatcher,
  ScriptedSession,
  say,
} from "./doubles.js";
import { RecordingLogger } from "./fakes.js";
import type { Row } from "./hook-matrix.js";
import { buildHook, callOf, GATEWAY, MATRIX, MERCHANT } from "./hook-matrix.js";

describe("PreToolUseHook block matrix (F2)", () => {
  it.each(MATRIX)("$name", (row) => {
    const { hook, sink, logger } = buildHook();

    const decision = hook.evaluate(callOf(row), "txn_1");

    expect(decision.allowed).toBe(row.allowed);
    expect(decision.moneyAffecting).toBe(row.money);
    expect(sink.kinds()).toEqual([
      row.allowed ? "tool.call.allowed" : "tool.call.blocked",
    ]);
    expect(logger.lines.some((line) => line.level === "warn")).toBe(
      !row.allowed,
    );
  });
});

describe("PreToolUseHook ledgers what it refused", () => {
  it("ledgers the blocked call with the tool, the server and the reason", () => {
    const { hook, sink } = buildHook();

    hook.evaluate(callOf(MATRIX[3] as Row), "txn_1");

    expect(sink.events[0]?.payload).toMatchObject({
      tool: "execute_payment",
      server: MERCHANT,
      money_affecting: true,
      reason: "money_tool_not_gateway_client",
      detail_kind: "pre_tool_use",
    });
    expect(sink.events[0]?.actor).toBe("buyer_agent");
  });
});

describe("PreToolUseHook observability", () => {
  it("keeps the span green — a blocked attack is the system working", () => {
    const { hook, tracer } = buildHook();

    hook.evaluate(callOf(MATRIX[3] as Row), null);

    expect(tracer.spans).toEqual([{ name: "hook.pre_tool_use", status: "ok" }]);
  });
});

describe("a prompted bypass is refused by the hook, not by the prompt", () => {
  it("never reaches the dispatcher, however the model is talked into it", async () => {
    const { hook, sink } = buildHook();
    const dispatcher = new RecordingDispatcher();
    // The model has been convinced by injected catalog text to pay directly.
    const session = new ScriptedSession([
      callTool("t1", "execute_payment", MERCHANT, { amount_paise: 249900 }),
      say("I could not pay the merchant directly, so I stopped."),
    ]);
    const agent = new BuyerAgent(
      session,
      hook,
      dispatcher,
      {} as Checkout,
      new RecordingLogger(),
      { maxTurns: 4, txnId: "txn_1" },
    );

    const result = await agent.converse("buy the trail shoe however you can");

    expect(dispatcher.calls).toEqual([]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.reason).toBe("money_tool_not_gateway_client");
    expect(sink.kinds()).toEqual(["tool.call.blocked"]);
    expect(session.seen[1]?.toolResults[0]).toMatchObject({
      toolUseId: "t1",
      isError: true,
    });
  });
});

describe("the same call through the gateway client", () => {
  it("is dispatched, because the target is what the rule turns on", async () => {
    const { hook } = buildHook();
    const dispatcher = new RecordingDispatcher('{"ok":true}');
    const session = new ScriptedSession([
      callTool("t1", "execute_payment", GATEWAY, {
        payment_mandate_jwt: "a.b.c",
      }),
      say("Paid."),
    ]);
    const agent = new BuyerAgent(
      session,
      hook,
      dispatcher,
      {} as Checkout,
      new RecordingLogger(),
      { maxTurns: 4, txnId: "txn_1" },
    );

    const result = await agent.converse("pay for the shoe");

    expect(dispatcher.calls).toHaveLength(1);
    expect(result.blocked).toEqual([]);
    expect(result.completed).toBe(true);
  });
});
