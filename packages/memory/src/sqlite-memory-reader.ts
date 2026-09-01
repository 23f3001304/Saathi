import type { Database as SqliteDatabase } from "better-sqlite3";

import type {
  ActionPolicy,
  MemoryEntry,
  MemorySearchQuery,
  Sha256Hex,
} from "@covenant/domain";
import { ACTION_POLICY } from "@covenant/domain";

import type {
  MemoryReadSide,
  MemoryRetriever,
  ScoredCandidate,
} from "./memory-ports.js";
import type { MemoryRow } from "./memory-row.js";
import { MEMORY_SELECT_SQL, toMemoryEntry } from "./memory-row.js";
import { buildRetrievalSql } from "./retrieval-query.js";
import type { VecIndex } from "./vec-index.js";
import { cosineOfDistance, lexicalSimilarity } from "./vec-index.js";
import type { SupersedeKey } from "./write-candidate.js";

const LIVE_CONSTRAINTS = `${MEMORY_SELECT_SQL}
 WHERE tenant_id = ? AND user_id = ? AND type = 'constraint' AND t_expired IS NULL`;

const LIVE_ON_KEY = `${MEMORY_SELECT_SQL}
 WHERE tenant_id = ? AND user_id = ? AND subject = ? AND predicate = ?
   AND t_expired IS NULL ORDER BY tier DESC, t_created DESC`;

const LIVE_BY_CONTENT_HASH = `${LIVE_ON_KEY.replace(
  "AND t_expired IS NULL ORDER BY",
  "AND t_expired IS NULL AND content_hash = ? ORDER BY",
)} LIMIT 1`;

/** How many rows scoring sees per requested entry, so ranking has choices. */
const CANDIDATE_FACTOR = 8;
const MAX_CANDIDATES = 2000;

/**
 * The read half: by-id, live constraints, the two supersede-key lookups, the
 * bi-temporal as-of scan, and hybrid vector search. Separate from the writer
 * so `packages/recs` can receive retrieval without receiving the ability to
 * write memory (decision 4, applied to §2.2's split).
 */
export class SqliteMemoryReader implements MemoryReadSide, MemoryRetriever {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly vec: VecIndex,
  ) {}

  getByIds(tenantId: string, ids: readonly string[]): readonly MemoryEntry[] {
    if (ids.length === 0) {
      return [];
    }
    const holes = ids.map(() => "?").join(", ");
    return this.rows(
      `${MEMORY_SELECT_SQL} WHERE tenant_id = ? AND id IN (${holes})`,
      [tenantId, ...ids],
    );
  }

  liveConstraints(tenantId: string, userId: string): readonly MemoryEntry[] {
    return this.rows(LIVE_CONSTRAINTS, [tenantId, userId]);
  }

  liveOnKey(key: SupersedeKey): readonly MemoryEntry[] {
    return this.rows(LIVE_ON_KEY, keyParams(key));
  }

  liveByContentHash(
    key: SupersedeKey,
    contentHash: Sha256Hex,
  ): MemoryEntry | null {
    const found = this.rows(LIVE_BY_CONTENT_HASH, [
      ...keyParams(key),
      contentHash,
    ]);
    return found[0] ?? null;
  }

  /** `MemoryStore.search`: the entries only, for callers that do not rank. */
  async search(query: MemorySearchQuery): Promise<readonly MemoryEntry[]> {
    const scored = await this.retrieve(query);
    return scored.map((candidate) => candidate.entry);
  }

  async retrieve(
    query: MemorySearchQuery,
  ): Promise<readonly ScoredCandidate[]> {
    const policy = ACTION_POLICY[query.actionClass];
    const entries = this.candidatesFor(query, policy);
    const embedding = await this.vec.embed(query.query);
    const hits = new Map(
      this.vec
        .knn(embedding, entries.length)
        .map((hit) => [hit.memoryId, cosineOfDistance(hit.distance)]),
    );
    return entries.map((entry) => ({
      entry,
      cosine:
        hits.get(entry.id) ?? this.fallbackCosine(query, entry, hits.size),
    }));
  }

  private candidatesFor(
    query: MemorySearchQuery,
    policy: ActionPolicy,
  ): readonly MemoryEntry[] {
    const built = buildRetrievalSql(
      policy,
      query.asOf,
      query.actionClass === "price-history",
      query.conversationId,
    );
    const limit = Math.min(query.limit * CANDIDATE_FACTOR, MAX_CANDIDATES);
    return this.rows(built.sql, [
      query.tenantId,
      query.userId,
      ...built.params,
      limit,
    ]);
  }

  /** No vector index (or no hit): the crude lexical share, never a fake score. */
  private fallbackCosine(
    query: MemorySearchQuery,
    entry: MemoryEntry,
    hitCount: number,
  ): number {
    if (hitCount > 0) {
      return 0;
    }
    const text = `${entry.subject ?? ""} ${entry.predicate ?? ""} ${JSON.stringify(entry.content)}`;
    return lexicalSimilarity(query.query, text);
  }

  private rows(
    sql: string,
    params: readonly (string | number)[],
  ): readonly MemoryEntry[] {
    const records = this.db.prepare(sql).all(...params) as MemoryRow[];
    return records.map(toMemoryEntry);
  }
}

function keyParams(key: SupersedeKey): readonly string[] {
  return [key.tenantId, key.userId, key.subject, key.predicate];
}
