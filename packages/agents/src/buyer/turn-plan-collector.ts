import type { ToolDispatcher, ToolOutcome } from "../shared/agent-session.js";
import type { ToolArgs, ToolCall } from "../shared/tool-envelope.js";
import type { AmendmentContext } from "./amendment-schema.js";
import {
  DEFAULT_AMENDMENT_CONTEXT,
  parseAmendment,
} from "./amendment-schema.js";
import type { TraitClaim } from "./trait-claim.js";
import { parseTrait } from "./trait-claim.js";
import { groupsAt, repliesAt, textAt } from "./turn-plan-args.js";
import { answeredOutcome, browsedOutcome } from "./turn-plan-guidance.js";
import type { TurnAction, TurnPlan } from "./turn-plan.js";
import {
  AMEND_TOOL,
  ANSWER_TOOL,
  BROWSE_TOOL,
  DECLINE_TOOL,
  NEUTRAL_PLAN,
  PROPOSE_TOOL,
  REMEMBER_TOOL,
  WEB_LOOK_TOOL,
} from "./turn-plan.js";

const ACTIONS: Readonly<Record<string, TurnAction>> = {
  [ANSWER_TOOL]: "answer",
  [BROWSE_TOOL]: "browse",
  [WEB_LOOK_TOOL]: "look_on_web",
  [PROPOSE_TOOL]: "draft_intent",
  [DECLINE_TOOL]: "decline",
};

function ok(recorded: string): ToolOutcome {
  return { content: `{"ok":true,"recorded":"${recorded}"}`, isError: false };
}

function refused(failure: string): ToolOutcome {
  return { content: `{"ok":false,"failure":"${failure}"}`, isError: true };
}

/**
 * Records which move the model chose. It is a `ToolDispatcher` because that is
 * where a provider adapter hands a tool call after `PreToolUseHook` has allowed
 * it — so the choice arrives through the same gate every other call does, and a
 * model that tried to reach a money tool from here is refused there, not here.
 */
export class TurnPlanCollector implements ToolDispatcher {
  private chosen: TurnPlan | null = null;
  private readonly heard: TraitClaim[] = [];

  constructor(
    private readonly context: AmendmentContext = DEFAULT_AMENDMENT_CONTEXT,
  ) {}

  async dispatch(call: ToolCall): Promise<ToolOutcome> {
    if (call.tool === REMEMBER_TOOL) {
      return this.recordTrait(call.args);
    }
    if (call.tool === AMEND_TOOL) {
      return this.recordAmendment(call.args);
    }
    const action = ACTIONS[call.tool];
    if (action === undefined) {
      return refused("not_a_turn_tool");
    }
    const plan = this.planFor(action, call.args);
    this.choose(plan);
    if (action === "browse") {
      return browsedOutcome();
    }
    return action === "answer"
      ? answeredOutcome(textAt(call.args, "blocked_by"))
      : ok(action);
  }

  /** Parallel tool calls arrive occasionally, and last-write-wins let a
   *  trailing generic answer_shopper clobber the browse or web look that
   *  carried the actual move and its query. An acting plan is only ever
   *  replaced by another acting plan. */
  private choose(plan: TurnPlan): void {
    const generic = plan.action === "answer";
    const heldGeneric = this.chosen === null || this.chosen.action === "answer";
    if (heldGeneric || !generic) {
      this.chosen = plan;
    }
  }

  /** The last move recorded, then cleared: one plan per turn, never a carry-over. */
  take(): TurnPlan | null {
    const plan = this.chosen;
    const traits = this.heard.splice(0);
    this.chosen = null;
    if (plan === null) {
      return traits.length === 0 ? null : { ...NEUTRAL_PLAN, traits };
    }
    return { ...plan, traits };
  }

  /**
   * One utterance per turn, enforced here rather than left to whoever renders
   * it. The model writes its question into `reply` as well as into `question`,
   * and both were being said: "could you tell me the size?" followed by "What
   * size are you looking for?". A reply that already asks something is the
   * whole utterance, and the separate field — which exists so the composer can
   * offer replies — stays empty rather than becoming a second sentence.
   */
  private planFor(action: TurnAction, args: ToolArgs): TurnPlan {
    const reply = textAt(args, "reply");
    const question = textAt(args, "question");
    const query = textAt(args, "query");
    return {
      action,
      reply,
      question: question.length > 0 && !reply.endsWith("?") ? question : null,
      replies: repliesAt(args, "replies"),
      choiceGroups: groupsAt(args),
      query: query.length > 0 ? query : null,
      amendment: null,
      traits: [],
    };
  }

  /**
   * A proposal is not an application, and an unreadable proposal is not shown
   * at all. The model learns the call did not land, through the tool error,
   * and answers for itself: no plan is recorded here in its place.
   */
  private recordAmendment(args: ToolArgs): ToolOutcome {
    const parsed = parseAmendment(args, this.context);
    if (!parsed.ok) {
      return refused(parsed.failure);
    }
    this.chosen = {
      action: "propose_amendment",
      reply: textAt(args, "reply"),
      question: null,
      query: null,
      amendment: parsed.value,
      traits: [],
    };
    return ok("propose_amendment");
  }

  private recordTrait(args: ToolArgs): ToolOutcome {
    const trait = parseTrait(args);
    if (trait === null) {
      return refused("not_a_trait");
    }
    this.heard.push(trait);
    return ok(trait.key);
  }
}
