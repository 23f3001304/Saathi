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
import { readOpenAiStream } from "./openai-stream.js";
import type { JsonTransport, ProviderHeaders } from "./provider-transport.js";
import type { ToolDeclaration } from "./tool-declarations.js";
import { toolRequestOf, wireNameOf } from "./tool-declarations.js";
import type { DraftScope, TurnStream } from "./turn-stream.js";
import type { JsonRecord } from "./wire-json.js";
import { asRecord, recordsAt, stringAt, textOfBlocks } from "./wire-json.js";

export interface OpenAiSessionConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDeclaration[];
  readonly maxToolIterations: number;
  /** Reasoning effort. Absent, the API default applies, which for a
   *  reasoning model is far below what it can do. */
  readonly reasoningEffort?: "low" | "medium" | "high";
  /** Provider-hosted tools, sent verbatim beside the function tools; the one
   *  in use is `{type: "web_search"}` for research off the sandbox. */
  readonly hostedTools?: readonly JsonRecord[];
}

type OpenAiInputItem = JsonRecord;

/**
 * OpenAI on the **Responses API** (`POST /v1/responses`).
 *
 * DECISION: Responses, not Chat Completions. The current function-calling
 * guide documents the flat `{type, name, description, parameters}` form and
 * `function_call_output` items; the older nested Chat Completions shape is
 * not wasted — it lives in `chat-completions-session.ts` and Sarvam uses it.
 *
 * DECISION: `store: false` and the full history resent each turn. Server-side
 * conversation retention is not something a payments harness should opt into
 * silently, and a stateless request is the one whose replay is deterministic.
 *
 * DECISION: `strict: false`. Our schemas come from zod, where a nullable int
 * becomes `anyOf`, which OpenAI's strict subset rejects. Argument validity is
 * already enforced where it matters — each tool verifies its own AM2 envelope.
 */
export class OpenAiExchange implements ProviderExchange {
  private items: OpenAiInputItem[] = [];

  constructor(
    private readonly transport: JsonTransport,
    private readonly config: OpenAiSessionConfig,
  ) {}

  appendUser(text: string): void {
    this.items.push({ role: "user", content: text });
  }

  appendToolResults(results: readonly AgentToolResult[]): void {
    for (const result of results) {
      this.items.push({
        type: "function_call_output",
        call_id: result.toolUseId,
        output: result.content,
      });
    }
  }

  async send(): Promise<ProviderReply> {
    const body = await this.transport.post({
      url: this.url(),
      headers: this.headers(),
      body: this.requestBody(),
    });
    return this.readReply(body);
  }

  async sendStreaming(stream: TurnStream): Promise<ProviderReply> {
    const frames = await this.transport.postStream({
      url: this.url(),
      headers: this.headers(),
      body: { ...this.requestBody(), stream: true },
    });
    return this.readReply(await readOpenAiStream(frames, stream));
  }

  private url(): string {
    return `${this.config.baseUrl}/responses`;
  }

  private headers(): ProviderHeaders {
    return { authorization: `Bearer ${this.config.apiKey}` };
  }

  reset(): void {
    this.items = [];
  }

  requestBody(): JsonRecord {
    return {
      model: this.config.model,
      instructions: this.config.systemPrompt,
      input: [...this.items],
      tools: [
        ...(this.config.hostedTools ?? []),
        ...this.config.tools.map(declarationPayload),
      ],
      tool_choice: "auto",
      store: false,
      ...(this.config.reasoningEffort === undefined
        ? {}
        : { reasoning: { effort: this.config.reasoningEffort } }),
    };
  }

  /** Echoes the model's own turn back into `items` before the results land:
   *  a stateless request must carry the `function_call` that a
   *  `function_call_output` answers, or the next call is unanchored. */
  private readReply(body: unknown): ProviderReply {
    const texts: string[] = [];
    const toolRequests: AgentToolRequest[] = [];
    for (const item of recordsAt(asRecord(body) ?? {}, "output")) {
      const type = stringAt(item, "type");
      if (type === "message") {
        this.readMessage(item, texts);
      }
      if (type === "function_call") {
        this.readCall(item, toolRequests);
      }
    }
    return { text: texts.join("").trim(), toolRequests };
  }

  private readMessage(item: JsonRecord, texts: string[]): void {
    const text = textOfBlocks(item, "content", "output_text");
    if (text.length > 0) {
      texts.push(text);
      this.items.push({ role: "assistant", content: text });
    }
  }

  private readCall(item: JsonRecord, requests: AgentToolRequest[]): void {
    const callId = stringAt(item, "call_id");
    const name = stringAt(item, "name");
    if (callId.length === 0 || name.length === 0) {
      return;
    }
    const args = stringAt(item, "arguments");
    this.items.push({
      type: "function_call",
      call_id: callId,
      name,
      arguments: args,
    });
    requests.push(toolRequestOf(name, callId, args));
  }
}

/** The documented Responses tool shape: flat, not nested under `function`. */
function declarationPayload(declaration: ToolDeclaration): JsonRecord {
  return {
    type: "function",
    name: wireNameOf(declaration),
    description: declaration.description,
    parameters: declaration.parameters,
    strict: false,
  };
}

export class OpenAiAgentSession implements AgentSession {
  private readonly exchange: OpenAiExchange;

  constructor(
    private readonly guard: GuardedToolDispatcher,
    transport: JsonTransport,
    private readonly config: OpenAiSessionConfig,
    private readonly drafts: DraftScope | null = null,
  ) {
    this.exchange = new OpenAiExchange(transport, config);
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
