import type { ToolDispatcher, ToolOutcome } from "../shared/agent-session.js";
import type { ToolArgs, ToolCall } from "../shared/tool-envelope.js";
import type { AmendmentContext } from "./amendment-schema.js";
import {
  DEFAULT_AMENDMENT_CONTEXT,
  parseAmendment,
} from "./amendment-schema.js";
import type { PlannerReads } from "./planner-reads.js";
import type { TraitClaim } from "./trait-claim.js";
import { parseTrait } from "./trait-claim.js";
import { textAt } from "./turn-plan-args.js";
import type { DraftBounds } from "./turn-plan-draft.js";
import { movePlan, ok, refused } from "./turn-plan-record.js";
import type { TurnPlan } from "./turn-plan.js";
import {
  AMEND_TOOL,
  NEUTRAL_PLAN,
  REMEMBER_TOOL,
  SEE_SHELF_TOOL,
  SEE_STATE_TOOL,
} from "./turn-plan.js";

/**
 * Records which move the model chose. It is a `ToolDispatcher` because that is
 * where a provider adapter hands a tool call after `PreToolUseHook` has allowed
 * it — so the choice arrives through the same gate every other call does, and a
 * model that tried to reach a money tool from here is refused there, not here.
 *
 * DECISION: a refused move records nothing. The model reads the refusal (a sku
 * off the shelf, a ceiling above the cap) and calls again in the same turn; the
 * plan the turn takes is the last move that was accepted.
 */
export class TurnPlanCollector implements ToolDispatcher {
  private chosen: TurnPlan | null = null;
  private readonly heard: TraitClaim[] = [];

  constructor(
    private readonly context: AmendmentContext = DEFAULT_AMENDMENT_CONTEXT,
    /** What the model may look at before it moves. `null` on a host with
     *  nothing to show: a read then comes back refused, never as an empty
     *  world the model would reason from as though it were the real one. */
    private readonly reads: PlannerReads | null = null,
    /** What a proposal and a browse are checked against. `null` parses the
     *  shapes and checks no fact: also the unit-test shape. */
    private readonly bounds: DraftBounds | null = null,
  ) {}

  async dispatch(call: ToolCall): Promise<ToolOutcome> {
    if (call.tool === SEE_SHELF_TOOL || call.tool === SEE_STATE_TOOL) {
      return this.read(call.tool);
    }
    if (call.tool === REMEMBER_TOOL) {
      return this.recordTrait(call.args);
    }
    if (call.tool === AMEND_TOOL) {
      return this.recordAmendment(call.args);
    }
    return this.recordMove(call);
  }

  /** A read touches `chosen` not at all: a turn that only looked has not
   *  moved, and the planner still falls to its answer default. A read that
   *  fails is a tool error the model reads, never a silent blank. */
  private async read(tool: string): Promise<ToolOutcome> {
    if (this.reads === null) return refused("no_reads");
    try {
      const seen =
        tool === SEE_SHELF_TOOL
          ? await this.reads.shelf()
          : await this.reads.state();
      return { content: JSON.stringify(seen), isError: false };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "unknown";
      return refused("read_failed", { detail });
    }
  }

  private recordMove(call: ToolCall): ToolOutcome {
    const recorded = movePlan(call.tool, call.args, this.bounds);
    if (recorded === null) {
      return refused("not_a_turn_tool");
    }
    if (recorded.ok) {
      this.choose(recorded.plan);
    }
    return recorded.outcome;
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
      shop: null,
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
