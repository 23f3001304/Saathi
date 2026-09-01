import type { Clock, EventSink, Logger } from "@covenant/domain";
import { toIsoTimestamp } from "@covenant/domain";
import type {
  FoldRebuilder,
  LedgerTransaction,
  RebuildResult,
  StateHasher,
} from "@covenant/ledger";

import type { TableDriftRecord } from "./drift-state.js";
import type { MemoryDriftState } from "./drift-state.js";

export interface ReconciliationReport {
  readonly ok: boolean;
  readonly tables: readonly string[];
  readonly drift: readonly TableDriftRecord[];
  readonly ms: number;
  readonly eventId: string;
}

/**
 * SSGM's ℛ operator, and the N3 proof (§9.6). Re-folds every registered
 * reducer into a shadow database, hashes each projection table, and diffs
 * against live.
 *
 * It **never auto-heals**. Silently rewriting derived state to match a replay
 * would destroy the evidence of *why* it diverged, which is the only thing a
 * drift report is for.
 *
 * DECISION: `first_divergent_seq` is not emitted. Why: §2.1's `FoldRebuilder`
 * is frozen and returns whole-table hashes, and an intermediate replay state
 * legitimately differs from the final live state at every seq but the last —
 * so a seq-level answer computed from table hashes would be a guess. The
 * ledger's own divergence point stays `LedgerVerifier`'s to report, where the
 * hash chain makes it exact.
 */
export class ReconciliationJob {
  constructor(
    private readonly rebuilder: FoldRebuilder,
    private readonly hasher: StateHasher,
    private readonly sink: EventSink,
    private readonly txn: LedgerTransaction,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly state: MemoryDriftState,
    private readonly tenantId: string,
  ) {}

  run(): ReconciliationReport {
    const result = this.rebuilder.rebuild();
    const drift = this.driftIn(result);
    const checkedAt = toIsoTimestamp(this.clock.now());
    this.state.record(drift, checkedAt);
    this.log(drift);
    return {
      ok: drift.length === 0,
      tables: result.tables.map((table) => table.table),
      drift,
      ms: result.ms,
      eventId: this.append(result, drift, checkedAt),
    };
  }

  /** The live row counts the rebuild result does not carry, for the payload. */
  private driftIn(result: RebuildResult): readonly TableDriftRecord[] {
    return result.drift.map((entry) => ({
      table: entry.table,
      liveHash: entry.liveHash,
      replayedHash: entry.replayedHash,
      liveRows: this.hasher.hash(entry.table).rows,
      replayedRows:
        result.tables.find((table) => table.table === entry.table)?.rows ?? 0,
    }));
  }

  private log(drift: readonly TableDriftRecord[]): void {
    if (drift.length === 0) {
      this.logger.info("memory.reconciliation.ok", { tables: 0 });
      return;
    }
    // A blocked or diverged invariant is `warn`: `error` means the system is
    // failing to do its job, and detecting drift is it doing its job.
    this.logger.warn("memory.reconciliation.drift", {
      tables: drift.map((record) => record.table),
    });
  }

  private append(
    result: RebuildResult,
    drift: readonly TableDriftRecord[],
    checkedAt: string,
  ): string {
    return this.txn.run("memory.reconciliation", () =>
      this.sink.append({
        tenant_id: this.tenantId,
        actor: "system",
        kind: drift.length === 0 ? "reconciliation.ok" : "reconciliation.drift",
        txn_id: null,
        request_id: null,
        mandate_id: null,
        payload: {
          tables: result.tables.map((table) => table.table),
          events: result.events,
          ms: result.ms,
          checked_at: checkedAt,
          first_divergent_seq: null,
          row_diff_sample: drift.map(sampleOf),
        },
      }),
    ).id;
  }
}

function sampleOf(record: TableDriftRecord): Readonly<Record<string, unknown>> {
  return {
    table: record.table,
    live_hash: record.liveHash,
    replayed_hash: record.replayedHash,
    live_rows: record.liveRows,
    replayed_rows: record.replayedRows,
  };
}
