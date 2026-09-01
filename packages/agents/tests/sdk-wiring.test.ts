import type { HookInput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import { PreToolUseHook } from "../src/buyer/pre-tool-use-hook.js";
import {
  DEFAULT_AGENT_MODEL,
  hasApiKey,
  resolveModel,
} from "../src/sdk/model.js";
import {
  buyerHooks,
  parseSdkToolName,
  preToolUseCallback,
} from "../src/sdk/sdk-hooks.js";
import { RecordingLogger, RecordingSink, RecordingTracer } from "./fakes.js";

function hookWith(sink: RecordingSink): PreToolUseHook {
  return new PreToolUseHook(
    new MoneyToolRegistry(),
    sink,
    new RecordingLogger(),
    new RecordingTracer(),
    { tenantId: "tnt_demo", attackId: "T-1" },
  );
}

function preToolUseInput(toolName: string, toolInput: unknown): HookInput {
  return {
    hook_event_name: "PreToolUse",
    session_id: "s1",
    transcript_path: "/tmp/t.jsonl",
    cwd: "/tmp",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "tu_1",
  } as HookInput;
}

describe("parseSdkToolName", () => {
  it.each([
    ["mcp__covenant_gateway__verify_cart", "covenant_gateway", "verify_cart"],
    [
      "mcp__covenant_merchant__quote_request",
      "covenant_merchant",
      "quote_request",
    ],
    ["Bash", "builtin", "Bash"],
    ["mcp__srv__a__b", "srv", "a__b"],
  ])("splits %s", (name, server, tool) => {
    expect(parseSdkToolName(name)).toEqual({ server, tool });
  });
});

describe("PreToolUse hook wired through the SDK hook API", () => {
  it("denies a money tool that does not target the gateway client", async () => {
    const sink = new RecordingSink();
    const callback = preToolUseCallback(hookWith(sink), "txn_1");

    const output = await callback(
      preToolUseInput("mcp__covenant_merchant__execute_payment", {
        amount_paise: 249900,
      }),
    );

    expect(output).toMatchObject({
      decision: "block",
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
      },
    });
    expect(sink.kinds()).toEqual(["tool.call.blocked"]);
    expect(sink.events[0]?.payload).toMatchObject({ attack_id: "T-1" });
  });

  it("lets the gateway client through without granting it a blanket allow", async () => {
    const sink = new RecordingSink();
    const callback = preToolUseCallback(hookWith(sink), "txn_1");

    const output = await callback(
      preToolUseInput("mcp__covenant_gateway__verify_cart", { cart: "x" }),
    );

    expect(output).toEqual({ continue: true });
    expect(sink.kinds()).toEqual(["tool.call.allowed"]);
  });
});

describe("PreToolUse hook fail-closed defaults", () => {
  it("blocks a built-in tool the registry never heard of", async () => {
    const sink = new RecordingSink();
    const callback = preToolUseCallback(hookWith(sink), null);

    const output = await callback(preToolUseInput("Bash", { command: "curl" }));

    expect(output).toMatchObject({ decision: "block" });
  });

  it("ignores events that are not PreToolUse", async () => {
    const sink = new RecordingSink();
    const callback = preToolUseCallback(hookWith(sink), null);

    const output = await callback({
      hook_event_name: "SessionEnd",
      session_id: "s1",
      transcript_path: "/tmp/t.jsonl",
      cwd: "/tmp",
    } as HookInput);

    expect(output).toEqual({ continue: true });
    expect(sink.events).toEqual([]);
  });

  it("registers one unmatched PreToolUse matcher, so nothing slips past", () => {
    const hooks = buyerHooks(hookWith(new RecordingSink()), null);

    expect(Object.keys(hooks)).toEqual(["PreToolUse"]);
    expect(hooks.PreToolUse).toHaveLength(1);
    expect(hooks.PreToolUse?.[0]?.matcher).toBeUndefined();
    expect(hooks.PreToolUse?.[0]?.hooks).toHaveLength(1);
  });
});

describe("model selection", () => {
  it("defaults to the environment's model and honours an override", () => {
    expect(resolveModel({})).toBe(DEFAULT_AGENT_MODEL);
    expect(resolveModel({ COVENANT_AGENT_MODEL: "claude-sonnet-5" })).toBe(
      "claude-sonnet-5",
    );
  });

  it("treats an absent API key as a skip signal, not a failure", () => {
    expect(hasApiKey({})).toBe(false);
    expect(hasApiKey({ ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(hasApiKey({ ANTHROPIC_API_KEY: "sk-ant-x" })).toBe(true);
  });
});
