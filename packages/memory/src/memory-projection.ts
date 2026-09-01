import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventKind, EventPayload, StoredEvent } from "@covenant/domain";
import type { FoldReducer } from "@covenant/ledger";

import type { MemoryRowDraft } from "./memory-row.js";
import { MEMORY_INSERT_SQL, withEventId } from "./memory-row.js";

const EXPIRE_SQL = `UPDATE memory SET t_expired = @t_expired,
  superseded_by = @superseded_by WHERE id = @id AND t_expired IS NULL`;

/** `OR IGNORE` is what makes re-applying one event a no-op (§3.10 rule 3). */
const INSERT_SQL = MEMORY_INSERT_SQL.replace(
  "INSERT INTO",
  "INSERT OR IGNORE INTO",
);

/**
 * Rebuilds the `memory` table from `memory.*` events. A pure reducer: it reads
 * only the event and rows it previously wrote, events arrive strictly by `seq`,
 * re-applying one is a no-op, and the whole table rebuilds from `seq = 1`
 * (§3.10). `write_event_id` comes from `event.id` rather than the payload —
 * the one value guaranteed to agree with what the live write stored.
 */
export class MemoryProjection implements FoldReducer {
  readonly name = "memory";

  readonly kinds: readonly EventKind[] = [
    "memory.write.committed",
    "memory.write.shadowed",
    "memory.write.superseded",
    "memory.invalidated",
  ];

  readonly tables: readonly string[] = ["memory"];

  apply(db: SqliteDatabase, event: StoredEvent): void {
    switch (event.kind) {
      case "memory.write.committed":
      case "memory.write.shadowed":
        this.insert(db, event);
        return;
      case "memory.write.superseded":
        this.supersede(db, event.payload);
        return;
      case "memory.invalidated":
        this.invalidate(db, event.payload);
        return;
      default:
        return;
    }
  }

  /** A dedupe carries the §5.2 f no-op payload: no `entry`, so no row. */
  private insert(db: SqliteDatabase, event: StoredEvent): void {
    const draft = rowIn(event.payload);
    if (draft === null) {
      return;
    }
    db.prepare(INSERT_SQL).run(withEventId(draft, event.id));
  }

  private supersede(db: SqliteDatabase, payload: EventPayload): void {
    const ids = payload["superseded_ids"];
    const tExpired = stringIn(payload, "t_expired");
    const supersededBy = stringIn(payload, "memory_id");
    if (!Array.isArray(ids) || tExpired === null) {
      return;
    }
    const statement = db.prepare(EXPIRE_SQL);
    for (const id of ids) {
      if (typeof id === "string") {
        statement.run({ id, t_expired: tExpired, superseded_by: supersededBy });
      }
    }
  }

  private invalidate(db: SqliteDatabase, payload: EventPayload): void {
    const id = stringIn(payload, "memory_id");
    const tExpired = stringIn(payload, "t_expired");
    if (id === null || tExpired === null) {
      return;
    }
    db.prepare(EXPIRE_SQL).run({
      id,
      t_expired: tExpired,
      superseded_by: stringIn(payload, "superseded_by"),
    });
  }
}

function stringIn(payload: EventPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function rowIn(payload: EventPayload): MemoryRowDraft | null {
  const entry = payload["entry"];
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  return entry as MemoryRowDraft;
}
