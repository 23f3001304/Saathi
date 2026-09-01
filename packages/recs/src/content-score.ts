import type { MemoryEntry, MemoryType, Tier } from "@covenant/domain";

/**
 * Cold-start content ranking (ARCHITECTURE section 5.8: "content-based over
 * typed facts"). Pure functions only — no collaborators, so `CandidateSource`
 * can call them without widening its own constructor.
 */

const TYPE_WEIGHT: Record<MemoryType, number> = {
  fact: 0.7,
  preference: 0.6,
  constraint: 0,
  episode: 0,
  procedure: 0,
};

const TIER_WEIGHT: Record<Tier, number> = { 0: 0, 1: 0.5, 2: 0.8, 3: 1 };

/** Half-life recency decay, independent of `packages/memory`'s Weibull decay:
 * recs ranks candidates for serving, not retrieval for a cart digest. */
const RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

const CONTENT_WEIGHTS = { type: 0.3, tier: 0.4, recency: 0.3 } as const;

export function contentScoreOf(entry: MemoryEntry, now: Date): number {
  const recency = recencyWeight(entry.tCreated, now);
  return (
    CONTENT_WEIGHTS.type * TYPE_WEIGHT[entry.type] +
    CONTENT_WEIGHTS.tier * TIER_WEIGHT[entry.tier] +
    CONTENT_WEIGHTS.recency * recency
  );
}

function recencyWeight(tCreated: string, now: Date): number {
  const ageMs = Math.max(0, now.getTime() - Date.parse(tCreated));
  return Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
}

/** Cosine similarity between two embeddings; `0` on a dimension mismatch. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  const { dot, normA, normB } = accumulate(a, b);
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : clamp(dot / denominator);
}

function accumulate(
  a: Float32Array,
  b: Float32Array,
): { dot: number; normA: number; normB: number } {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  return { dot, normA, normB };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
