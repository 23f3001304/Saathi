import type {
  CatalogModel,
  DraftScope,
  ModelRouter as ModelRouterType,
  PreToolUseHook,
  RoutedSessionBuild,
  RoutedSessionFactory,
  TaskClass,
  ToolDeclaration,
  ToolDispatcher,
} from "@covenant/agents";
import {
  CachingModelDiscovery,
  DEFAULT_ROUTER_CONFIG,
  createAgentSession,
  DiscoveredCatalogSource,
  HttpModelDiscovery,
  InMemoryRouterStats,
  ModelRouter,
} from "@covenant/agents";
import type { Clock } from "@covenant/domain";

import type { AgentHostConfig } from "../config.js";
import { wireFetch } from "../obs/wire-trace.js";
import type { ObsParts } from "./obs-wiring.js";

export type Env = Readonly<Record<string, string | undefined>>;

export interface RouterDeps {
  readonly config: AgentHostConfig;
  readonly obs: ObsParts;
  readonly clock: Clock;
  readonly hook: PreToolUseHook;
  readonly dispatcher: ToolDispatcher;
  readonly tools: readonly ToolDeclaration[];
  readonly systemPrompt: string;
  readonly env: Env;
  /** See `RoutedSessionConfig.decidesByToolCall`. */
  readonly decidesByToolCall: boolean;
  /** See `SessionShape.sideEffects`. */
  readonly sideEffects: boolean;
  /** See `SessionShape.hostedWebSearch`. */
  readonly hostedWebSearch?: boolean;
}

/**
 * A second cheap sample buys agreement on the *text*, and pays for it by
 * running the turn again. That is sound while the turn's answer is its text.
 * It is not sound when the answer is a tool call: the probe dispatches a second
 * choice into the same collector, the router keeps only the first attempt's
 * prose, and the move the harness then acts on is the one it threw away — which
 * is how a run committed "I'm waiting for your approval of the cart" over a
 * cart nobody had proposed.
 *
 * It is not sound either when the tools act on the world. The open-web errand
 * is classified `money` — its own instructions say "payment" — so a live look
 * ran the entire browse twice against one shared window: eight round trips,
 * two full page trails, one of them thrown away by the router while its
 * navigations stayed. A sample that repeats side effects is not a sample.
 */
function selfConsistencyFor(deps: RouterDeps): readonly TaskClass[] {
  return deps.decidesByToolCall || deps.sideEffects
    ? []
    : DEFAULT_ROUTER_CONFIG.selfConsistencyClasses;
}

/**
 * The router's collaborators, assembled where every other collaborator in this
 * process is assembled. Discovery runs over the ordinary `fetch` behind a TTL
 * cache; the statistics are the in-memory default, which is the honest choice
 * for a demo host — they are behind a port, so a deployment that wants them to
 * survive a restart supplies its own adapter without the router noticing.
 */
export function wireModelRouter(deps: RouterDeps): ModelRouterType {
  const discovery = new CachingModelDiscovery(
    new HttpModelDiscovery(fetch, deps.config.timeoutMs),
    deps.clock,
  );
  const source = new DiscoveredCatalogSource({
    env: deps.env,
    discovery,
    logger: deps.obs.logger,
  });
  // `COVENANT_AGENT_MODEL` names the model an operator wants to see. The
  // router still routes: the pin takes the opening rung, and a low-confidence
  // answer still escalates past it exactly as it would have.
  return new ModelRouter(source, new InMemoryRouterStats(), deps.obs.routing, {
    ...DEFAULT_ROUTER_CONFIG,
    selfConsistencyClasses: selfConsistencyFor(deps),
    pinnedModel: deps.config.model,
  });
}

/**
 * One `PreToolUseHook` and one `ToolDispatcher`, closed over for every rung the
 * cascade might climb. This is the safety property in code: the router chooses
 * the model argument and nothing else, so a stronger model arrives with exactly
 * the authority the cheap one had.
 */
export function wireRoutedSessions(deps: RouterDeps): RoutedSessionFactory {
  return {
    build(model: CatalogModel, drafts: DraftScope | null): RoutedSessionBuild {
      const created = createAgentSession({
        env: deps.env,
        provider: model.provider,
        model: model.id,
        // At `LOG_LEVEL=debug` this is the traced `fetch`: the whole assembled
        // message list, in order, as the model was actually handed it.
        fetchImpl: wireFetch(deps.config.logLevel, deps.obs.logger),
        drafts,
        hook: deps.hook,
        dispatcher: deps.dispatcher,
        txnId: null,
        systemPrompt: deps.systemPrompt,
        tools: deps.tools,
        hostedWebSearch: deps.hostedWebSearch === true,
        maxToolIterations: deps.config.maxTurns,
        timeoutMs: deps.config.timeoutMs,
      });
      return { session: created.session, guard: created.guard };
    },
  };
}
