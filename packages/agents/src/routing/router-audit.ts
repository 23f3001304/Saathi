import type { AgentProviderId } from "../providers/provider-config.js";
import type { ConfidenceComponent } from "./confidence-score.js";
import type { CatalogSource } from "./model-catalog.js";
import type { TaskClass } from "./task-classifier.js";
import type { TaskFeatures } from "./task-features.js";

export interface RoutingAttemptRecord {
  readonly provider: AgentProviderId;
  readonly model: string;
  readonly source: CatalogSource;
  readonly confidence: number;
  readonly components: readonly ConfidenceComponent[];
  readonly accepted: boolean;
  /** Why the router climbed off this rung; `null` when it did not. */
  readonly escalatedBecause: string | null;
}

export interface RoutingDecision {
  readonly taskClass: TaskClass;
  readonly features: TaskFeatures;
  /** Every model considered, in ladder order. */
  readonly candidates: readonly string[];
  readonly chosen: string;
  readonly attempts: readonly RoutingAttemptRecord[];
  readonly escalations: number;
  /** `true` when the ladder ran out before the threshold was met. */
  readonly capped: boolean;
  readonly threshold: number;
}

/**
 * The router is invisible in the UI. It is not invisible in the record: this
 * port is how every decision — the candidates, the class, the score with its
 * components, and each escalation with its reason — reaches the journal. A
 * routing layer nobody can read afterwards is a routing layer nobody can
 * challenge, and this project's whole claim is that the machine's reasons stay
 * inspectable.
 */
export interface RouterAudit {
  record(decision: RoutingDecision): void;
}

/** For tests and for callers that route before a journal exists. */
export const NULL_ROUTER_AUDIT: RouterAudit = { record: () => undefined };
