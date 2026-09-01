import type { Tracer } from "@covenant/domain";

import type { CandidateSource, RankedCandidate } from "./candidate-source.js";
import type { KAnonymitySummary } from "./k-anonymizer-summary.js";
import { toSummary } from "./k-anonymizer-summary.js";
import type { AggregateGate, KAnonymizer } from "./k-anonymizer.js";
import type { PriceAnchorAnalyzer } from "./price-anchor-analyzer.js";
import type { RegretWeighter, WeightableCandidate } from "./regret-weighter.js";

export interface RecsRequest {
  readonly tenantId: string;
  readonly userId: string;
  readonly category: string | null;
  readonly limit: number;
}

export interface RecommendationItem {
  readonly sku_id: string;
  readonly merchant_id: string | null;
  readonly current_price_paise: number | null;
  readonly score: number;
  readonly reason: string;
}

/** The `GET /recs` response body, verbatim (backend-architecture.md section 4.10). */
export interface RecsResponse {
  readonly items: readonly RecommendationItem[];
  readonly sort_key: "score";
  readonly k_anonymity: KAnonymitySummary;
}

const DEFAULT_LIMIT = 10;

/**
 * `GET /recs` use case: candidates -> trust -> regret weighting ->
 * k-anonymised response (backend-architecture.md section 2.6). The trust and
 * regret-weighting steps live in `RegretWeighter` (it already holds the
 * read-only `Database` both signals are read from); this class is the
 * ordering and the consent gate.
 */
export class RecommendationService {
  constructor(
    private readonly candidates: CandidateSource,
    private readonly regret: RegretWeighter,
    private readonly kAnonymizer: KAnonymizer,
    private readonly prices: PriceAnchorAnalyzer,
    private readonly tracer: Tracer,
  ) {}

  async recommend(request: RecsRequest): Promise<RecsResponse> {
    const span = this.tracer.startSpan("recs.recommend", {
      tenant_id: request.tenantId,
    });
    try {
      const response = await this.build(request);
      span.setStatus("ok");
      return response;
    } catch (error) {
      span.setStatus("error");
      span.recordException(error instanceof Error ? error : new Error("recs.recommend"));
      throw error;
    } finally {
      span.end();
    }
  }

  private async build(request: RecsRequest): Promise<RecsResponse> {
    const limit = request.limit > 0 ? request.limit : DEFAULT_LIMIT;
    const ranked = await this.candidates.findCandidates({
      tenantId: request.tenantId,
      userId: request.userId,
      category: request.category,
      queryText: request.category,
      limit,
    });
    const gate = this.aggregateGate(request);
    const weighted = gate.allowed
      ? this.regret.reweight(request.tenantId, request.userId, toWeightable(ranked))
      : toWeightable(ranked);
    const items = this.itemsFor(request.tenantId, ranked, weighted, limit);
    return { items, sort_key: "score", k_anonymity: toSummary(gate) };
  }

  private aggregateGate(request: RecsRequest): AggregateGate {
    const consented = this.candidates.hasShareAggregatesConsent(
      request.tenantId,
      request.userId,
    );
    const contributors = this.regret.distinctContributors(request.tenantId);
    return this.kAnonymizer.gate(consented, contributors);
  }

  private itemsFor(
    tenantId: string,
    ranked: readonly RankedCandidate[],
    weighted: readonly WeightableCandidate[],
    limit: number,
  ): readonly RecommendationItem[] {
    return weighted
      .map((candidate, index) => this.itemFor(tenantId, ranked[index], candidate))
      .filter((item): item is RecommendationItem => item !== null)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  private itemFor(
    tenantId: string,
    source: RankedCandidate | undefined,
    weighted: WeightableCandidate,
  ): RecommendationItem | null {
    if (source === undefined) {
      return null;
    }
    return {
      sku_id: weighted.skuId,
      merchant_id: weighted.merchantId,
      current_price_paise: this.currentPriceOf(tenantId, weighted.skuId),
      score: weighted.score,
      reason: reasonFor(source),
    };
  }

  private currentPriceOf(tenantId: string, skuId: string): number | null {
    const points = this.prices.priceHistoryFor(tenantId, skuId, 1).points;
    return points.at(-1)?.price_paise ?? null;
  }
}

function toWeightable(
  ranked: readonly RankedCandidate[],
): readonly WeightableCandidate[] {
  return ranked.map((candidate) => ({
    skuId: candidate.skuId,
    merchantId: candidate.merchantId,
    score: candidate.score,
  }));
}

function reasonFor(candidate: RankedCandidate): string {
  return candidate.similarity > 0
    ? `${candidate.entry.type}:${candidate.entry.predicate ?? "match"}`
    : `${candidate.entry.type}:tier-${candidate.entry.tier}`;
}
