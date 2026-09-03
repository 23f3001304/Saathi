import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import { PreToolUseHook } from "../src/buyer/pre-tool-use-hook.js";
import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import { OpenAiAgentSession } from "../src/providers/openai-agent-session.js";
import { JsonTransport } from "../src/providers/provider-transport.js";
import {
  SARVAM_BASE_URL,
  SarvamAgentSession,
} from "../src/providers/sarvam-agent-session.js";
import { COVENANT_TOOL_DECLARATIONS } from "../src/providers/tool-declarations.js";
import type { AgentSession, AgentTurn } from "../src/shared/agent-session.js";
import { capturingFetch, jsonResponse, RecordingDispatcher } from "./doubles.js";
import { RecordingLogger, RecordingSink, RecordingTracer } from "./fakes.js";
import type { FedBackResult, Wire } from "./provider-wire.js";
import * as wire from "./provider-wire.js";

/** A money tool offered by the merchant server — F2's headline attack. */
export const SPOOFED_MONEY_TOOL = "mcp__covenant_merchant__execute_payment";

export const GATEWAY_TOOL = "mcp__covenant_gateway__verify_cart";

export interface ProviderCase {
  readonly id: string;
  readonly build: (
    fetchImpl: typeof fetch,
    guard: GuardedToolDispatcher,
  ) => AgentSession;
  readonly call: (callId: string, name: string, args: Wire) => Wire;
  readonly text: (text: string) => Wire;
  readonly results: (body: Wire) => readonly FedBackResult[];
  readonly toolNames: (body: Wire) => readonly string[];
}

const base = {
  apiKey: "test-key",
  model: "test-model",
  systemPrompt: "You are the buyer agent.",
  tools: COVENANT_TOOL_DECLARATIONS,
  maxToolIterations: 4,
};

function transport(fetchImpl: typeof fetch, provider: string): JsonTransport {
  return new JsonTransport(fetchImpl, { provider, timeoutMs: 1_000 });
}

function flatNames(body: Wire): readonly string[] {
  return wire.declarationsOf(body).map((tool) => String(tool["name"]));
}

function nestedNames(body: Wire): readonly string[] {
  return wire.declarationsOf(body).map((tool) => {
    const fn = tool["function"] as Wire | undefined;
    return String(fn?.["name"]);
  });
}

export const PROVIDER_CASES: readonly ProviderCase[] = [
  {
    id: "openai",
    build: (fetchImpl, guard) =>
      new OpenAiAgentSession(guard, transport(fetchImpl, "openai"), {
        ...base,
        baseUrl: "https://api.openai.com/v1",
      }),
    call: wire.openAiCall,
    text: wire.openAiText,
    results: wire.openAiResults,
    toolNames: flatNames,
  },
  {
    id: "sarvam",
    build: (fetchImpl, guard) =>
      new SarvamAgentSession(guard, transport(fetchImpl, "sarvam"), {
        ...base,
        baseUrl: SARVAM_BASE_URL,
      }),
    call: wire.chatCall,
    text: wire.chatText,
    results: wire.chatResults,
    toolNames: nestedNames,
  },
];

/** Indexing without a non-null assertion: an absent body reads as empty. */
export function bodyAt(run: TurnRun, index: number): Wire {
  return run.bodies[index] ?? {};
}

export function firstDeclaration(run: TurnRun): Wire {
  return wire.declarationsOf(bodyAt(run, 0))[0] ?? {};
}

export interface TurnRun {
  readonly turn: AgentTurn;
  readonly bodies: readonly Wire[];
  readonly urls: readonly string[];
  readonly guard: GuardedToolDispatcher;
  readonly dispatcher: RecordingDispatcher;
  readonly sink: RecordingSink;
}

export function hookOf(sink: RecordingSink): PreToolUseHook {
  return new PreToolUseHook(
    new MoneyToolRegistry(),
    sink,
    new RecordingLogger(),
    new RecordingTracer(),
    { tenantId: "tnt_demo", attackId: "T-1" },
  );
}

/** Drives one `turn()` against a scripted wire and returns everything the
 *  assertions need: what went out, what the gate did, what ran. */
export async function runTurn(
  kase: ProviderCase,
  responses: readonly Wire[],
): Promise<TurnRun> {
  const sink = new RecordingSink();
  const dispatcher = new RecordingDispatcher('{"verdict":"approve"}');
  const guard = new GuardedToolDispatcher(hookOf(sink), dispatcher, "txn_1");
  const { fetch: fetchImpl, calls } = capturingFetch(
    responses.map((body) => jsonResponse(200, body)),
  );
  const session = kase.build(fetchImpl, guard);
  const turn = await session.turn({
    userMessage: "buy the brass lamp",
    toolResults: [],
  });
  await session.close();
  return {
    turn,
    bodies: calls.map((call) => wire.sentBody(call)),
    urls: calls.map((call) => call.url),
    guard,
    dispatcher,
    sink,
  };
}
