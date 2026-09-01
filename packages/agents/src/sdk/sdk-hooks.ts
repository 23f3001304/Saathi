import type {
  HookCallbackMatcher,
  HookEvent,
  HookJSONOutput,
  HookInput,
} from "@anthropic-ai/claude-agent-sdk";

import type { PreToolUseHook } from "../buyer/pre-tool-use-hook.js";
import type { ToolArgs, ToolCall } from "../shared/tool-envelope.js";

/** A tool with no MCP prefix comes from the harness itself, not from a server. */
export const BUILTIN_TOOL_SERVER = "builtin";

/**
 * SDK tool names are `mcp__<server>__<tool>`; built-ins are bare. Splitting on
 * the prefix is what lets the registry ask "which server is offering this",
 * which is the question AM2 and F2 both turn on.
 */
export function parseSdkToolName(toolName: string): {
  tool: string;
  server: string;
} {
  const parts = toolName.split("__");
  const [prefix, server] = parts;
  if (parts.length >= 3 && prefix === "mcp" && server !== undefined) {
    return { server, tool: parts.slice(2).join("__") };
  }
  return { server: BUILTIN_TOOL_SERVER, tool: toolName };
}

function argsOf(toolInput: unknown): ToolArgs {
  return typeof toolInput === "object" && toolInput !== null
    ? (toolInput as ToolArgs)
    : {};
}

function callOf(input: HookInput & { hook_event_name: "PreToolUse" }): ToolCall {
  const { tool, server } = parseSdkToolName(input.tool_name);
  return { tool, server, args: argsOf(input.tool_input) };
}

/**
 * Wires the harness hook into the SDK's `PreToolUse` event (verified against
 * `@anthropic-ai/claude-agent-sdk@0.3.251`: `HookCallbackMatcher` is
 * `{matcher?, hooks: HookCallback[], timeout?}`, and a `PreToolUse` denial is
 * `permissionDecision: 'deny'` inside `hookSpecificOutput`).
 *
 * The allow branch deliberately returns no `permissionDecision`: this hook's
 * job is to refuse, not to grant, and an `allow` here would auto-approve
 * everything the registry happens not to call money-affecting.
 */
export function preToolUseCallback(
  hook: PreToolUseHook,
  txnId: string | null,
): (input: HookInput) => Promise<HookJSONOutput> {
  return async (input: HookInput): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }
    const decision = hook.evaluate(callOf(input), txnId);
    if (decision.allowed) {
      return { continue: true };
    }
    const reason = decision.human ?? decision.reason;
    return {
      decision: "block",
      reason,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    };
  };
}

/** The `options.hooks` value: every tool, no matcher, so nothing slips past. */
export function buyerHooks(
  hook: PreToolUseHook,
  txnId: string | null,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [{ hooks: [preToolUseCallback(hook, txnId)] }],
  };
}
