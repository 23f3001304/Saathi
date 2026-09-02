import type { TurnPlan, TurnPlanner } from "@covenant/agents";
import type { Logger } from "@covenant/domain";

import { overlong, REGISTER_CORRECTIVE } from "./bubble-register.js";
import { CORRECTIVE, obeys } from "./language-gate.js";

/**
 * The spec gate: prompts kept losing this one, so it is shell law now.
 * Three prompt versions told the planner that a bare family word ('shop an
 * ssd for me') is a question, never an errand, and three live runs drafted
 * or looked anyway. The harness now refuses an acting move when the
 * shopper's own lines carry no distinguishing signal at all: no digit
 * anywhere (a capacity, a size, a budget all carry one), and none of the
 * kind-words a spec is made of. One refusal, one regeneration, the same
 * convention as the language gate; if the model disobeys twice the errand's
 * own clarify gate still stands behind it.
 */
const ACTING: readonly string[] = ["draft_intent", "look_on_web", "browse"];

/**
 * The shell's own question, for a model that refused to ask twice. Generic
 * where the model's would have been expert, but a generic question honestly
 * asked beats an errand honestly wasted: the informed clarify gate at the
 * errand's summary stays the tailored path when this one is answered
 * loosely. Harness copy in the agent's slot, by decision: the alternative
 * was acting on a thing nobody could name.
 */
export const SPEC_ASK =
  "Before I go looking: which kind exactly do you mean, and what is the " +
  "most you want to spend? Size or capacity too, if it matters.";

export const SPEC_CORRECTIVE =
  "The harness refused that move: their words name a product family with " +
  "no distinguishing spec anywhere (no size, capacity, kind, budget or " +
  "colour). This turn must ask the expert clarifying question instead. " +
  "Ask once, everything in one question, likely answers in `replies`.";

/**
 * The same check the errand's commit passes, applied to the planner's.
 *
 * DECISION: at every commit, not only at the one that was failing. The errand
 * was where the measured battery caught it, but the planner writes a sentence
 * too — and the first live run after the errand was fixed answered an English
 * shopper's SSD question with "Amazon par kis type ka SSD aur kitni capacity
 * chahiye?". A rule enforced on one surface is a rule the model can walk
 * around by speaking on the other.
 *
 * DECISION: re-plan rather than re-word. The plan is a tool call — a move plus
 * its sentence — and rewriting only the prose would leave the harness acting
 * on a choice made in one pass and speaking with words from another. The
 * corrective goes in front of the same prompt and the model answers the whole
 * turn again.
 *
 * DECISION: one gate and one retry for both rules the harness holds an
 * ordinary turn to — the language it was asked for, and the register it
 * speaks in. Two gates would mean up to three planner calls for one sentence,
 * and the model would be answering the second complaint having forgotten the
 * first. Language is checked first because a reply in the wrong language is
 * wrong whatever length it is.
 */
export interface PlannedTurn {
  readonly plan: TurnPlan;
  /** True when even the second attempt came back in a language nobody asked
   *  for. The turn still stands; the run says so beside it. */
  readonly slipped: boolean;
}

/** Everything this turn says out loud, which is what the gate reads. */
function spokenBy(plan: TurnPlan): string {
  return `${plan.reply} ${plan.question ?? ""}`.trim();
}

interface Fault {
  /** Prepended to the prompt on the retry. */
  readonly note: string;
  readonly rule: "language" | "register" | "spec";
}

function faultIn(
  plan: TurnPlan,
  replyLanguage: string | null,
  anchor: string,
  vague: boolean,
): Fault | null {
  // The model's own judgement, made a routed fact: an acting move whose
  // plan admits the thing is not settled is a question wearing a search.
  if (vague && ACTING.includes(plan.action) && plan.thingSettled === false) {
    return { note: SPEC_CORRECTIVE, rule: "spec" };
  }
  const spoken = spokenBy(plan);
  if (!obeys(spoken, replyLanguage, anchor)) {
    return { note: CORRECTIVE, rule: "language" };
  }
  return overlong(spoken)
    ? { note: REGISTER_CORRECTIVE, rule: "register" }
    : null;
}

/** Twice refused to ask is where persuasion ends and the shell asks itself:
 *  this rule exists because prompts kept losing it, and a gate that folds
 *  after two tries is a prompt with extra steps. */
function specForced(second: TurnPlan, logger: Logger): PlannedTurn {
  logger.warn("buyer.turn.spec_forced", {});
  return {
    plan: { ...second, action: "answer", reply: SPEC_ASK, question: null, query: null },
    slipped: false,
  };
}

export async function plannedTurn(
  planner: TurnPlanner,
  lines: readonly string[],
  replyLanguage: string | null,
  anchor: string,
  logger: Logger,
  /** The working-context digest, handed to both attempts alike: a retry that
   *  lost the record would re-plan a different, poorer turn. */
  context = "",
): Promise<PlannedTurn> {
  // The gate stands down once options exist: the conversation has ground
  // to act on, and re-asking a settled shopper is its own failure.
  const vague = context === "";
  const first = await planner.plan(lines, replyLanguage, "", context);
  const fault = faultIn(first, replyLanguage, anchor, vague);
  if (fault === null) {
    return { plan: first, slipped: false };
  }
  logger.warn("buyer.turn.rejected", { rule: fault.rule, attempt: 1 });
  const second = await planner.plan(lines, replyLanguage, fault.note, context);
  const again = faultIn(second, replyLanguage, anchor, vague);
  if (again === null) {
    return { plan: second, slipped: false };
  }
  logger.warn("buyer.turn.rejected", { rule: again.rule, attempt: 2 });
  if (again.rule === "spec") return specForced(second, logger);
  // Only a language slip is said out loud. A reply that stayed a sentence too
  // long is worse writing, not a broken promise, and an apology for it would
  // be one more sentence nobody asked for.
  return { plan: second, slipped: again.rule === "language" };
}
