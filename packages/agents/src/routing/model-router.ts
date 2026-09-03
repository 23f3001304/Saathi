import { attemptRecordOf } from "./attempt-record.js";
import type { ConfidenceScore } from "./confidence-score.js";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  scoreConfidence,
} from "./confidence-score.js";
import type { ConfidenceSignals } from "./confidence-signals.js";
import { buildLadder, DEFAULT_MAX_ESCALATIONS } from "./escalation-ladder.js";
import type { CatalogModel, ModelCatalogSource } from "./model-catalog.js";
import { modelKeyOf } from "./model-catalog.js";
import { agreementOf } from "./output-checks.js";
import type { RouterStatsStore } from "./outcome-stats.js";
import type {
  RouterAudit,
  RoutingAttemptRecord,
  RoutingDecision,
} from "./router-audit.js";
import type { TaskClass } from "./task-classifier.js";
import { classifyTask, requirementsFor } from "./task-classifier.js";
import type { TaskFeatures, TaskInput } from "./task-features.js";
import { extractFeatures } from "./task-features.js";

export type RoutingRequest = TaskInput;

export interface AttemptOutcome {
  readonly text: string;
  readonly signals: ConfidenceSignals;
}

/** One run of one model. The router never builds a session; it asks for one. */
export interface AttemptRunner {
  run(model: CatalogModel, request: RoutingRequest): Promise<AttemptOutcome>;
}

export interface ModelRouterConfig {
  readonly threshold: number;
  readonly maxEscalations: number;
  /** Classes worth a second cheap sample; everything else pays for one. */
  readonly selfConsistencyClasses: readonly TaskClass[];
  /** The model an operator asked for. It takes the opening rung; nothing else
   *  about the ladder changes. */
  readonly pinnedModel?: string | null;
}

export const DEFAULT_ROUTER_CONFIG: ModelRouterConfig = {
  threshold: DEFAULT_CONFIDENCE_THRESHOLD,
  maxEscalations: DEFAULT_MAX_ESCALATIONS,
  selfConsistencyClasses: ["money"],
  pinnedModel: null,
};

export interface RoutingResult {
  readonly model: CatalogModel;
  readonly text: string;
  readonly confidence: ConfidenceScore;
  readonly decision: RoutingDecision;
}

export class NoCandidateModelError extends Error {
  constructor(readonly taskClass: TaskClass) {
    super(
      `No keyed model can hold a "${taskClass}" turn. ` +
        "Set a provider API key, or lower the class requirements.",
    );
    this.name = "NoCandidateModelError";
  }
}

interface Trial {
  readonly model: CatalogModel;
  readonly text: string;
  readonly score: ConfidenceScore;
}

interface Climb {
  readonly ladder: readonly CatalogModel[];
  readonly request: RoutingRequest;
  readonly runner: AttemptRunner;
  readonly taskClass: TaskClass;
  readonly features: TaskFeatures;
}

/**
 * The hidden half of the product: nobody picks a model, and every rung the
 * cascade climbed is written down. What the router decides is *who answers* —
 * it holds no authority over what an answer is allowed to do, which is why
 * nothing in this class touches a hook, a cap or a tool list.
 */
export class ModelRouter {
  constructor(
    private readonly source: ModelCatalogSource,
    private readonly stats: RouterStatsStore,
    private readonly audit: RouterAudit,
    private readonly config: ModelRouterConfig = DEFAULT_ROUTER_CONFIG,
  ) {}

  async route(
    request: RoutingRequest,
    runner: AttemptRunner,
  ): Promise<RoutingResult> {
    const features = extractFeatures(request);
    const taskClass = classifyTask(features);
    const ladder = buildLadder({
      catalog: await this.source.catalog(),
      requirements: requirementsFor(taskClass, features),
      stats: await this.stats.snapshot(taskClass),
      maxEscalations: this.config.maxEscalations,
      pinned: this.config.pinnedModel ?? null,
    });
    if (ladder.length === 0) {
      throw new NoCandidateModelError(taskClass);
    }
    return this.climb({ ladder, request, runner, taskClass, features });
  }

  private async climb(climb: Climb): Promise<RoutingResult> {
    const attempts: RoutingAttemptRecord[] = [];
    const trials: Trial[] = [];
    for (const model of climb.ladder) {
      const trial = await this.trial(model, climb);
      const accepted = trial.score.value >= this.config.threshold;
      trials.push(trial);
      attempts.push(
        attemptRecordOf({
          model,
          score: trial.score,
          accepted,
          threshold: this.config.threshold,
          last: trials.length === climb.ladder.length,
        }),
      );
      await this.stats.observe({
        taskClass: climb.taskClass,
        modelKey: modelKeyOf(model),
        accepted,
        confidence: trial.score.value,
      });
      if (accepted) {
        break;
      }
    }
    return this.settle(climb, attempts, trials);
  }

  /** No rung cleared τ: the strongest answer the ladder produced still wins,
   *  and `capped` says in the record that it was returned under protest. */
  private settle(
    climb: Climb,
    attempts: readonly RoutingAttemptRecord[],
    trials: readonly Trial[],
  ): RoutingResult {
    const best = [...trials].sort((a, b) => b.score.value - a.score.value)[0];
    if (best === undefined) {
      throw new NoCandidateModelError(climb.taskClass);
    }
    const decision: RoutingDecision = {
      taskClass: climb.taskClass,
      features: climb.features,
      candidates: climb.ladder.map(modelKeyOf),
      chosen: modelKeyOf(best.model),
      attempts,
      escalations: attempts.length - 1,
      capped: !attempts.some((attempt) => attempt.accepted),
      threshold: this.config.threshold,
    };
    this.audit.record(decision);
    return {
      model: best.model,
      text: best.text,
      confidence: best.score,
      decision,
    };
  }

  private async trial(model: CatalogModel, climb: Climb): Promise<Trial> {
    const first = await climb.runner.run(model, climb.request);
    if (!this.wantsSecondSample(climb.taskClass, model)) {
      return { model, text: first.text, score: scoreConfidence(first.signals) };
    }
    const second = await climb.runner.run(model, climb.request);
    const signals: ConfidenceSignals = {
      ...first.signals,
      agreement: agreementOf(first.text, second.text),
    };
    return { model, text: first.text, score: scoreConfidence(signals) };
  }

  /** Never on a premium rung: a second sample there costs more than the
   *  escalation it is trying to avoid. */
  private wantsSecondSample(
    taskClass: TaskClass,
    model: CatalogModel,
  ): boolean {
    return (
      this.config.selfConsistencyClasses.includes(taskClass) &&
      model.capabilities.costTier !== "premium"
    );
  }
}
