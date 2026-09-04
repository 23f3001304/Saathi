import type { CatalogModel } from "./model-catalog.js";
import type { TaskInput } from "./task-features.js";
import type { TaskClass } from "./task-classifier.js";
import type { ConfidenceSignals } from "./confidence-signals.js";

export type RoutingRequest = TaskInput;

/** One run of one model. The router never builds a session; it asks for one. */
export interface AttemptOutcome {
  readonly text: string;
  readonly signals: ConfidenceSignals;
}

/**
 * How the router asks for one attempt. Split from `model-router.ts` because it
 * is the contract between the router and whatever runs a turn, and the router
 * is the only thing in this package that implements neither side of it.
 */
export interface AttemptRunner {
  /** `taskClass` is the router's own classification, passed on rather than
   *  re-derived: it is what decides how hard this turn is worth thinking
   *  about (`class-effort.ts`). The router still holds no authority over what
   *  an answer may DO - this only sets the effort the model is asked for. */
  run(
    model: CatalogModel,
    request: RoutingRequest,
    taskClass: TaskClass,
  ): Promise<AttemptOutcome>;
}
