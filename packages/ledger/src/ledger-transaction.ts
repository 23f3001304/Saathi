import type { Database as SqliteDatabase, Transaction } from "better-sqlite3";

import type { LedgerFrame, StoredEvent, Tracer } from "@covenant/domain";
import { frameOf } from "@covenant/domain";

/** What `SqliteEventWriter` hands the transaction as each event lands. */
export interface AppendedEventCollector {
  collect(event: StoredEvent): void;
}

/** Implemented by `LedgerStreamHub` in the composition root (section 4.11). */
export interface FramePublisher {
  publish(frames: readonly LedgerFrame[]): void;
}

/**
 * The money-action envelope (section 5.1): one `BEGIN IMMEDIATE ... COMMIT`,
 * so **no side effect without its ledger event**. Frames produced inside are
 * buffered and published only after the commit returns, in `seq` order; a
 * rollback discards them. Publishing mid-transaction would let the UI paint a
 * verdict a later `RAISE(ABORT)` erases, and would break gaplessness for every
 * connected client at once (decision 22).
 *
 * DECISION: `FramePublisher` is injected next to the `Database` and `Tracer`
 * of section 2.1. Why: `LedgerStreamHub` lives in `apps/gateway-svc`, and a
 * package may not import a composition root.
 */
export class LedgerTransaction implements AppendedEventCollector {
  private readonly immediate: Transaction<(work: () => unknown) => unknown>;
  private readonly buffered: StoredEvent[] = [];
  private depth = 0;

  constructor(
    db: SqliteDatabase,
    private readonly publisher: FramePublisher,
    private readonly tracer: Tracer,
  ) {
    this.immediate = db.transaction((work: () => unknown) => work());
  }

  collect(event: StoredEvent): void {
    this.buffered.push(event);
  }

  run<T>(name: string, work: () => T): T {
    const span = this.tracer.startSpan("ledger.transaction", { name });
    const mark = this.buffered.length;
    this.depth += 1;
    try {
      const result = this.immediate.immediate(work) as T;
      span.setStatus("ok");
      return result;
    } catch (error) {
      // A rolled-back savepoint retracts exactly the frames it produced.
      this.buffered.length = mark;
      span.setStatus("error");
      span.recordException(error instanceof Error ? error : new Error(name));
      throw error;
    } finally {
      this.depth -= 1;
      this.publishAfterCommit();
      span.end();
    }
  }

  /** Nested `run` calls are savepoints; only the outermost commit publishes. */
  private publishAfterCommit(): void {
    if (this.depth > 0 || this.buffered.length === 0) {
      return;
    }
    const frames = this.buffered
      .slice()
      .sort((left, right) => left.seq - right.seq)
      .map(frameOf);
    this.buffered.length = 0;
    this.publisher.publish(frames);
  }
}
