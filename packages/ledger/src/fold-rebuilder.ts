import type { Database as SqliteDatabase } from "better-sqlite3";

import type {
  Clock,
  EventSource,
  Logger,
  Sha256Hex,
  StoredEvent,
} from "@covenant/domain";
import { sha256Of } from "@covenant/domain";

import { EVENT_INSERT_SQL, toEventRecord } from "./event-record.js";
import type { FoldRegistry } from "./fold-registry.js";
import type { StateHasher, TableState } from "./state-hasher.js";

/** Opens an empty database carrying the whole of section 3. */
export interface ShadowSchema {
  open(): SqliteDatabase;
}

export interface TableDrift {
  readonly table: string;
  readonly liveHash: Sha256Hex;
  readonly replayedHash: Sha256Hex;
}

/** The `POST /ledger/replay` body (section 4.10) — the N3 proof. */
export interface RebuildResult {
  readonly ok: boolean;
  readonly events: number;
  readonly ms: number;
  readonly liveStateHash: Sha256Hex;
  readonly replayedStateHash: Sha256Hex;
  readonly tables: readonly TableState[];
  readonly drift: readonly TableDrift[];
}

const DEFAULT_BATCH = 500;

/**
 * Full rebuild into a shadow database, per-table state hash, diff against
 * live. The shadow is a private connection, never an `ATTACH` onto the live
 * file: the append-only and invalidate-never-delete triggers are load-bearing
 * for the tamper-evidence claim, so a rebuild that had to disable them would
 * be a hole big enough to drive the demo through (section 3.4).
 *
 * DECISION: the shadow is its own in-memory connection, not
 * `ATTACH ':memory:' AS shadow`. Why: prefixing every DDL statement with
 * `shadow.` is not mechanically safe, and the fold tables' foreign keys point
 * at `events(id)`, which an attached schema would not carry.
 *
 * DECISION: rule 4's `reconciliation.ok` / `reconciliation.drift` event is
 * appended by the caller, not here. Why: section 5.1 lists
 * `POST /ledger/replay` as read-only on live, and a rebuilder that appended
 * would contradict its own operation mode.
 */
export class FoldRebuilder {
  constructor(
    private readonly source: EventSource,
    private readonly registry: FoldRegistry,
    private readonly hasher: StateHasher,
    private readonly shadow: ShadowSchema,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  rebuild(batchSize: number = DEFAULT_BATCH): RebuildResult {
    const startedAt = this.clock.now().getTime();
    const db = this.shadow.open();
    try {
      const events = this.replay(db, batchSize);
      const result = this.compare(db, events, startedAt);
      this.logger.info("ledger.replay.finished", {
        ok: result.ok,
        events: result.events,
      });
      return result;
    } finally {
      db.close();
    }
  }

  /**
   * Events are copied into the shadow `events` table first, so the chain-guard
   * trigger re-checks the chain and the projections' foreign keys into
   * `events(id)` stay enforced during the replay.
   */
  private replay(db: SqliteDatabase, batchSize: number): number {
    const insert = db.prepare(EVENT_INSERT_SQL);
    let seq = 1;
    let count = 0;
    for (;;) {
      const batch = this.source.readFrom(seq, batchSize);
      if (batch.length === 0) {
        return count;
      }
      db.transaction(() => {
        for (const event of batch) {
          insert.run(toEventRecord(event));
          this.applyEvent(db, event);
        }
      })();
      count += batch.length;
      seq = (batch.at(-1)?.seq ?? seq) + 1;
    }
  }

  private applyEvent(db: SqliteDatabase, event: StoredEvent): void {
    for (const reducer of this.registry.forKind(event.kind)) {
      reducer.apply(db, event);
    }
  }

  private compare(
    db: SqliteDatabase,
    events: number,
    startedAt: number,
  ): RebuildResult {
    const tables = this.registry.tables();
    const replayed = tables.map((table) => this.hasher.hashIn(db, table));
    const live = tables.map((table) => this.hasher.hash(table));
    const drift = this.driftBetween(live, replayed);
    return {
      ok: drift.length === 0,
      events,
      ms: this.clock.now().getTime() - startedAt,
      liveStateHash: aggregate(live),
      replayedStateHash: aggregate(replayed),
      tables: replayed,
      drift,
    };
  }

  private driftBetween(
    live: readonly TableState[],
    replayed: readonly TableState[],
  ): readonly TableDrift[] {
    return live.flatMap((state, index) => {
      const other = replayed[index];
      if (other === undefined || other.hash === state.hash) {
        return [];
      }
      return [
        {
          table: state.table,
          liveHash: state.hash,
          replayedHash: other.hash,
        },
      ];
    });
  }
}

/** One number for the whole projection set, order-fixed by table name. */
function aggregate(states: readonly TableState[]): Sha256Hex {
  return sha256Of(states.map((state) => [state.table, state.hash]));
}
