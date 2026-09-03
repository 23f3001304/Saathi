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
import type { OpenAiSessionConfig } from "./openai-request.js";
import { openAiRequestBody } from "./openai-request.js";
import type { JsonTransport, ProviderHeaders } from "./provider-transport.js";
import { toolRequestOf } from "./tool-declarations.js";
import type { DraftScope, TurnStream } from "./turn-stream.js";
import type { JsonRecord } from "./wire-json.js";
import { asRecord, recordsAt, stringAt, textOfBlocks } from "./wire-json.js";

type OpenAiInputItem = JsonRecord;

/**
 * OpenAI on the **Responses API** (`POST /v1/responses`).
 *
 * DECISION: Responses, not Chat Completions. The current function-calling
 * guide documents the flat `{type, name, description, parameters}` form and
 * `function_call_output` items. What goes on the wire is `openai-request.ts`.
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
      // Function outputs are text-only on this API; a result's picture (the
      // redacted, grid-annotated page shot) rides as the next user item.
      if (result.image !== undefined) {
        this.items.push({
          role: "user",
          content: [
            {
              type: "input_text",
              text: "The annotated screenshot for that call:",
            },
            { type: "input_image", image_url: result.image },
          ],
        });
      }
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
    return openAiRequestBody(this.config, this.items);
  }

  /** Echoes the turn into `items`: a stateless request must carry the
   *  `function_call` its `function_call_output` answers. */
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
