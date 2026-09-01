import type { CatalogModel } from "./model-catalog.js";
import { costRankOf, modelKeyOf } from "./model-catalog.js";
import type { ModelOutcomeStat } from "./outcome-stats.js";
import { statFor, successRateOf } from "./outcome-stats.js";
import type { ClassRequirements } from "./task-classifier.js";
import type { TaskFeatures } from "./task-features.js";

/** At most three models see one turn. A pathological request cannot walk the
 *  whole ladder and bill the operator for every rung of it. */
export const DEFAULT_MAX_ESCALATIONS = 2;

/** Below this, with enough evidence, a model sinks to the back of its tier. */
export const DEMOTION_FLOOR = 0.4;

export const MIN_OBSERVATIONS = 3;

/** A tie inside a tier goes to the model trained for the script in front of it. */
export const INDIC_BONUS = 0.1;

/**
 * Capabilities are facts and are never waived. The cost floor is not a fact —
 * it is this file's heuristic that "a settlement turn does not start on the
 * cheapest thing with a pulse" — so an operator who names a model has already
 * made that judgement themselves and the floor steps aside for it. A pin can
 * therefore choose a cheap model for a money turn; it can never choose one
 * that cannot call a tool.
 */
function capable(
  model: CatalogModel,
  requirements: ClassRequirements,
): boolean {
  const caps = model.capabilities;
  return (
    caps.contextWindow >= requirements.minContextWindow &&
    (!requirements.toolCalling || caps.toolCalling) &&
    (!requirements.structuredOutput || caps.structuredOutput) &&
    (!requirements.indic || caps.indic)
  );
}

export function admissible(
  model: CatalogModel,
  requirements: ClassRequirements,
  named = false,
): boolean {
  const affordable =
    named ||
    costRankOf(model.capabilities.costTier) >=
      costRankOf(requirements.minCostTier);
  return affordable && capable(model, requirements);
}

export interface LadderRequest {
  readonly catalog: readonly CatalogModel[];
  readonly requirements: ClassRequirements;
  readonly features: TaskFeatures;
  readonly stats: readonly ModelOutcomeStat[];
  readonly maxEscalations: number;
  /**
   * An operator naming the model they want to see. It takes the first rung
   * when it is admissible, and that is all it does: the rest of the ladder is
   * unchanged, so a low-confidence answer still escalates. A pin chooses who
   * goes first, never what is permitted — the same rule the statistics follow.
   *
   * A pin that no keyed provider can serve, or that the class rules out, is
   * ignored rather than obeyed: silently running a model the task needs
   * capabilities beyond would be a worse answer than not honouring a
   * preference.
   */
  readonly pinned?: string | null;
}

interface Ranked {
  readonly model: CatalogModel;
  readonly rank: number;
  readonly priority: number;
}

function rankOf(model: CatalogModel, request: LadderRequest): Ranked {
  const key = modelKeyOf(model);
  const stat = statFor(request.stats, key);
  const rate = successRateOf(stat);
  const demoted =
    (stat?.attempts ?? 0) >= MIN_OBSERVATIONS && rate < DEMOTION_FLOOR;
  const indicWanted = request.features.script !== "latin";
  const bonus = indicWanted && model.capabilities.indic ? INDIC_BONUS : 0;
  return {
    model,
    rank: costRankOf(model.capabilities.costTier) + (demoted ? 1 : 0),
    priority: rate + bonus,
  };
}

function compare(left: Ranked, right: Ranked): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  if (left.priority !== right.priority) {
    return right.priority - left.priority;
  }
  return modelKeyOf(left.model).localeCompare(modelKeyOf(right.model));
}

/**
 * FrugalGPT's cascade is strictly ascending in cost; RouteLLM's router picks on
 * a learned quality signal. This is both, in that order of authority: cost tier
 * decides the rung, the outcome statistics decide who holds it, and a model
 * with a demonstrated failure rate is pushed up a tier rather than being struck
 * off — the evidence changes who goes first, never what is permitted.
 *
 * Cold start is therefore the pure cascade: with no observations every model
 * scores `COLD_START_RATE`, so the ladder is cheapest-capable-first.
 */
/**
 * The pin takes the opening rung, and everything above it stays above it.
 *
 * Sorting is cheapest-capable-first, so pinning a mid-tier model and leaving
 * the rest alone made rung two the *cheapest* model in the catalog: a live run
 * pinned to `gpt-5.6-luna` escalated to `gpt-5-nano`, which is a demotion
 * wearing an escalation's name. Escalation must ascend, so the rungs behind a
 * pin are only those at least as capable as the pin itself.
 */
function pinnedFirst(
  rungs: readonly Ranked[],
  pinned: string | null | undefined,
): readonly Ranked[] {
  if (pinned === null || pinned === undefined || pinned === "") return rungs;
  const wanted = rungs.find((rung) => rung.model.id === pinned);
  if (wanted === undefined) return rungs;
  const above = rungs.filter(
    (rung) => rung !== wanted && rung.rank >= wanted.rank,
  );
  return [wanted, ...above];
}

export function buildLadder(request: LadderRequest): readonly CatalogModel[] {
  const pinned = request.pinned ?? null;
  const rungs = request.catalog
    .filter((model) =>
      admissible(model, request.requirements, model.id === pinned),
    )
    .map((model) => rankOf(model, request))
    .sort(compare);
  return pinnedFirst(rungs, pinned)
    .slice(0, Math.max(1, request.maxEscalations + 1))
    .map((rung) => rung.model);
}
