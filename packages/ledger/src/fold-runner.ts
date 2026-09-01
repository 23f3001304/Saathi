import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Clock, EventSource, StoredEvent, Tracer } from "@covenant/domain";

import type { FoldRegistry } from "./fold-registry.js";

export interface FoldRunResult {
  readonly applied: number;
  readonly head: number;
  readonly folds: readonly { readonly name: string; readonly lastSeq: number }[];
}

const DEFAULT_BATCH = 500;

const UPSERT_STATE = `INSERT INTO fold_state (fold_name, last_seq, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(fold_name) DO UPDATE SET last_seq = excluded.last_seq,
                                     updated_at = excluded.updated_at`;

/**
 * Applies new events to the live projections and advances
 * `fold_state.last_seq`. Called inside the money transaction, so a projection
 * write and its ledger event commit together (section 5.1).
 *
 * DECISION: `Clock` joins section 2.1's collaborators. Why: `fold_state`
 * has a NOT NULL `updated_at`, and no package may call `Date.now()`.
 */
export class FoldRunner {
  constructor(
    private readonly source: EventSource,
    private readonly registry: FoldRegistry,
    private readonly db: SqliteDatabase,
    private readonly clock: Clock,
    private readonly tracer: Tracer,
  ) {}

  runPending(batchSize: number = DEFAULT_BATCH): FoldRunResult {
    const span = this.tracer.startSpan("ledger.fold.run", {});
    const cursors = this.cursors();
    const head = this.source.head()?.seq ?? 0;
    let applied = 0;
    let from = Math.min(...cursors.values()) + 1;
    while (from <= head) {
      const batch = this.source.readFrom(from, batchSize);
      if (batch.length === 0) {
        break;
      }
      applied += this.applyBatch(batch, cursors);
      from = (batch.at(-1)?.seq ?? head) + 1;
    }
    this.persist(cursors);
    span.setStatus("ok");
    span.end();
    return { applied, head, folds: this.report(cursors) };
  }

  private applyBatch(
    batch: readonly StoredEvent[],
    cursors: Map<string, number>,
  ): number {
    let applied = 0;
    for (const event of batch) {
      applied += this.applyEvent(event, cursors);
    }
    return applied;
  }

  /** Events are applied strictly by `seq`; ties are impossible (rule 2). */
  private applyEvent(
    event: StoredEvent,
    cursors: Map<string, number>,
  ): number {
    let applied = 0;
    const interested = new Set(
      this.registry.forKind(event.kind).map((reducer) => reducer.name),
    );
    for (const reducer of this.registry.all()) {
      if ((cursors.get(reducer.name) ?? 0) >= event.seq) {
        continue;
      }
      if (interested.has(reducer.name)) {
        reducer.apply(this.db, event);
        applied += 1;
      }
      cursors.set(reducer.name, event.seq);
    }
    return applied;
  }

  private cursors(): Map<string, number> {
    const read = this.db.prepare(
      "SELECT last_seq FROM fold_state WHERE fold_name = ?",
    );
    return new Map(
      this.registry.all().map((reducer) => {
        const row = read.get(reducer.name) as { last_seq: number } | undefined;
        return [reducer.name, row?.last_seq ?? 0];
      }),
    );
  }

  private persist(cursors: Map<string, number>): void {
    const at = this.clock.now().toISOString();
    const upsert = this.db.prepare(UPSERT_STATE);
    for (const [name, lastSeq] of cursors) {
      upsert.run(name, lastSeq, at);
    }
  }

  private report(
    cursors: Map<string, number>,
  ): readonly { readonly name: string; readonly lastSeq: number }[] {
    return [...cursors].map(([name, lastSeq]) => ({ name, lastSeq }));
  }
}
