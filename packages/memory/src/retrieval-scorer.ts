import type { Clock, MemoryEntry, MemoryType, Tier } from "@covenant/domain";

import { weightFor } from "./weibull-decay.js";

/** §9.3, and the weights are the ranking policy — not a tuning knob. */
export const SCORE_WEIGHTS = {
  cosine: 0.55,
  tier: 0.2,
  decay: 0.15,
  typePrior: 0.1,
} as const;

/**
 * Tier is weighted above recency on purpose: a signed quote from an hour ago
 * must outrank an unsigned scrape from a minute ago. A P0 entry contributes
 * zero tier weight, so even inside `chat` it can only surface on similarity.
 */
export const TIER_WEIGHT: Record<Tier, number> = { 0: 0, 1: 0.5, 2: 0.8, 3: 1 };

export const TYPE_PRIOR: Record<MemoryType, number> = {
  constraint: 1,
  procedure: 0.8,
  fact: 0.7,
  preference: 0.6,
  episode: 0.3,
};

export interface ScoredEntry {
  readonly entry: MemoryEntry;
  readonly cosine: number;
  readonly decayWeight: number;
  readonly score: number;
}

/**
 * Pure: given the same entry, the same cosine and the same clock reading it
 * returns the same score, which is what makes the read gate replayable.
 */
export class RetrievalScorer {
  constructor(private readonly clock: Clock) {}

  /** `decayApplied` comes from `ACTION_POLICY`; `constraint-evaluation` is 1.0. */
  rank(
    candidates: readonly {
      readonly entry: MemoryEntry;
      readonly cosine: number;
    }[],
    decayApplied: boolean,
  ): readonly ScoredEntry[] {
    const now = this.clock.now();
    return candidates
      .map((candidate) =>
        this.score(candidate.entry, candidate.cosine, decayApplied, now),
      )
      .sort(byScoreThenId);
  }

  private score(
    entry: MemoryEntry,
    cosine: number,
    decayApplied: boolean,
    now: Date,
  ): ScoredEntry {
    const decay = decayApplied ? weightFor(entry, now) : 1;
    const score =
      SCORE_WEIGHTS.cosine * clamp(cosine) +
      SCORE_WEIGHTS.tier * TIER_WEIGHT[entry.tier] +
      SCORE_WEIGHTS.decay * decay +
      SCORE_WEIGHTS.typePrior * TYPE_PRIOR[entry.type];
    return { entry, cosine: clamp(cosine), decayWeight: decay, score };
  }
}

function clamp(cosine: number): number {
  if (!Number.isFinite(cosine)) {
    return 0;
  }
  return Math.min(1, Math.max(0, cosine));
}

/** Id breaks ties so a retrieval — and therefore a digest — is stable. */
function byScoreThenId(left: ScoredEntry, right: ScoredEntry): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return left.entry.id < right.entry.id ? -1 : 1;
}
