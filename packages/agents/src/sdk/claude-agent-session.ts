import type {
  McpServerConfig,
  Options,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";

import type { PreToolUseHook } from "../buyer/pre-tool-use-hook.js";
import type {
  AgentSession,
  AgentTurn,
  AgentTurnInput,
} from "../shared/agent-session.js";
import type { DraftScope } from "../providers/turn-stream.js";
import { SILENT_DRAFT } from "../providers/turn-stream.js";
import type { ClaudeStreamEvent } from "./claude-stream.js";
import { ClaudeStreamReader } from "./claude-stream.js";
import { buyerHooks } from "./sdk-hooks.js";

export interface ClaudeSessionConfig {
  readonly model: string;
  readonly systemPrompt: string;
  readonly allowedTools: readonly string[];
  readonly mcpServers: Record<string, McpServerConfig>;
  readonly maxTurns: number;
  readonly cwd: string;
}

interface TextBlock {
  readonly type: string;
  readonly text?: unknown;
}

function speak(draft: { delta: (text: string) => void }, text: string): void {
  if (text.length > 0) {
    draft.delta(text);
  }
}

function textOf(message: SDKMessage): string {
  if (message.type !== "assistant") {
    return "";
  }
  const blocks = message.message.content as readonly TextBlock[];
  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");
}

/**
 * The real SDK adapter, verified against `@anthropic-ai/claude-agent-sdk`
 * 0.3.251: `query({prompt, options})` returns an async generator of
 * `SDKMessage`, and hooks are `Partial<Record<HookEvent, HookCallbackMatcher[]>>`.
 *
 * DECISION: `AgentTurn.toolRequests` is always empty on this adapter. Why: the
 * SDK runs the tool loop itself, so there is no point at which the harness is
 * handed a pending call to approve — which is exactly why the `PreToolUse`
 * hook exists and why it, not the loop in `BuyerAgent`, is the enforcement
 * point on this path. Both paths call the same `PreToolUseHook` instance, so
 * the block matrix proven in tests is the block matrix that runs live.
 */
export class ClaudeAgentSession implements AgentSession {
  private sessionId: string | null = null;

  constructor(
    private readonly hook: PreToolUseHook,
    private readonly config: ClaudeSessionConfig,
    private readonly txnId: string | null,
    private readonly drafts: DraftScope | null = null,
  ) {}

  async turn(input: AgentTurnInput): Promise<AgentTurn> {
    const prompt = input.userMessage ?? this.resultsAsPrompt(input);
    const chunks: string[] = [];
    const reader = new ClaudeStreamReader();
    const draft = this.drafts?.open() ?? SILENT_DRAFT;
    for await (const message of query({
      prompt,
      options: this.options(),
    })) {
      if (message.type === "stream_event") {
        speak(draft, reader.read(message.event as ClaudeStreamEvent));
      }
      if (message.type === "assistant") {
        this.sessionId = message.session_id;
        chunks.push(textOf(message));
      }
    }
    draft.settle();
    return { text: chunks.join("\n").trim(), toolRequests: [], done: true };
  }

  async close(): Promise<void> {
    this.sessionId = null;
  }

  private resultsAsPrompt(input: AgentTurnInput): string {
    return input.toolResults
      .map((result) => `[tool ${result.toolUseId}] ${result.content}`)
      .join("\n");
  }

  private options(): Options {
    const base: Options = {
      model: this.config.model,
      systemPrompt: this.config.systemPrompt,
      allowedTools: [...this.config.allowedTools],
      mcpServers: this.config.mcpServers,
      hooks: buyerHooks(this.hook, this.txnId),
      maxTurns: this.config.maxTurns,
      permissionMode: "default",
      cwd: this.config.cwd,
      // Asked for only when somebody is watching: with no draft scope the SDK
      // answers exactly as it did before, in whole messages.
      includePartialMessages: this.drafts !== null,
    };
    return this.sessionId === null ? base : { ...base, resume: this.sessionId };
  }
}
