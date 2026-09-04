import type {
  AgentSession,
  PlannerReads,
  TurnPlanner,
} from "@covenant/agents";
import {
  BUYER_SYSTEM_PROMPT,
  COVENANT_TOOL_DECLARATIONS,
  DEFAULT_AMENDMENT_CONTEXT,
  ScriptedTurnPlanner,
  SessionTurnPlanner,
  TURN_PLAN_TOOLS,
  TurnPlanCollector,
} from "@covenant/agents";

import {
  RESEARCH_TOOL_DECLARATIONS,
  WEB_TOOL_DECLARATIONS,
} from "../purchase/web-tools.js";
import { ScriptedSession } from "../session/scripted-session.js";
import { COVENANT_CURRENCY } from "./judge-wiring.js";
import type { SessionDeps } from "./routed-session.js";
import { routedSession } from "./routed-session.js";

export type { SessionDeps } from "./routed-session.js";

const CATALOG_LIMIT = 8;

/**
 * The buyer's own conversation. `requiresStructuredOutput: false` — its turns
 * are prose plus tool calls, so the schema signal abstains and the confidence
 * score renormalises over the signals this turn can actually produce.
 */
export function wireSession(deps: SessionDeps): AgentSession {
  deps.obs.logger.info("agent.session.mode", { mode: deps.config.mode });
  if (deps.config.mode === "live") {
    return routedSession(deps, {
      // The sandbox is part of the buyer's ordinary tool surface, not a mode:
      // the model decides for itself when the catalog cannot serve the ask and
      // it should go and look. Nothing here triggers on a result count.
      tools: [...COVENANT_TOOL_DECLARATIONS, ...WEB_TOOL_DECLARATIONS],
      systemPrompt: BUYER_SYSTEM_PROMPT,
      dispatcher: deps.dispatch.dispatcher,
      structured: false,
      // DECISION, restored: the buyer streams. It went silent to stop a
      // duplicate, and the duplicate was never the streaming - it was the
      // claim missing a draft that had not settled yet, which `lastSettled`
      // now catches live as well as final. A shopper watching nothing
      // happen for forty seconds is the worse bug, and thinking that
      // appears as it is written is the whole feel of the thing.
      speaks: true,
      decidesByTool: false,
    });
  }
  return new ScriptedSession(deps.merchant.shelf, deps.ids, {
    capPaise: deps.config.capPaise,
    catalogLimit: CATALOG_LIMIT,
  });
}

/**
 * The research session: the provider's own hosted web search plus the one
 * reporting tool, and no sandbox at all.
 *
 * DECISION (supersedes "the sandbox tools and nothing else"): research moved
 * off the sandbox window onto the provider's web search, which reads the
 * whole shelf in one call instead of driving a browser through it. The
 * sandbox window is reserved for the two things only it can do under guard,
 * signing in and buying, and it opens when the shopper taps a card. A
 * session that cannot reach the window cannot wander into it; the hook is
 * the same one, so the block matrix is unchanged.
 */
export function wireWebSession(deps: SessionDeps): AgentSession {
  return routedSession(deps, {
    tools: RESEARCH_TOOL_DECLARATIONS,
    hostedWebSearch: true,
    systemPrompt: BUYER_SYSTEM_PROMPT,
    dispatcher: deps.dispatch.dispatcher,
    structured: false,
    // DECISION: an errand does not stream. Its answer is composed on a second
    // leg and then *gated* — for language, and against what the window was
    // actually shown — so a streamed draft is by construction prose the
    // harness has not yet accepted. Both live leaks were exactly that: a
    // Hinglish draft on screen before the language gate regenerated it, and a
    // composition that recommended three drives at three exact prices from a
    // previous conversation, withdrawn by the grounding gate but already read.
    // What the shopper watches instead is the step pills, which are the
    // harness's record rather than the model's draft.
    speaks: false,
    decidesByTool: false,
    sideEffects: true,
  });
}

/**
 * The errand behind a tapped card, on its own conversation for the same reason
 * the drafter has one: two turns with two different contracts. The look's
 * thread is several thousand tokens of "go and find things"; the pick's is one
 * listing and one basket, and a thread told to browse goes on browsing.
 */
export function wirePickSession(deps: SessionDeps): AgentSession {
  return routedSession(deps, {
    tools: WEB_TOOL_DECLARATIONS,
    systemPrompt: BUYER_SYSTEM_PROMPT,
    dispatcher: deps.dispatch.dispatcher,
    structured: false,
    // DECISION: an errand does not stream. Its answer is composed on a second
    // leg and then *gated* — for language, and against what the window was
    // actually shown — so a streamed draft is by construction prose the
    // harness has not yet accepted. Both live leaks were exactly that: a
    // Hinglish draft on screen before the language gate regenerated it, and a
    // composition that recommended three drives at three exact prices from a
    // previous conversation, withdrawn by the grounding gate but already read.
    // What the shopper watches instead is the step pills, which are the
    // harness's record rather than the model's draft.
    speaks: false,
    decidesByTool: false,
    sideEffects: true,
  });
}

export interface PlannerParts {
  readonly planner: TurnPlanner;
}

/**
 * The first move. In live mode the model chooses it, through the three
 * turn-plan tools, on a conversation of its own; in scripted mode the script is
 * the model and its script is a purchase, so the planner says so.
 */
export function wireTurnPlanner(
  deps: SessionDeps,
  reads: PlannerReads | null = null,
): PlannerParts {
  if (deps.config.mode !== "live") {
    return { planner: new ScriptedTurnPlanner() };
  }
  // The bounds a proposal and a browse are checked against, from the same
  // config and the same per-turn shelf everything else in this lane reads.
  // Without them the model's own sku and its own ceiling reach the sheet
  // unchecked, which is the whole of what the tool boundary is for.
  const collector = new TurnPlanCollector(DEFAULT_AMENDMENT_CONTEXT, reads, {
    capPaise: deps.config.capPaise,
    currency: COVENANT_CURRENCY,
    shelf: deps.merchant.shelf,
  });
  const session = routedSession(deps, {
    tools: TURN_PLAN_TOOLS,
    systemPrompt: BUYER_SYSTEM_PROMPT,
    dispatcher: collector,
    structured: false,
    // The move IS the answer here: the prose is an argument to the tool that
    // records it, so a turn that called nothing has not answered at all.
    decidesByTool: true,
    // The planner streams: its prose IS the turn's answer, and the shell's
    // commit of the same text claims the draft rather than repeating it.
    speaks: true,
  });
  return {
    planner: new SessionTurnPlanner(session, collector, deps.obs.logger),
  };
}
