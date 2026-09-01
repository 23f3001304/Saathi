import type { ActionClass, IsoTimestamp, Sha256Hex } from "@covenant/domain";

export interface TableDriftRecord {
  readonly table: string;
  readonly liveHash: Sha256Hex;
  readonly replayedHash: Sha256Hex;
  readonly liveRows: number;
  readonly replayedRows: number;
}

export interface DriftSnapshot {
  readonly ok: boolean;
  readonly checkedAt: IsoTimestamp | null;
  readonly tables: readonly TableDriftRecord[];
}

/** The table whose drift stops money moving (§9.6, decision 43). */
export const MEMORY_TABLE = "memory";

/** The two classes a cart is built from; both mint a digest (§9.3). */
const BLOCKED_ON_MEMORY_DRIFT: readonly ActionClass[] = [
  "cart-construction",
  "constraint-evaluation",
];

/**
 * Drift degrades **selectively** (decision 43): `memory` drift blocks cart
 * construction and turns `readyz` red, because a cart cannot be built from a
 * store we cannot prove; drift in the flywheel folds only marks `/recs` stale.
 * Failing closed on the thing that moves money is integrity; failing closed on
 * a recommendation table is a self-inflicted outage.
 *
 * DECISION: this class only *exposes* the state; the refusal itself lives in
 * `packages/gateway`, where the readiness probe and the two memory use cases
 * already sit. Why: one enforcement point beats two, and `ReadGate` refusing
 * on its own would make the same decision twice with two different answers
 * whenever the probe and the gate disagreed.
 */
export class MemoryDriftState {
  private snapshotValue: DriftSnapshot = {
    ok: true,
    checkedAt: null,
    tables: [],
  };

  record(tables: readonly TableDriftRecord[], checkedAt: IsoTimestamp): void {
    this.snapshotValue = { ok: tables.length === 0, checkedAt, tables };
  }

  snapshot(): DriftSnapshot {
    return this.snapshotValue;
  }

  /** Never auto-healed: drift is reported, and a human or CI decides (§9.6). */
  isDrifting(): boolean {
    return !this.snapshotValue.ok;
  }

  memoryDrifted(): boolean {
    return this.snapshotValue.tables.some(
      (record) => record.table === MEMORY_TABLE,
    );
  }

  permits(actionClass: ActionClass): boolean {
    if (!this.memoryDrifted()) {
      return true;
    }
    return !BLOCKED_ON_MEMORY_DRIFT.includes(actionClass);
  }
}
