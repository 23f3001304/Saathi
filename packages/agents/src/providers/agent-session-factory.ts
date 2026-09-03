import type { PreToolUseHook } from "../buyer/pre-tool-use-hook.js";
import type { AgentSession, ToolDispatcher } from "../shared/agent-session.js";
import { GeminiAgentSession, GEMINI_BASE_URL } from "./gemini-agent-session.js";
import { GuardedToolDispatcher } from "./guarded-tool-dispatcher.js";
import { OpenAiAgentSession } from "./openai-agent-session.js";
import type { AgentProviderId, Env } from "./provider-config.js";
import {
  PROVIDER_SPECS,
  resolveProviderApiKey,
  resolveProviderId,
  resolveProviderModel,
} from "./provider-config.js";
import { DEFAULT_MAX_TOOL_ITERATIONS } from "./provider-turn-loop.js";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  JsonTransport,
} from "./provider-transport.js";
import { SARVAM_BASE_URL, SarvamAgentSession } from "./sarvam-agent-session.js";
import type { ToolDeclaration } from "./tool-declarations.js";
import { COVENANT_TOOL_DECLARATIONS } from "./tool-declarations.js";
import type { DraftScope } from "./turn-stream.js";

export interface AgentSessionRequest {
  readonly env: Env;
  /** Set by the router, which has already chosen; unset means "read the env". */
  readonly provider?: AgentProviderId;
  readonly model?: string;
  readonly hook: PreToolUseHook;
  readonly dispatcher: ToolDispatcher;
  readonly txnId: string | null;
  readonly systemPrompt: string;
  readonly tools?: readonly ToolDeclaration[];
  readonly fetchImpl?: typeof fetch;
  readonly maxToolIterations?: number;
  /** Reasoning effort for reasoning models (OpenAI path). Absent falls back
   *  to COVENANT_OPENAI_REASONING in env, then "medium": a reasoning model
   *  left at the API default is a reasoning model switched off. */
  readonly reasoningEffort?: "low" | "medium" | "high";
  readonly timeoutMs?: number;
  /** Research on the provider's own web search (OpenAI hosted tool). Only the
   *  OpenAI path can honour it; other providers ignore it and the errand
   *  falls back to whatever tools it was declared. */
  readonly hostedWebSearch?: boolean;
  /** Where the adapter opens a draft per model round trip. Absent means the
   *  blocking path: every adapter answers the same way with nobody watching. */
  readonly drafts?: DraftScope | null;
}

/**
 * DECISION: the factory returns the provider and model alongside the session
 * rather than the bare session. `const { session } = createAgentSession(...)`
 * is still one line, and the caller gets the two facts it will want in every
 * log line plus `guard`, the F2 gate every tool call on this session passes
 * through, which is where the demo reads its refusals from.
 */
export interface CreatedAgentSession {
  readonly provider: AgentProviderId;
  readonly model: string;
  readonly session: AgentSession;
  readonly guard: GuardedToolDispatcher;
}

interface Resolved {
  readonly id: AgentProviderId;
  readonly model: string;
  readonly apiKey: string;
  readonly tools: readonly ToolDeclaration[];
  readonly maxToolIterations: number;
}

const EFFORTS = new Set(["low", "medium", "high"]);

function effortOf(
  request: AgentSessionRequest,
): "low" | "medium" | "high" {
  if (request.reasoningEffort !== undefined) return request.reasoningEffort;
  const env = request.env["COVENANT_OPENAI_REASONING"] ?? "";
  return EFFORTS.has(env) ? (env as "low" | "medium" | "high") : "medium";
}

export function createAgentSession(
  request: AgentSessionRequest,
): CreatedAgentSession {
  const id = request.provider ?? resolveProviderId(request.env);
  const resolved: Resolved = {
    id,
    model: request.model ?? resolveProviderModel(request.env, id),
    apiKey: resolveProviderApiKey(request.env, id),
    tools: request.tools ?? COVENANT_TOOL_DECLARATIONS,
    maxToolIterations: request.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS,
  };
  const guard = new GuardedToolDispatcher(
    request.hook,
    request.dispatcher,
    request.txnId,
  );
  const session = httpSession(request, resolved, guard);
  return { provider: id, model: resolved.model, session, guard };
}

function httpSession(
  request: AgentSessionRequest,
  resolved: Resolved,
  guard: GuardedToolDispatcher,
): AgentSession {
  const transport = new JsonTransport(request.fetchImpl ?? fetch, {
    provider: resolved.id,
    timeoutMs: request.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
  });
  const config = {
    baseUrl: PROVIDER_SPECS[resolved.id].baseUrl,
    apiKey: resolved.apiKey,
    model: resolved.model,
    systemPrompt: request.systemPrompt,
    tools: resolved.tools,
    maxToolIterations: resolved.maxToolIterations,
    reasoningEffort: effortOf(request),
    ...(request.hostedWebSearch === true && resolved.id === "openai"
      ? { hostedTools: [{ type: "web_search" }] }
      : {}),
  };
  const drafts = request.drafts ?? null;
  if (resolved.id === "gemini") {
    return new GeminiAgentSession(guard, transport, {
      ...config,
      baseUrl: GEMINI_BASE_URL,
    });
  }
  if (resolved.id === "sarvam") {
    return new SarvamAgentSession(
      guard,
      transport,
      { ...config, baseUrl: SARVAM_BASE_URL },
      drafts,
    );
  }
  return new OpenAiAgentSession(guard, transport, config, drafts);
}
