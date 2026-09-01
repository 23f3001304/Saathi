import type { MandateRole } from "@covenant/domain";
import { MANDATE_ROLES } from "@covenant/domain";
import type { SqliteEventReader } from "@covenant/ledger";
import type { MemoryDriftState } from "@covenant/memory";
import type { PinnedJwkResolver } from "@covenant/mandates";
import type { VecIndex } from "@covenant/memory";

import type { RailMode } from "../config.js";
import type { DrainGate } from "../shutdown.js";

export interface ReadinessChecks {
  readonly ledger_open: boolean;
  readonly chain_head_valid: boolean;
  readonly jwks_loaded: number;
  readonly sqlite_vec: boolean;
  readonly folds_current: boolean;
  readonly rzp_reachable: boolean;
  readonly reconciliation: string;
}

export interface ReadinessReport {
  readonly ok: boolean;
  readonly checks: ReadinessChecks;
}

/**
 * §4.9 / ARCHITECTURE §10.4. The binding pair is **ledger open + JWKs
 * loaded**; the rest is reported for the UI's `HealthChip` but does not on its
 * own take the service out of rotation. `readyz` is 503 while the cool-off
 * scheduler is still rearming at boot, throughout the graceful drain, and
 * whenever reconciliation reports memory drift (§9.6) — a gateway that would
 * answer a verdict from a store it knows has diverged is worse than one that
 * says it is not ready.
 *
 * DECISION: `chain_head_valid` reads the head, it does not walk the chain.
 * Why: `readyz` is polled by Docker every 15 s and a full hash-chain scan is
 * `POST /ledger/verify` — an O(n) probe would turn a liveness check into the
 * most expensive query the service runs.
 */
export class ReadinessProbe {
  private rearmed = false;

  constructor(
    private readonly reader: SqliteEventReader,
    private readonly keys: PinnedJwkResolver,
    private readonly vec: VecIndex,
    private readonly drift: MemoryDriftState,
    private readonly gate: DrainGate,
    private readonly rail: RailMode,
    private readonly railConfigured: boolean,
  ) {}

  /** The cool-off scheduler reports in once every pending hold has a timer. */
  markRearmed(): void {
    this.rearmed = true;
  }

  check(): ReadinessReport {
    const checks = this.collect();
    const rolesLoaded = checks.jwks_loaded === MANDATE_ROLES.length;
    return {
      ok:
        checks.ledger_open &&
        checks.chain_head_valid &&
        rolesLoaded &&
        this.rearmed &&
        !this.gate.isDraining &&
        !this.drift.memoryDrifted(),
      checks,
    };
  }

  private collect(): ReadinessChecks {
    const head = this.headSeq();
    return {
      ledger_open: head !== null,
      chain_head_valid: head !== null,
      jwks_loaded: liveRolesOf(this.keys).length,
      sqlite_vec: this.vec.available(),
      folds_current: !this.drift.isDrifting(),
      rzp_reachable: this.rail === "fake" ? true : this.railConfigured,
      reconciliation: this.drift.memoryDrifted() ? "memory_drift" : "ok",
    };
  }

  /** `0` on an empty ledger is still "open": the chain starts at genesis. */
  private headSeq(): number | null {
    try {
      return this.reader.head()?.seq ?? 0;
    } catch {
      return null;
    }
  }
}

function liveRolesOf(keys: PinnedJwkResolver): readonly MandateRole[] {
  return keys.liveRoles();
}
