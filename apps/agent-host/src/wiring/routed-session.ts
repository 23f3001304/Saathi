import type {
  AgentSession,
  DraftSink,
  PreToolUseHook,
  ToolDeclaration,
  ToolDispatcher,
} from "@covenant/agents";
import { RoutedAgentSession } from "@covenant/agents";
import type { Clock, IdGenerator } from "@covenant/domain";

import type { AgentHostConfig } from "../config.js";
import type { DispatchParts } from "./dispatch-wiring.js";
import type { MerchantParts } from "./merchant-wiring.js";
import type { ObsParts } from "./obs-wiring.js";
import type { Env, RouterDeps } from "./router-wiring.js";
import { wireModelRouter, wireRoutedSessions } from "./router-wiring.js";

export interface SessionDeps {
  readonly config: AgentHostConfig;
  readonly hook: PreToolUseHook;
  /** Where a streamed answer goes while it is written; absent means blocking. */
  readonly sink?: DraftSink | null;
  readonly merchant: MerchantParts;
  readonly dispatch: DispatchParts;
  readonly obs: ObsParts;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly env?: Env;
}

export interface SessionShape {
  readonly tools: readonly ToolDeclaration[];
  /** Research rides the provider's own web search; see the factory. */
  readonly hostedWebSearch?: boolean;
  readonly systemPrompt: string;
  readonly dispatcher: ToolDispatcher;
  readonly structured: boolean;
  /** Whether this session's output is prose a shopper may read as it lands. */
  readonly speaks: boolean;
  /** See `RoutedSessionConfig.decidesByToolCall`. */
  readonly decidesByTool: boolean;
  /**
   * This session's tools change something outside the process — they navigate
   * a real window, type into a real search box, put a thing in a real basket.
   * Running such a turn twice is not a second opinion, it is the work done
   * twice, so the router's second cheap sample is withheld from it.
   */
  readonly sideEffects?: boolean;
}

function routerDepsOf(deps: SessionDeps, shape: SessionShape): RouterDeps {
  return {
    config: deps.config,
    obs: deps.obs,
    clock: deps.clock,
    hook: deps.hook,
    dispatcher: shape.dispatcher,
    tools: shape.tools,
    hostedWebSearch: shape.hostedWebSearch === true,
    systemPrompt: shape.systemPrompt,
    env: deps.env ?? process.env,
    decidesByToolCall: shape.decidesByTool,
    sideEffects: shape.sideEffects === true,
  };
}

/**
 * A routed session: the router asks each keyed provider what it can reach,
 * classifies the turn, starts on the cheapest model that can hold it and climbs
 * when its own confidence is low — writing all of it to the routing journal.
 *
 * The hook is the one passed in, on every rung of every ladder. That is the
 * whole reason it is an argument: the block matrix the tests prove is the block
 * matrix that runs live, whichever model happens to be driving.
 */
export function routedSession(
  deps: SessionDeps,
  shape: SessionShape,
): AgentSession {
  const routerDeps = routerDepsOf(deps, shape);
  return new RoutedAgentSession(
    wireModelRouter(routerDeps),
    wireRoutedSessions(routerDeps),
    {
      tools: shape.tools,
      requiresStructuredOutput: shape.structured,
      decidesByToolCall: shape.decidesByTool,
      sink: shape.speaks ? (deps.sink ?? null) : null,
    },
  );
}
