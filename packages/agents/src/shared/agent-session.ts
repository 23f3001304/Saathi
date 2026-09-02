import type { ToolArgs, ToolCall } from "./tool-envelope.js";

export interface AgentToolRequest {
  readonly toolUseId: string;
  readonly tool: string;
  readonly server: string;
  readonly args: ToolArgs;
}

export interface AgentToolResult {
  readonly toolUseId: string;
  readonly content: string;
  readonly isError: boolean;
  /** See `ToolOutcome.terminal`. Absent means an ordinary result. */
  readonly terminal?: boolean;
  /** See `ToolOutcome.image`. */
  readonly image?: string;
}

export interface AgentTurnInput {
  readonly userMessage: string | null;
  readonly toolResults: readonly AgentToolResult[];
  /**
   * The shopper's own words, when `userMessage` wraps them in instructions.
   * Routing classifies this rather than the whole message: `TURN_PLAN_PROMPT`
   * says "purchase" seven times, so every greeting classified as `money` and
   * bought a self-consistency sample it did not need. Instructions are ours,
   * the request is data — the separation this system insists on everywhere.
   */
  readonly subject?: string;
}

export interface AgentTurn {
  readonly text: string;
  readonly toolRequests: readonly AgentToolRequest[];
  /** `true` when the model produced a final answer and asked for no tools. */
  readonly done: boolean;
}

/**
 * DECISION: the agent loop sits behind this port rather than calling the
 * Claude Agent SDK directly. Why: the SDK's `query()` spawns a session that
 * needs credentials and a network, so a test of the negotiation logic would
 * become a test of the model. The SDK adapter lives in `src/sdk` and is
 * smoke-tested only when `ANTHROPIC_API_KEY` is present; every rule in this
 * package is tested against a scripted session instead.
 *
 * The port deliberately does not expose a "run to completion" method: the
 * caller must see each tool request, because that is where `PreToolUseHook`
 * gets to say no.
 */
export interface AgentSession {
  turn(input: AgentTurnInput): Promise<AgentTurn>;
  close(): Promise<void>;
}

export interface ToolOutcome {
  readonly content: string;
  readonly isError: boolean;
  /** A picture riding beside the text result - the annotated page shot a
   *  glance returns. Providers that can carry images attach it to the next
   *  request as user content; the rest ignore it. Always already redacted. */
  readonly image?: string;
  /**
   * A failure asking again cannot fix — this shelf does not carry that SKU,
   * this session has had its quotes. Optional, so a tool that has no such
   * distinction says nothing and behaves exactly as before.
   *
   * It exists because a retryable failure and a structural one were the same
   * tool error: the model asked for a listing that was not there, was told
   * "no", and asked fifteen more times, rewriting its sentence each round
   * until the iteration budget ran out. The shopper saw a bubble rewrite
   * itself and no card at all.
   */
  readonly terminal?: boolean;
}

/** What actually runs an allowed tool call. */
export interface ToolDispatcher {
  dispatch(call: ToolCall): Promise<ToolOutcome>;
}

export function toolCallOf(request: AgentToolRequest): ToolCall {
  return {
    tool: request.tool,
    server: request.server,
    args: request.args,
  };
}
