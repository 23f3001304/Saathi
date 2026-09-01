import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { IsoTimestamp, MemoryEntry } from "@covenant/domain";

import type { MemoryWriteSide, SupersedeGuard } from "./memory-ports.js";
import { MEMORY_INSERT_SQL, toRowDraft, withEventId } from "./memory-row.js";
import type { VecIndex } from "./vec-index.js";
import type { SupersedeKey } from "./write-candidate.js";

/**
 * The guarded UPDATE of §5.2 f: higher tier wins, and an equal tier is broken
 * by the later `t_created`. `id != @new_id` is the one addition — the new row
 * is inserted first so `superseded_by` satisfies its foreign key, and without
 * the guard the write would supersede itself.
 */
const SUPERSEDE_WHERE = `WHERE tenant_id = @tenant_id AND user_id = @user_id
   AND subject = @subject AND predicate = @predicate
   AND t_expired IS NULL AND id != @new_id
   AND ( tier < @new_tier
      OR (tier = @new_tier AND t_created <= @new_t_created) )`;

const SUPERSEDE_SELECT = `SELECT id FROM memory ${SUPERSEDE_WHERE}`;

const SUPERSEDE_UPDATE = `UPDATE memory
   SET t_expired = @now, superseded_by = @new_id
 ${SUPERSEDE_WHERE}`;

const INVALIDATE_SQL = `UPDATE memory SET t_expired = @t_expired,
  superseded_by = @superseded_by WHERE id = @id AND t_expired IS NULL`;

/**
 * The write half of `MemoryStore`: insert, supersede, invalidate — never
 * delete. `memory_no_delete` and `memory_frozen_columns` (§3.4) are live, so a
 * statement outside these three aborts with `E_MEMORY_IMMUTABLE`, which is the
 * tamper-evidence claim being enforced by the database rather than by review.
 *
 * DECISION: §2.2's `Clock` collaborator is dropped. Why: one write must stamp
 * `t_created` on the new row and `t_expired` on the rows it supersedes with
 * the *same* instant, so the gate reads the clock once and passes it down;
 * a clock here would give the two stamps different readings.
 */
export class SqliteMemoryWriter implements MemoryWriteSide {
  private readonly cache = new Map<string, Statement>();

  constructor(
    private readonly db: SqliteDatabase,
    private readonly vec: VecIndex,
  ) {}

  /** Runs inside the caller's `BEGIN IMMEDIATE`; the embedding is pre-computed. */
  put(entry: MemoryEntry, embedding: Float32Array | null = null): void {
    const row = withEventId(toRowDraft(entry), entry.writeEventId);
    this.statement(MEMORY_INSERT_SQL).run(row);
    this.vec.upsert(entry.id, embedding);
  }

  supersede(key: SupersedeKey, guard: SupersedeGuard): readonly string[] {
    const params = {
      tenant_id: key.tenantId,
      user_id: key.userId,
      subject: key.subject,
      predicate: key.predicate,
      new_id: guard.newId,
      new_tier: guard.newTier,
      new_t_created: guard.newTCreated,
      now: guard.now,
    };
    const victims = this.statement(SUPERSEDE_SELECT).all(params) as {
      readonly id: string;
    }[];
    this.statement(SUPERSEDE_UPDATE).run(params);
    return victims.map((victim) => victim.id);
  }

  /** `t_expired` + `superseded_by` replace row deletion (§3.4). */
  invalidate(
    id: string,
    tExpired: IsoTimestamp,
    supersededBy: string | null,
  ): void {
    this.statement(INVALIDATE_SQL).run({
      id,
      t_expired: tExpired,
      superseded_by: supersededBy,
    });
  }

  private statement(sql: string): Statement {
    const cached = this.cache.get(sql);
    if (cached !== undefined) {
      return cached;
    }
    const prepared = this.db.prepare(sql);
    this.cache.set(sql, prepared);
    return prepared;
  }
}
