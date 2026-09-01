import type {
  IsoTimestamp,
  MemoryEntry,
  MemorySearchQuery,
  MemoryStore,
} from "@covenant/domain";
import type { SqliteMemoryReader, SqliteMemoryWriter } from "@covenant/memory";

/**
 * `packages/gateway` receives its store through the domain `MemoryStore` port
 * (its suite injects a fake for exactly this reason), while `packages/memory`
 * splits the same surface into a read side and a write side. The join is a
 * composition-root concern, so it lives here: §2.8's "memory reader/writer
 * facade", and nothing but delegation.
 */
export class MemoryStoreFacade implements MemoryStore {
  constructor(
    private readonly reader: SqliteMemoryReader,
    private readonly writer: SqliteMemoryWriter,
  ) {}

  put(entry: MemoryEntry): void {
    this.writer.put(entry, null);
  }

  getByIds(tenantId: string, ids: readonly string[]): readonly MemoryEntry[] {
    return this.reader.getByIds(tenantId, ids);
  }

  liveConstraints(tenantId: string, userId: string): readonly MemoryEntry[] {
    return this.reader.liveConstraints(tenantId, userId);
  }

  invalidate(
    id: string,
    tExpired: IsoTimestamp,
    supersededBy: string | null,
  ): void {
    this.writer.invalidate(id, tExpired, supersededBy);
  }

  search(query: MemorySearchQuery): Promise<readonly MemoryEntry[]> {
    return this.reader.search(query);
  }
}
