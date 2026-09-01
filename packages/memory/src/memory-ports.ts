import type {
  IsoTimestamp,
  MemoryEntry,
  MemorySearchQuery,
  Sha256Hex,
  Tier,
} from "@covenant/domain";

import type { SupersedeKey } from "./write-candidate.js";

/**
 * DECISION: the gates are injected with these two halves rather than with
 * `domain`'s `MemoryStore` port. Why: §2.2 splits the store into a reader and
 * a writer, and §9.1 stage 4 needs two lookups the port does not expose — the
 * live rows on a supersede key and the live row carrying a content hash. The
 * halves are supersets of the port, so the composition root's facade (decision
 * 5) still satisfies `MemoryStore` by spreading both.
 */
export interface MemoryReadSide {
  getByIds(tenantId: string, ids: readonly string[]): readonly MemoryEntry[];
  /** Live P3 constraints for the user — `idx_memory_constraints`. */
  liveConstraints(tenantId: string, userId: string): readonly MemoryEntry[];
  /** Live rows the guarded UPDATE of §5.2 f would consider. */
  liveOnKey(key: SupersedeKey): readonly MemoryEntry[];
  liveByContentHash(
    key: SupersedeKey,
    contentHash: Sha256Hex,
  ): MemoryEntry | null;
}

/** What supersede is guarded on: higher tier wins, equal tier → later write. */
export interface SupersedeGuard {
  readonly newId: string;
  readonly newTier: Tier;
  readonly newTCreated: IsoTimestamp;
  readonly now: IsoTimestamp;
}

export interface MemoryWriteSide {
  /** The embedding is pre-computed: §5.3 forbids an `await` inside the txn. */
  put(entry: MemoryEntry, embedding?: Float32Array | null): void;
  supersede(key: SupersedeKey, guard: SupersedeGuard): readonly string[];
  invalidate(
    id: string,
    tExpired: IsoTimestamp,
    supersededBy: string | null,
  ): void;
}

export interface ScoredCandidate {
  readonly entry: MemoryEntry;
  /** `0` when `sqlite-vec` is absent and the lexical fallback found nothing. */
  readonly cosine: number;
}

/**
 * DECISION: `ReadGate` takes a `MemoryRetriever` rather than `MemoryStore`.
 * Why: §9.3's score is `0.55·cosine + …`, and `MemoryStore.search` returns
 * entries without the similarity that produced them — recomputing it in the
 * gate would mean a second embedding pass per retrieval.
 */
export interface MemoryRetriever {
  retrieve(query: MemorySearchQuery): Promise<readonly ScoredCandidate[]>;
}
