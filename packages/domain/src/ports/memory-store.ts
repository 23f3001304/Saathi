import type { ActionClass } from "../action-class.js";
import type { IsoTimestamp } from "../iso-timestamp.js";
import type { MemoryEntry } from "../memory-entry.js";

export const MEMORY_WRITE_STATUSES = [
  "committed",
  "shadowed",
  "quarantined",
  "rejected",
] as const;

export type MemoryWriteStatus = (typeof MEMORY_WRITE_STATUSES)[number];

export interface MemorySearchQuery {
  readonly tenantId: string;
  readonly userId: string;
  readonly query: string;
  readonly actionClass: ActionClass;
  readonly limit: number;
  /** Bi-temporal as-of: "what did we know on day N" (§4.4). */
  readonly asOf: IsoTimestamp | null;
  /**
   * Scope candidates to one conversation *in the query*, not after it. The
   * gate ranks a corpus-wide slice and cuts to `limit` before any caller can
   * filter, so a busy corpus starves an older chat of its own turns — the
   * amnesia loop, third generation. `undefined` keeps the corpus-wide read
   * for the classes that want it.
   */
  readonly conversationId?: string | null;
}

/**
 * Reads are synchronous because they run inside the verify transaction (§5.3);
 * only `search` is async, because it embeds the query text first.
 * Invalidation never deletes — `tExpired` + `supersededBy` replace it (§3.4).
 */
export interface MemoryStore {
  put(entry: MemoryEntry): void;
  getByIds(tenantId: string, ids: readonly string[]): readonly MemoryEntry[];
  liveConstraints(tenantId: string, userId: string): readonly MemoryEntry[];
  invalidate(
    id: string,
    tExpired: IsoTimestamp,
    supersededBy: string | null,
  ): void;
  search(query: MemorySearchQuery): Promise<readonly MemoryEntry[]>;
}
