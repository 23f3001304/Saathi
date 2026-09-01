import type {
  MemoryContent,
  MemoryEntry,
  MemoryType,
  Sha256Hex,
  SourceChannel,
  Tier,
} from "@covenant/domain";
import { canonicalize, sha256Hex } from "@covenant/domain";

/**
 * DECISION: a row module beside the two SQLite classes, mirroring `ledger`'s
 * `event-record.ts`. Why: the writer, the reader and `MemoryProjection` must
 * bind the same columns in the same order, and three private copies of that
 * list is exactly where a rebuild starts diverging from live.
 */
export interface MemoryRowDraft {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly type: string;
  readonly tier: number;
  readonly quarantined: number;
  readonly subject: string | null;
  readonly predicate: string | null;
  readonly content: string;
  readonly content_hash: string;
  readonly entry_hash: string;
  readonly source_channel: string;
  readonly source_ref: string | null;
  readonly t_valid: string;
  readonly t_invalid: string | null;
  readonly t_created: string;
  readonly t_expired: string | null;
  readonly superseded_by: string | null;
}

export interface MemoryRow extends MemoryRowDraft {
  readonly write_event_id: string;
}

/** DDL order (§3.4). Insert and rebuild bind by name off this one listing. */
export const MEMORY_COLUMNS = [
  "id",
  "tenant_id",
  "user_id",
  "type",
  "tier",
  "quarantined",
  "subject",
  "predicate",
  "content",
  "content_hash",
  "entry_hash",
  "source_channel",
  "source_ref",
  "t_valid",
  "t_invalid",
  "t_created",
  "t_expired",
  "superseded_by",
  "write_event_id",
] as const;

export const MEMORY_INSERT_SQL = `INSERT INTO memory (${MEMORY_COLUMNS.join(", ")})
VALUES (${MEMORY_COLUMNS.map((column) => `@${column}`).join(", ")})`;

export const MEMORY_SELECT_SQL = `SELECT ${MEMORY_COLUMNS.join(", ")} FROM memory`;

/** `sha256(canonicalize(content))` — the write-time dedupe key (§9.1 4a). */
export function contentHashOf(content: MemoryContent): Sha256Hex {
  return sha256Hex(canonicalize(content));
}

export function toRowDraft(entry: MemoryEntry): MemoryRowDraft {
  return {
    id: entry.id,
    tenant_id: entry.tenantId,
    user_id: entry.userId,
    type: entry.type,
    tier: entry.tier,
    quarantined: entry.quarantined ? 1 : 0,
    subject: entry.subject,
    predicate: entry.predicate,
    content: canonicalize(entry.content),
    content_hash: entry.contentHash,
    entry_hash: entry.entryHash,
    source_channel: entry.sourceChannel,
    source_ref: entry.sourceRef,
    t_valid: entry.tValid,
    t_invalid: entry.tInvalid,
    t_created: entry.tCreated,
    t_expired: entry.tExpired,
    superseded_by: entry.supersededBy,
  };
}

export function withEventId(
  draft: MemoryRowDraft,
  writeEventId: string,
): MemoryRow {
  return { ...draft, write_event_id: writeEventId };
}

/**
 * The read boundary. A row whose `content` is not a JSON object is a corrupted
 * store, not a value to coerce — the DDL's `json_valid` CHECK says so too.
 */
export function toMemoryEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    type: row.type as MemoryType,
    tier: row.tier as Tier,
    quarantined: row.quarantined === 1,
    subject: row.subject,
    predicate: row.predicate,
    content: parseContent(row),
    contentHash: row.content_hash,
    entryHash: row.entry_hash,
    sourceChannel: row.source_channel as SourceChannel,
    sourceRef: row.source_ref,
    tValid: row.t_valid,
    tInvalid: row.t_invalid,
    tCreated: row.t_created,
    tExpired: row.t_expired,
    supersededBy: row.superseded_by,
    writeEventId: row.write_event_id,
  };
}

function parseContent(row: MemoryRowDraft): MemoryContent {
  const parsed: unknown = JSON.parse(row.content);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RangeError(`memory[${row.id}]: content is not a JSON object`);
  }
  return parsed as MemoryContent;
}
