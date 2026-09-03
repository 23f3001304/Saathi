import type { AgentProviderId } from "../providers/provider-config.js";

/** Ascending spend. The cascade climbs this order and never descends. */
export const COST_TIERS = ["economy", "standard", "premium"] as const;

export type CostTier = (typeof COST_TIERS)[number];

export const LATENCY_TIERS = ["fast", "medium", "slow"] as const;

export type LatencyTier = (typeof LATENCY_TIERS)[number];

/**
 * What a model can do, as the router needs to know it. Deliberately coarse:
 * the router picks between families, and a field it cannot fill honestly for
 * every family it lists is a field that would make the comparison a fiction.
 */
export interface ModelCapabilities {
  readonly contextWindow: number;
  readonly toolCalling: boolean;
  readonly structuredOutput: boolean;
  readonly vision: boolean;
  readonly costTier: CostTier;
  readonly latencyTier: LatencyTier;
}

/** Where the id came from: the provider's own list, or the offline manifest. */
export type CatalogSource = "discovered" | "manifest";

export interface CatalogModel {
  readonly provider: AgentProviderId;
  readonly id: string;
  readonly capabilities: ModelCapabilities;
  readonly source: CatalogSource;
}

/** The key the outcome statistics and the audit record both use. */
export function modelKeyOf(model: CatalogModel): string {
  return `${model.provider}:${model.id}`;
}

export function costRankOf(tier: CostTier): number {
  return COST_TIERS.indexOf(tier);
}

/** The catalog behind a port so the router never learns about HTTP or env. */
export interface ModelCatalogSource {
  catalog(): Promise<readonly CatalogModel[]>;
}

export class StaticCatalogSource implements ModelCatalogSource {
  constructor(private readonly models: readonly CatalogModel[]) {}

  async catalog(): Promise<readonly CatalogModel[]> {
    return this.models;
  }
}
