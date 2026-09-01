import type {
  ConfidenceSignals,
  SchemaOutcome,
  ToolArgsOutcome,
} from "./confidence-signals.js";

/**
 * The cascade's scoring function, `g(query, answer) → [0,1]` in FrugalGPT's
 * notation (Chen, Zaharia & Zou, arXiv:2305.05176 §3.3): query the models in
 * ascending cost, score each answer, return the first whose score clears the
 * threshold τ, otherwise fall through to the next. FrugalGPT trains a DistilBERT
 * regressor for g; we cannot — there is no labelled corpus of covenant turns,
 * and a learned scorer nobody can read is the wrong thing to put in front of a
 * payment. So g here is a fixed weighted sum of signals the harness observes
 * directly, and the weights are constants a reviewer can argue with.
 *
 * The ordering half is RouteLLM's (Ong et al., arXiv:2406.18665): route on a
 * predicted quality signal against a cost preference rather than on cost alone.
 * Ours is the outcome statistics in `outcome-stats.ts`, not a preference-data
 * model — same shape, evidence this system actually has.
 *
 * Weights sum to 1 across all five. Signals a turn cannot produce are dropped
 * and the rest renormalised, so a chat turn with no schema and no tools is not
 * punished for the two components it was never going to have.
 */
export const CONFIDENCE_WEIGHTS = {
  schemaValidation: 0.3,
  toolArguments: 0.25,
  languageCertainty: 0.2,
  selfRated: 0.15,
  selfConsistency: 0.1,
} as const;

/** τ. Below it the router climbs one rung. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.62;

/** Hedges beyond this add nothing: the answer is already uncommitted. */
export const HEDGE_SATURATION = 3;

const SCHEMA_VALUES: Readonly<Record<SchemaOutcome, number | null>> = {
  first_try: 1,
  after_repair: 0.55,
  failed: 0,
  not_required: null,
};

const TOOL_ARG_VALUES: Readonly<Record<ToolArgsOutcome, number | null>> = {
  all: 1,
  some: 0.5,
  none: 0,
  not_required: null,
};

export interface ConfidenceComponent {
  readonly name: string;
  readonly weight: number;
  readonly value: number;
}

export interface ConfidenceScore {
  readonly value: number;
  readonly components: readonly ConfidenceComponent[];
}

function certaintyOf(signals: ConfidenceSignals): number {
  if (signals.refused) {
    return 0;
  }
  return 1 - Math.min(1, signals.hedges / HEDGE_SATURATION);
}

function componentsOf(
  signals: ConfidenceSignals,
): readonly ConfidenceComponent[] {
  const present: ConfidenceComponent[] = [];
  const add = (name: keyof typeof CONFIDENCE_WEIGHTS, value: number | null) => {
    if (value !== null) {
      present.push({ name, weight: CONFIDENCE_WEIGHTS[name], value });
    }
  };
  add("schemaValidation", SCHEMA_VALUES[signals.schema]);
  add("toolArguments", TOOL_ARG_VALUES[signals.toolArgs]);
  add("languageCertainty", certaintyOf(signals));
  add("selfRated", signals.selfRated);
  add("selfConsistency", signals.agreement);
  return present;
}

export function scoreConfidence(signals: ConfidenceSignals): ConfidenceScore {
  const components = componentsOf(signals);
  const total = components.reduce((sum, part) => sum + part.weight, 0);
  if (total === 0) {
    return { value: 0, components };
  }
  const weighted = components.reduce(
    (sum, part) => sum + part.weight * clamp(part.value),
    0,
  );
  return { value: weighted / total, components };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
