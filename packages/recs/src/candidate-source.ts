import type { Clock, Embedder, MemoryEntry, MemoryStore } from "@covenant/domain";
import { lexicalSimilarity } from "@covenant/memory";

import { contentScoreOf, cosineSimilarity } from "./content-score.js";

export interface RecsCandidateQuery {
  readonly tenantId: string;
  readonly userId: string;
  readonly category: string | null;
  readonly queryText: string | null;
  readonly limit: number;
}

export interface RankedCandidate {
  readonly entry: MemoryEntry;
  readonly skuId: string;
  readonly merchantId: string | null;
  readonly contentScore: number;
  readonly similarity: number;
  readonly score: number;
}

const WEIGHTS = { content: 0.6, similarity: 0.4 } as const;
const CANDIDATE_FACTOR = 4;
const SHARE_AGGREGATES_PREDICATE = "share_aggregates";

/**
 * Provenance-filtered candidate generation over `memory`
 * (backend-architecture.md section 2.6). Two layers enforce the flywheel's
 * central claim (ARCHITECTURE section 5.8: "provenance-filtered training"):
 * the `recs-training` action class already asks `MemoryStore.search` for
 * tier >= P1, non-quarantined `fact | preference | episode` rows; `isEligible`
 * then narrows to exactly what the design promises trains/serves —
 * **P1+ facts and P3 preferences**, nothing else — so a permissive or buggy
 * store implementation cannot leak a P0 entry into a recommendation even if
 * it ranks first lexically.
 *
 * "Optional embedding similarity ... lexical fallback otherwise": the
 * `Embedder` is the same seam `packages/memory`'s `VecIndex` gates on
 * (absence there is `embedder === null`, section 2.2); when present this
 * class embeds the query and each candidate directly rather than reaching
 * into `packages/memory`'s vector index, because `MemoryStore` (the port
 * this class is typed against, per section 2.6) exposes no embedding or
 * score — only entries.
 */
export class CandidateSource {
  constructor(
    private readonly memory: MemoryStore,
    private readonly embedder: Embedder | null,
    private readonly clock: Clock,
  ) {}

  async findCandidates(
    query: RecsCandidateQuery,
  ): Promise<readonly RankedCandidate[]> {
    const entries = await this.memory.search({
      tenantId: query.tenantId,
      userId: query.userId,
      query: query.queryText ?? query.category ?? "",
      actionClass: "recs-training",
      limit: Math.max(query.limit * CANDIDATE_FACTOR, query.limit),
      asOf: null,
    });
    const text = query.queryText ?? query.category;
    const ranked = await Promise.all(
      entries.filter(isEligible).map((entry) => this.rank(entry, text)),
    );
    return [...ranked]
      .sort((left, right) => right.score - left.score)
      .slice(0, query.limit);
  }

  /** `share_aggregates` is a P3 constraint (ARCHITECTURE section 5.8); this
   * is the one gate a cross-user aggregate may be shown behind. */
  hasShareAggregatesConsent(tenantId: string, userId: string): boolean {
    return this.memory
      .liveConstraints(tenantId, userId)
      .some(
        (entry) =>
          entry.predicate === SHARE_AGGREGATES_PREDICATE &&
          entry.content["value"] === true,
      );
  }

  private async rank(
    entry: MemoryEntry,
    text: string | null,
  ): Promise<RankedCandidate> {
    const contentScore = contentScoreOf(entry, this.clock.now());
    const similarity = await this.similarityOf(entry, text);
    return {
      entry,
      skuId: entry.subject ?? "",
      merchantId: merchantIdOf(entry),
      contentScore,
      similarity,
      score: WEIGHTS.content * contentScore + WEIGHTS.similarity * similarity,
    };
  }

  private async similarityOf(
    entry: MemoryEntry,
    text: string | null,
  ): Promise<number> {
    if (text === null || text.length === 0) {
      return 0;
    }
    const candidateText = textOf(entry);
    if (this.embedder === null) {
      return lexicalSimilarity(text, candidateText);
    }
    const [queryVector, entryVector] = await Promise.all([
      this.embedder.embed(text),
      this.embedder.embed(candidateText),
    ]);
    return cosineSimilarity(queryVector, entryVector);
  }
}

/**
 * ARCHITECTURE section 5.8: "models train only on tier-P1+ facts and P3
 * preferences" — stricter than the `recs-training` action class alone
 * (which admits P1 preferences and episodes too), so this is enforced again
 * here rather than trusted to the store.
 */
function isEligible(entry: MemoryEntry): boolean {
  if (entry.quarantined || entry.subject === null) {
    return false;
  }
  if (entry.type === "fact") {
    return entry.tier >= 1;
  }
  if (entry.type === "preference") {
    return entry.tier === 3;
  }
  return false;
}

function merchantIdOf(entry: MemoryEntry): string | null {
  const value = entry.content["merchant_id"];
  return typeof value === "string" ? value : null;
}

function textOf(entry: MemoryEntry): string {
  return `${entry.subject ?? ""} ${entry.predicate ?? ""} ${JSON.stringify(entry.content)}`;
}
