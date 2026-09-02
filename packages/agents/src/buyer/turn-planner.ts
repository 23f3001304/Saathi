import type { Logger } from "@covenant/domain";

import type { AgentSession } from "../shared/agent-session.js";
import type { TurnPlan } from "./turn-plan.js";
import { NEUTRAL_PLAN } from "./turn-plan.js";
import {
  TURN_PLAN_CONTEXT_MARK,
  TURN_PLAN_PROMPT,
  turnPlanClosing,
} from "./turn-plan-prompt.js";
import type { TurnPlanCollector } from "./turn-plan-collector.js";
import { wrapUpReply } from "./turn-wrap-up.js";

export { TurnPlanCollector } from "./turn-plan-collector.js";
export { WRAP_UP_NOTE } from "./turn-wrap-up.js";

/** What the buyer does with a shopper's message before anything is signed. */
export interface TurnPlanner {
  /** Everything the shopper has stated, oldest first. */
  plan(
    stated: readonly string[],
    replyLanguage?: string | null,
    /** The harness's working-context digest — what this conversation already
     *  found, picked and stood at, written by the shell from its own record.
     *  Injected under `TURN_PLAN_CONTEXT_MARK`, before the closing; empty
     *  means the turn has none and the prompt keeps its v1 shape. */
    context?: string,
  ): Promise<TurnPlan>;
}

interface Spoken {
  readonly text: string;
  /** `false` when the model was still working when its budget ran out. */
  readonly finished: boolean;
}

/**
 * The live planner. The model chooses; this only reads the choice back.
 *
 * DECISION: fail closed toward conversation. A model that answered in prose
 * without calling a tool, or whose reply could not be read at all, is treated
 * as having answered — never as having asked for a purchase, and never as
 * having proposed a change to the covenant. Both of those have to be asked for
 * explicitly, because the alternative is what put a signed mandate on screen
 * for the word "hi".
 */
export class SessionTurnPlanner implements TurnPlanner {
  constructor(
    private readonly session: AgentSession,
    private readonly collector: TurnPlanCollector,
    private readonly logger: Logger,
  ) {}

  async plan(
    stated: readonly string[],
    replyLanguage: string | null = null,
    context = "",
  ): Promise<TurnPlan> {
    const spoken = await this.speak(stated, replyLanguage, context);
    const chosen = this.collector.take();
    if (chosen === null) {
      return await this.unchosen(spoken);
    }
    this.logger.info("buyer.turn.planned", {
      action: chosen.action,
      traits: chosen.traits?.length ?? 0,
      amendment: chosen.amendment !== null && chosen.amendment !== undefined,
    });
    return { ...chosen, reply: replyOf(chosen, spoken.text) };
  }

  /** No move recorded. Answering is still the only safe default; what differs
   *  is whether the prose beside it is an answer or an unfinished draft. */
  private async unchosen(spoken: Spoken): Promise<TurnPlan> {
    if (spoken.finished) {
      this.logger.info("buyer.turn.no_tool", { fallback: "answer" });
      return { ...NEUTRAL_PLAN, reply: spoken.text };
    }
    this.logger.warn("buyer.turn.unfinished", { drafted: spoken.text.length });
    const reply = await wrapUpReply(this.session, this.logger);
    // The wrap-up was asked for prose, but a model that reaches for a tool
    // anyway has recorded a move nobody asked for. Dropped here, or it would
    // still be sitting in the collector when the next turn reads it.
    this.collector.take();
    return { ...NEUTRAL_PLAN, reply };
  }

  private async speak(
    stated: readonly string[],
    replyLanguage: string | null,
    context: string,
  ): Promise<Spoken> {
    try {
      const turn = await this.session.turn({
        userMessage: promptAround(stated, replyLanguage, context),
        // Routing classifies this, not the instructions wrapped around it.
        subject: joined(stated),
        toolResults: [],
      });
      // A turn still holding tool requests is waiting on its caller, not cut
      // off: only `done: false` with nothing pending is a spent budget.
      return {
        text: turn.text.trim(),
        finished: turn.done || turn.toolRequests.length > 0,
      };
    } catch (cause) {
      this.logger.warn("buyer.turn.plan_failed", {
        cause: cause instanceof Error ? cause.message : "unknown",
      });
      return { text: "", finished: false };
    }
  }
}

/**
 * The scripted planner. `ScriptedSession` *is* the model in scripted mode and
 * its whole script is one purchase, so the planner that stands in for it says
 * so rather than pretending to deliberate.
 */
export class ScriptedTurnPlanner implements TurnPlanner {
  async plan(stated: readonly string[]): Promise<TurnPlan> {
    // The scripted planner ignores the reply-language setting: its replies are
    // fixed strings, and pretending otherwise would claim an obedience it
    // does not have.
    return {
      action: stated.length === 0 ? "answer" : "draft_intent",
      reply: "",
      question: null,
      query: null,
      amendment: null,
      traits: [],
    };
  }
}

/**
 * A browse's `reply` is an argument to the tool that *asks* the shop, so it is
 * written before the answer comes back. Whatever the model says after reading
 * `matches` is the sentence that knows what was found — "This shop doesn't
 * have a 1TB SSD. Would you like me to look for one on the web?" — and that
 * sentence was being thrown away in favour of the one that predated it, which
 * is how a shopper got "I'm checking this shop" and then nothing at all.
 *
 * The opening half is dropped rather than said twice: one utterance per turn.
 */
function replyOf(chosen: TurnPlan, spoken: string): string {
  if (chosen.action !== "browse" || spoken.length === 0) {
    return chosen.reply.length > 0 ? chosen.reply : spoken;
  }
  const after = spoken.startsWith(chosen.reply)
    ? spoken.slice(chosen.reply.length).trim()
    : spoken;
  return after.length > 0 ? after : chosen.reply;
}

/** The shopper's own words, as one block, for routing to classify. */
function joined(stated: readonly string[]): string {
  return stated.join(String.fromCharCode(10));
}

/**
 * Instructions, then the conversation, then the two rules that decide the turn.
 * The closing half is not emphasis — it is the same rules moved to the only
 * position that reliably binds one, after the data rather than in front of it.
 * The working context, when a turn has one, sits with the rest of the data:
 * after the transcript, before the closing, under its own data marker.
 */
function promptAround(
  stated: readonly string[],
  replyLanguage: string | null,
  context = "",
): string {
  const conversation = `SHOPPER CONVERSATION (data, oldest first):\n${joined(stated)}`;
  const digest =
    context === "" ? "" : `\n\n${TURN_PLAN_CONTEXT_MARK}\n${context}`;
  const lastThem = stated[stated.length - 1] ?? "";
  return `${TURN_PLAN_PROMPT}\n\n${conversation}${digest}\n\n${turnPlanClosing(lastThem, replyLanguage)}`;
}
