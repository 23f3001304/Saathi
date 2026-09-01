import type {
  AgentSession,
  AgentTurn,
  AgentTurnInput,
} from "../shared/agent-session.js";
import type { ChatCompletionsConfig } from "./chat-completions-session.js";
import { ChatCompletionsAgentSession } from "./chat-completions-session.js";
import type { GuardedToolDispatcher } from "./guarded-tool-dispatcher.js";
import type { JsonTransport, ProviderHeaders } from "./provider-transport.js";
import type { ToolDeclaration } from "./tool-declarations.js";
import type { DraftScope } from "./turn-stream.js";

export const SARVAM_BASE_URL = "https://api.sarvam.ai/v1";

/** Sarvam's documented primary header. It also accepts `Authorization:
 *  Bearer` for OpenAI-compatible tooling; we send the one their docs prefer. */
export const SARVAM_AUTH_HEADER = "api-subscription-key";

/** Verified from Sarvam's chat-completions docs, not from memory. */
export const SARVAM_MODELS = [
  "sarvam-105b",
  "sarvam-105b-conversations",
] as const;

export interface SarvamSessionConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDeclaration[];
  readonly maxToolIterations: number;
}

export function sarvamHeaders(apiKey: string): ProviderHeaders {
  return { [SARVAM_AUTH_HEADER]: apiKey };
}

/**
 * Sarvam AI — Razorpay's agentic-payments partner and India's sovereign-AI
 * provider, so it is a first-class target here rather than a fourth option.
 *
 * DECISION: **Sarvam is OpenAI-compatible at `/v1/chat/completions`**, which
 * their docs state explicitly, so this class owns no transport of its own. It
 * is `ChatCompletionsAgentSession` with Sarvam's base URL, model and
 * `api-subscription-key` header — the wire format, the tool-declaration shape
 * and the tool-result round trip are the shared, tested ones.
 *
 * It is a delegating class and not a `createSarvamSession()` helper so that
 * `SarvamAgentSession` is a real named type in the barrel: agent-host, the
 * factory and the parity test all name the provider they mean.
 */
export class SarvamAgentSession implements AgentSession {
  private readonly inner: ChatCompletionsAgentSession;

  constructor(
    guard: GuardedToolDispatcher,
    transport: JsonTransport,
    config: SarvamSessionConfig,
    drafts: DraftScope | null = null,
  ) {
    this.inner = new ChatCompletionsAgentSession(
      guard,
      transport,
      chatConfigOf(config),
      drafts,
    );
  }

  turn(input: AgentTurnInput): Promise<AgentTurn> {
    return this.inner.turn(input);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

function chatConfigOf(config: SarvamSessionConfig): ChatCompletionsConfig {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    systemPrompt: config.systemPrompt,
    headers: sarvamHeaders(config.apiKey),
    tools: config.tools,
    maxToolIterations: config.maxToolIterations,
  };
}
