import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Embedder, Logger } from "@covenant/domain";

export interface VecHit {
  readonly memoryId: string;
  readonly distance: number;
}

const EXTENSION_PROBE =
  "SELECT 1 AS present FROM sqlite_master WHERE name = 'memory_vec'";

const UPSERT_SQL = `INSERT INTO memory_vec (memory_id, embedding) VALUES (?, ?)
ON CONFLICT(memory_id) DO UPDATE SET embedding = excluded.embedding`;

const KNN_SQL = `SELECT memory_id AS memoryId, distance FROM memory_vec
WHERE embedding MATCH ? AND k = ?`;

/**
 * `sqlite-vec` adapter over the `vec0` virtual table of §3.5, with a lexical
 * fallback when the extension is absent. Absence is a degraded ranking, never
 * an error: `DatabaseFactory` treats the extension path as nullable (§2.1), so
 * a machine without it still runs the whole write gate, the whole read gate
 * and the replay proof — retrieval simply falls back to type, tier and
 * recency, which is where §9.3 puts the load-bearing weight anyway.
 */
export class VecIndex {
  private present: boolean | null = null;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly embedder: Embedder | null,
    private readonly logger: Logger,
  ) {}

  available(): boolean {
    this.present ??= this.probe();
    return this.present && this.embedder !== null;
  }

  /** Awaited by the caller **before** `BEGIN IMMEDIATE` (§5.3: no await in a txn). */
  async embed(text: string): Promise<Float32Array | null> {
    if (this.embedder === null) {
      return null;
    }
    return normalize(await this.embedder.embed(text));
  }

  upsert(memoryId: string, embedding: Float32Array | null): void {
    if (embedding === null || !this.available()) {
      return;
    }
    this.db.prepare(UPSERT_SQL).run(memoryId, Buffer.from(embedding.buffer));
  }

  knn(embedding: Float32Array | null, k: number): readonly VecHit[] {
    if (embedding === null || !this.available()) {
      return [];
    }
    return this.db
      .prepare(KNN_SQL)
      .all(Buffer.from(embedding.buffer), k) as VecHit[];
  }

  private probe(): boolean {
    const row = this.db.prepare(EXTENSION_PROBE).get();
    const found = row !== undefined;
    if (!found) {
      this.logger.info("memory.vec.absent", { fallback: "lexical" });
    }
    return found;
  }
}

/** vec0 reports L2 over unit vectors, so `cos = 1 − d²/2`. */
export function cosineOfDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - (distance * distance) / 2));
}

const TOKEN = /[a-z0-9]+/g;

function tokensOf(text: string): ReadonlySet<string> {
  return new Set(text.toLowerCase().match(TOKEN) ?? []);
}

/**
 * The fallback similarity: the share of the query's tokens the entry carries.
 * Deliberately crude — retrieval quality is an explicit non-goal, and a
 * fallback that pretended to be a vector index would hide the degradation.
 */
export function lexicalSimilarity(query: string, text: string): number {
  const wanted = tokensOf(query);
  if (wanted.size === 0) {
    return 0;
  }
  const have = tokensOf(text);
  let hits = 0;
  for (const token of wanted) {
    hits += have.has(token) ? 1 : 0;
  }
  return hits / wanted.size;
}

function normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const component of vector) {
    sum += component * component;
  }
  const length = Math.sqrt(sum);
  if (length === 0) {
    return vector;
  }
  return vector.map((component) => component / length);
}
