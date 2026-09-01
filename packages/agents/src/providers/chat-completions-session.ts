import type {
  AgentSession,
  AgentToolRequest,
  AgentToolResult,
  AgentTurn,
  AgentTurnInput,
} from "../shared/agent-session.js";
import type { GuardedToolDispatcher } from "./guarded-tool-dispatcher.js";
import type { ProviderExchange, ProviderReply } from "./provider-turn-loop.js";
import {
  DEFAULT_MAX_TOOL_ITERATIONS,
  runGuardedTurn,
} from "./provider-turn-loop.js";
import { readChatCompletionsStream } from "./chat-completions-stream.js";
import type { JsonTransport, ProviderHeaders } from "./provider-transport.js";
import type { ToolDeclaration } from "./tool-declarations.js";
import { toolRequestOf, wireNameOf } from "./tool-declarations.js";
import type { DraftScope, TurnStream } from "./turn-stream.js";
import type { JsonRecord } from "./wire-json.js";
import { asRecord, recordsAt, stringAt } from "./wire-json.js";

export interface ChatCompletionsConfig {
  /** Origin plus version prefix, e.g. `https://api.sarvam.ai/v1`. */
  readonly baseUrl: string;
  readonly model: string;
  readonly systemPrompt: string;
  /** Auth included: vendors differ on the header, not on the body. */
  readonly headers: ProviderHeaders;
  readonly tools: readonly ToolDeclaration[];
  readonly maxToolIterations: number;
}

/**
 * The OpenAI-compatible `POST /chat/completions` surface, as its own class
 * rather than as Sarvam-specific code. Sarvam documents this exact contract —
 * nested `{type:"function", function:{...}}` declarations, `tool_calls` on the
 * assistant message with `arguments` as a JSON *string*, and results returned
 * as `{role:"tool", tool_call_id, content}` — so pointing this class at a
 * different base URL and auth header is the whole of adding such a vendor.
 */
export class ChatCompletionsExchange implements ProviderExchange {
  private messages: JsonRecord[] = [];

  constructor(
    private readonly transport: JsonTransport,
    private readonly config: ChatCompletionsConfig,
  ) {
    this.reset();
  }

  appendUser(text: string): void {
    this.messages.push({ role: "user", content: text });
  }

  appendToolResults(results: readonly AgentToolResult[]): void {
    for (const result of results) {
      this.messages.push({
        role: "tool",
        tool_call_id: result.toolUseId,
        content: result.content,
      });
    }
  }

  async send(): Promise<ProviderReply> {
    const body = await this.transport.post({
      url: this.url(),
      headers: this.config.headers,
      body: this.requestBody(),
    });
    return this.readReply(body);
  }

  async sendStreaming(stream: TurnStream): Promise<ProviderReply> {
    const frames = await this.transport.postStream({
      url: this.url(),
      headers: this.config.headers,
      body: { ...this.requestBody(), stream: true },
    });
    return this.readReply(await readChatCompletionsStream(frames, stream));
  }

  private url(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  reset(): void {
    this.messages = [{ role: "system", content: this.config.systemPrompt }];
  }

  requestBody(): JsonRecord {
    const tools = this.config.tools.map(declarationPayload);
    return {
      model: this.config.model,
      messages: [...this.messages],
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      stream: false,
    };
  }

  private readReply(body: unknown): ProviderReply {
    const choices = recordsAt(asRecord(body) ?? {}, "choices");
    const message =
      choices.length > 0 ? asRecord(choices[0]?.["message"]) : null;
    if (message === null) {
      return { text: "", toolRequests: [] };
    }
    const text = stringAt(message, "content");
    const toolRequests = this.readCalls(message);
    // The assistant turn is echoed verbatim: a `role:"tool"` message is only
    // legal as an answer to a `tool_calls` entry the model can still see.
    this.messages.push(assistantMessage(text, message));
    return { text: text.trim(), toolRequests };
  }

  private readCalls(message: JsonRecord): readonly AgentToolRequest[] {
    const requests: AgentToolRequest[] = [];
    for (const call of recordsAt(message, "tool_calls")) {
      const id = stringAt(call, "id");
      const fn = asRecord(call["function"]);
      const name = fn === null ? "" : stringAt(fn, "name");
      if (id.length === 0 || name.length === 0 || fn === null) {
        continue;
      }
      requests.push(toolRequestOf(name, id, stringAt(fn, "arguments")));
    }
    return requests;
  }
}

function assistantMessage(text: string, message: JsonRecord): JsonRecord {
  const calls = message["tool_calls"];
  return {
    role: "assistant",
    content: text.length > 0 ? text : null,
    ...(Array.isArray(calls) ? { tool_calls: calls } : {}),
  };
}

/** Chat Completions nests the declaration under `function`. */
function declarationPayload(declaration: ToolDeclaration): JsonRecord {
  return {
    type: "function",
    function: {
      name: wireNameOf(declaration),
      description: declaration.description,
      parameters: declaration.parameters,
    },
  };
}

export class ChatCompletionsAgentSession implements AgentSession {
  private readonly exchange: ChatCompletionsExchange;

  constructor(
    private readonly guard: GuardedToolDispatcher,
    transport: JsonTransport,
    private readonly config: ChatCompletionsConfig,
    private readonly drafts: DraftScope | null = null,
  ) {
    this.exchange = new ChatCompletionsExchange(transport, config);
  }

  turn(input: AgentTurnInput): Promise<AgentTurn> {
    return runGuardedTurn(
      this.exchange,
      this.guard,
      input,
      this.config.maxToolIterations || DEFAULT_MAX_TOOL_ITERATIONS,
      this.drafts,
    );
  }

  async close(): Promise<void> {
    this.exchange.reset();
  }
}
