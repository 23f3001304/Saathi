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
import type { JsonTransport } from "./provider-transport.js";
import type { ToolDeclaration } from "./tool-declarations.js";
import { toolRequestOf, wireNameOf } from "./tool-declarations.js";
import type { JsonRecord } from "./wire-json.js";
import { asRecord, recordsAt, stringAt, textOfBlocks } from "./wire-json.js";

/** Pinned so a server-side revision bump cannot silently reshape the wire. */
export const GEMINI_API_REVISION = "2026-05-20";

export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiSessionConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDeclaration[];
  readonly maxToolIterations: number;
}

function textStep(type: string, text: string): JsonRecord {
  return { type, content: [{ type: "text", text }] };
}

/**
 * Google Gemini on the **Interactions API**
 * (`POST /v1beta/interactions`), which is what the current function-calling
 * docs document — not the older `models/<model>:generateContent`.
 *
 * DECISION: stateless. `store: false` with the full step history resent each
 * turn, rather than `previous_interaction_id`. Same reasoning as the OpenAI
 * adapter: a payments harness should not opt into server-side conversation
 * retention by default, and a stateless request replays deterministically.
 *
 * DECISION: the reply reader accepts `steps` (the API reference's field) and
 * falls back to `output`, and to a top-level `output_text`. The guide and the
 * reference describe the same payload at different depths; reading both costs
 * four lines and removes a whole class of "worked in the doc, not on the wire".
 */
export class GeminiExchange implements ProviderExchange {
  private steps: JsonRecord[] = [];
  private readonly callNames = new Map<string, string>();

  constructor(
    private readonly transport: JsonTransport,
    private readonly config: GeminiSessionConfig,
  ) {}

  appendUser(text: string): void {
    this.steps.push(textStep("user_input", text));
  }

  appendToolResults(results: readonly AgentToolResult[]): void {
    for (const result of results) {
      this.steps.push({
        type: "function_result",
        name: this.callNames.get(result.toolUseId) ?? "",
        call_id: result.toolUseId,
        result: [{ type: "text", text: result.content }],
      });
    }
  }

  async send(): Promise<ProviderReply> {
    const body = await this.transport.post({
      url: `${this.config.baseUrl}/interactions`,
      headers: {
        "x-goog-api-key": this.config.apiKey,
        "Api-Revision": GEMINI_API_REVISION,
      },
      body: this.requestBody(),
    });
    return this.readReply(body);
  }

  reset(): void {
    this.steps = [];
    this.callNames.clear();
  }

  requestBody(): JsonRecord {
    return {
      model: this.config.model,
      system_instruction: this.config.systemPrompt,
      input: [...this.steps],
      tools: this.config.tools.map(declarationPayload),
      store: false,
    };
  }

  private readReply(body: unknown): ProviderReply {
    const root = asRecord(body) ?? {};
    const steps = stepsOf(root);
    const texts: string[] = [];
    const toolRequests: AgentToolRequest[] = [];
    for (const step of steps) {
      const type = stringAt(step, "type");
      if (type === "model_output") {
        this.readOutput(step, texts);
      }
      if (type === "function_call") {
        this.readCall(step, toolRequests);
      }
    }
    const fallback = texts.length === 0 ? stringAt(root, "output_text") : "";
    return { text: [...texts, fallback].join("").trim(), toolRequests };
  }

  private readOutput(step: JsonRecord, texts: string[]): void {
    const text = textOfBlocks(step, "content", "text");
    if (text.length > 0) {
      texts.push(text);
      this.steps.push(textStep("model_output", text));
    }
  }

  private readCall(step: JsonRecord, requests: AgentToolRequest[]): void {
    const id = stringAt(step, "id");
    const name = stringAt(step, "name");
    if (id.length === 0 || name.length === 0) {
      return;
    }
    // Gemini sends `arguments` as an object, unlike the two OpenAI-shaped
    // APIs; `parseToolArgs` takes either, so it is passed through untouched.
    const args = step["arguments"];
    this.steps.push({ type: "function_call", id, name, arguments: args });
    this.callNames.set(id, name);
    requests.push(toolRequestOf(name, id, args));
  }
}

function stepsOf(root: JsonRecord): readonly JsonRecord[] {
  const steps = recordsAt(root, "steps");
  return steps.length > 0 ? steps : recordsAt(root, "output");
}

/** Gemini's declaration is flat, like the Responses API's. */
function declarationPayload(declaration: ToolDeclaration): JsonRecord {
  return {
    type: "function",
    name: wireNameOf(declaration),
    description: declaration.description,
    parameters: declaration.parameters,
  };
}

export class GeminiAgentSession implements AgentSession {
  private readonly exchange: GeminiExchange;

  constructor(
    private readonly guard: GuardedToolDispatcher,
    transport: JsonTransport,
    private readonly config: GeminiSessionConfig,
  ) {
    this.exchange = new GeminiExchange(transport, config);
  }

  turn(input: AgentTurnInput): Promise<AgentTurn> {
    return runGuardedTurn(
      this.exchange,
      this.guard,
      input,
      this.config.maxToolIterations || DEFAULT_MAX_TOOL_ITERATIONS,
    );
  }

  async close(): Promise<void> {
    this.exchange.reset();
  }
}
