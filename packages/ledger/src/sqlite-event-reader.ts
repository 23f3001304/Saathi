import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type {
  EventSource,
  LedgerFrame,
  LedgerHead,
  StoredEvent,
} from "@covenant/domain";
import { frameOf } from "@covenant/domain";

import type { EventRecord } from "./event-record.js";
import { toStoredEvent } from "./event-record.js";

const SELECT_ALL = "SELECT * FROM events";

const QUERIES = {
  from: `${SELECT_ALL} WHERE seq >= ? ORDER BY seq LIMIT ?`,
  after: `${SELECT_ALL} WHERE seq > ? ORDER BY seq LIMIT ?`,
  byTxn: `${SELECT_ALL} WHERE txn_id = ? ORDER BY seq`,
  head: "SELECT seq, this_hash FROM events ORDER BY seq DESC LIMIT 1",
} as const;

/**
 * Read-only ledger access, a separate class from the writer so the flywheel
 * and the audit assembler receive no ability to append (decision 4).
 */
export class SqliteEventReader implements EventSource {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  /** Inclusive of `seq`, in total order. */
  readFrom(seq: number, limit: number): readonly StoredEvent[] {
    return this.rows(QUERIES.from, seq, limit);
  }

  /**
   * Exclusive of `seq` — the `Last-Event-ID: <seq>` and `?after=` contract
   * (section 4.11): a reconnect replays `seq > n`, then attaches to live.
   */
  readAfter(seq: number, limit: number): readonly StoredEvent[] {
    return this.rows(QUERIES.after, seq, limit);
  }

  /** The audit UI's only hot query: one transaction's causal chain in order. */
  byTxn(txnId: string): readonly StoredEvent[] {
    return this.rows(QUERIES.byTxn, txnId);
  }

  head(): LedgerHead | null {
    const row = this.statement(QUERIES.head).get() as LedgerHead | undefined;
    return row ?? null;
  }

  height(): number {
    return this.head()?.seq ?? 0;
  }

  /**
   * The SSE backfill. Stream and poll return the identical frame shape, so the
   * client reducer stays idempotent on `id` (section 4.11).
   */
  framesAfter(seq: number, limit: number): readonly LedgerFrame[] {
    return this.readAfter(seq, limit).map(frameOf);
  }

  private rows(
    sql: string,
    ...params: readonly (string | number)[]
  ): readonly StoredEvent[] {
    const records = this.statement(sql).all(...params) as EventRecord[];
    return records.map(toStoredEvent);
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
