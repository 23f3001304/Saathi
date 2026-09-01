import { capabilitiesFor } from "../src/routing/capability-table.js";
import type { ConfidenceSignals } from "../src/routing/confidence-signals.js";
import { buildLadder } from "../src/routing/escalation-ladder.js";
import type { CatalogModel } from "../src/routing/model-catalog.js";
import {
  modelKeyOf,
  StaticCatalogSource,
} from "../src/routing/model-catalog.js";
import type { AttemptRunner } from "../src/routing/model-router.js";
import {
  DEFAULT_ROUTER_CONFIG,
  ModelRouter,
} from "../src/routing/model-router.js";
import { InMemoryRouterStats } from "../src/routing/outcome-stats.js";
import type { RoutingDecision } from "../src/routing/router-audit.js";
import { requirementsFor } from "../src/routing/task-classifier.js";
import { extractFeatures } from "../src/routing/task-features.js";

type Provider = "openai" | "sarvam" | "claude";

export function modelOf(provider: Provider, id: string): CatalogModel {
  return {
    provider,
    id,
    capabilities: capabilitiesFor(provider, id),
    source: "manifest",
  };
}

export const LUNA = modelOf("openai", "gpt-5.6-luna");
export const TERRA = modelOf("openai", "gpt-5.6-terra");
export const SOL = modelOf("openai", "gpt-5.6-sol");
export const SARVAM = modelOf("sarvam", "sarvam-105b-conversations");
export const OPENAI_ONLY = [SOL, TERRA, LUNA];
export const MIXED = [...OPENAI_ONLY, SARVAM];

export const RETRIEVAL = {
  prompt: "search the catalog for a brass lamp",
  availableTools: ["mcp__covenant_merchant__catalog_search"],
  requiresStructuredOutput: false,
};

type Stats = Parameters<typeof buildLadder>[0]["stats"];

export function ladderFor(
  prompt: string,
  stats: Stats = [],
  catalog: readonly CatalogModel[] = OPENAI_ONLY,
): readonly CatalogModel[] {
  const features = extractFeatures({ ...RETRIEVAL, prompt });
  return buildLadder({
    catalog,
    requirements: requirementsFor("retrieval", features),
    features,
    stats,
    maxEscalations: 2,
  });
}

export function signals(
  overrides: Partial<ConfidenceSignals> = {},
): ConfidenceSignals {
  return {
    schema: "not_required",
    toolArgs: "not_required",
    hedges: 0,
    refused: false,
    selfRated: null,
    agreement: null,
    ...overrides,
  };
}

export const CONFIDENT = signals();

/** A refusal scores zero, which is the cheapest way to force an escalation. */
export const UNCERTAIN = signals({ refused: true });

export class ScriptedAttempts implements AttemptRunner {
  readonly seen: string[] = [];

  constructor(
    private readonly scores: Readonly<Record<string, ConfidenceSignals>>,
  ) {}

  async run(candidate: CatalogModel) {
    const key = modelKeyOf(candidate);
    this.seen.push(key);
    const scripted = this.scores[key];
    if (scripted === undefined) {
      throw new Error(`no scripted signals for ${key}`);
    }
    return { text: `answer from ${candidate.id}`, signals: scripted };
  }
}

export function routerOf(catalog: readonly CatalogModel[] = OPENAI_ONLY) {
  const decisions: RoutingDecision[] = [];
  const stats = new InMemoryRouterStats();
  const router = new ModelRouter(
    new StaticCatalogSource(catalog),
    stats,
    { record: (decision) => void decisions.push(decision) },
    DEFAULT_ROUTER_CONFIG,
  );
  return { router, decisions, stats };
}
