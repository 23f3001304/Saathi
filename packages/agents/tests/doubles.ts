import type { QuoteOffer } from "../src/buyer/negotiation-machine.js";
import type { QuoteSource } from "../src/buyer/negotiation-session.js";
import type {
  AgentSession,
  AgentTurn,
  AgentTurnInput,
  ToolDispatcher,
  ToolOutcome,
} from "../src/shared/agent-session.js";
import type { ToolCall } from "../src/shared/tool-envelope.js";

/**
 * The scripted LLM. Every conversation test drives this instead of the SDK, so
 * what is under test is the harness's reaction to a model, not the model.
 */
export class ScriptedSession implements AgentSession {
  readonly seen: AgentTurnInput[] = [];
  private index = 0;

  constructor(private readonly script: readonly AgentTurn[]) {}

  async turn(input: AgentTurnInput): Promise<AgentTurn> {
    this.seen.push(input);
    const next = this.script[Math.min(this.index, this.script.length - 1)];
    this.index += 1;
    return next ?? { text: "", toolRequests: [], done: true };
  }

  async close(): Promise<void> {
    this.index = this.script.length;
  }
}

export function say(text: string): AgentTurn {
  return { text, toolRequests: [], done: true };
}

export function callTool(
  toolUseId: string,
  tool: string,
  server: string,
  args: Readonly<Record<string, unknown>> = {},
): AgentTurn {
  return {
    text: "",
    toolRequests: [{ toolUseId, tool, server, args }],
    done: false,
  };
}

export class RecordingDispatcher implements ToolDispatcher {
  readonly calls: ToolCall[] = [];

  constructor(private readonly reply = "ok") {}

  async dispatch(call: ToolCall): Promise<ToolOutcome> {
    this.calls.push(call);
    return { content: this.reply, isError: false };
  }
}

export interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Replays a fixed sequence of responses and records what was sent. */
export function capturingFetch(responses: readonly Response[]): {
  fetch: typeof fetch;
  calls: CapturedRequest[];
} {
  const calls: CapturedRequest[] = [];
  let index = 0;
  const impl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next === undefined) {
      throw new TypeError("fetch failed: no scripted response");
    }
    return next;
  };
  return { fetch: impl as typeof fetch, calls };
}

export function headerOf(request: CapturedRequest, name: string): string | null {
  const headers = request.init?.headers as Record<string, string> | undefined;
  return headers?.[name] ?? null;
}

/** A merchant that answers with a fixed list of offers and remembers the asks. */
export class ScriptedQuotes implements QuoteSource {
  readonly targets: number[] = [];
  readonly skus: string[] = [];
  private index = 0;

  constructor(private readonly offers: readonly (QuoteOffer | null)[]) {}

  async requestQuote(sku: string, targetPaise: number): Promise<QuoteOffer | null> {
    this.skus.push(sku);
    this.targets.push(targetPaise);
    const offer = this.offers[Math.min(this.index, this.offers.length - 1)];
    this.index += 1;
    return offer ?? null;
  }
}
