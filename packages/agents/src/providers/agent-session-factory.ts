import type { PreToolUseHook } from "../buyer/pre-tool-use-hook.js";
import type { AgentSession, ToolDispatcher } from "../shared/agent-session.js";
import { GuardedToolDispatcher } from "./guarded-tool-dispatcher.js";
import type {
  OpenAiSessionConfig,
  ReasoningEffort,
} from "./openai-agent-session.js";
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
  /** Reasoning effort for reasoning models. Absent falls back to
   *  COVENANT_OPENAI_REASONING in env, then "medium": a reasoning model
   *  left at the API default is a reasoning model switched off. */
  readonly reasoningEffort?: ReasoningEffort;
  readonly timeoutMs?: number;
  /** Research on the provider's own web search: the Responses API's hosted
   *  `web_search` tool rides beside the declared function tools. */
  readonly hostedWebSearch?: boolean;
  /** Where the adapter opens a draft per model round trip. Absent means the
   *  blocking path: the adapter answers the same way with nobody watching. */
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

const EFFORTS: ReadonlySet<string> = new Set(["low", "medium", "high"]);

function effortOf(request: AgentSessionRequest): ReasoningEffort {
  if (request.reasoningEffort !== undefined) return request.reasoningEffort;
  const env = request.env["COVENANT_OPENAI_REASONING"] ?? "";
  return EFFORTS.has(env) ? (env as ReasoningEffort) : "medium";
}

function configOf(
  request: AgentSessionRequest,
  id: AgentProviderId,
  model: string,
): OpenAiSessionConfig {
  return {
    baseUrl: PROVIDER_SPECS[id].baseUrl,
    apiKey: resolveProviderApiKey(request.env, id),
    model,
    systemPrompt: request.systemPrompt,
    tools: request.tools ?? COVENANT_TOOL_DECLARATIONS,
    maxToolIterations:
      request.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS,
    reasoningEffort: effortOf(request),
    ...(request.hostedWebSearch === true
      ? { hostedTools: [{ type: "web_search" }] }
      : {}),
  };
}

/**
 * One adapter, one gate. The session is built around a `GuardedToolDispatcher`
 * and nothing else can dispatch for it, so a missing key is the only way this
 * fails, and it fails as a typed error naming the variable rather than as a
 * 401 later on.
 */
export function createAgentSession(
  request: AgentSessionRequest,
): CreatedAgentSession {
  const id = request.provider ?? resolveProviderId(request.env);
  const model = request.model ?? resolveProviderModel(request.env, id);
  const guard = new GuardedToolDispatcher(
    request.hook,
    request.dispatcher,
    request.txnId,
  );
  const transport = new JsonTransport(request.fetchImpl ?? fetch, {
    provider: id,
    timeoutMs: request.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
  });
  const session = new OpenAiAgentSession(
    guard,
    transport,
    configOf(request, id, model),
    request.drafts ?? null,
  );
  return { provider: id, model, session, guard };
}
