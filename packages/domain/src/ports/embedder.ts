/**
 * Text → dense vector. The default adapter is a deterministic local
 * character-n-gram feature-hashing embedder, so CI and the replay proof need
 * no network and no model download (§3.5, decision 12).
 */
export interface Embedder {
  embed(text: string): Promise<Float32Array>;
}

/** The `memory_vec` virtual table declares `FLOAT[384]` (§3.5). */
export const EMBEDDING_DIMENSIONS = 384;
