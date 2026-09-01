import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { EnvelopeDeclaration, EnvelopeState } from "@covenant/domain";

import { periodKeyOf, periodResetsAt } from "./period-key.js";

interface SumRow {
  readonly state: string;
  readonly total: number;
  readonly oldest: string | null;
}

const SUMS_SQL = `
  SELECT state, SUM(amount_paise) AS total, MIN(expires_at) AS oldest
    FROM envelope_reservations
   WHERE tenant_id = ? AND user_id = ? AND category = ? AND period_key = ?
     AND (state = 'captured' OR (state = 'open' AND expires_at > ?))
   GROUP BY state`;

export interface SpendScope {
  readonly tenantId: string;
  readonly userId: string;
}

/**
 * Reads the rolling per-category, per-period balance `EnvelopeCheck` needs:
 * **committed spend** is the sum of captured reservations and **open** is the
 * sum of live holds. Both come from `envelope_reservations` rather than from
 * transactions, because capacity is consumed at verify time and released
 * deterministically (§3.8) — counting captures alone would let a burst of
 * parallel HNP verifications overshoot the cap.
 */
export class SpendWindow {
  private sums: Statement | null = null;

  constructor(private readonly db: SqliteDatabase) {}

  statesFor(
    scope: SpendScope,
    declarations: readonly EnvelopeDeclaration[],
    now: Date,
  ): readonly EnvelopeState[] {
    return declarations.map((declaration) =>
      this.stateFor(scope, declaration, now),
    );
  }

  // SINGLE-WRITER ASSUMPTION: this sum is read inside the verify transaction and
  // the reservation INSERT that consumes it follows in the same transaction.
  private stateFor(
    scope: SpendScope,
    declaration: EnvelopeDeclaration,
    now: Date,
  ): EnvelopeState {
    const periodKey = periodKeyOf(declaration.period, now);
    // An open hold past its expiry stops counting here rather than waiting for
    // a sweeper: "an abandoned verification must not lock a cap forever" was
    // this table's stated design, but the release ran from nowhere — a link
    // nobody paid held its capacity until the period rolled over. Read inside
    // the verify transaction, so the answer is deterministic per verify.
    const rows = this.statement().all(
      scope.tenantId,
      scope.userId,
      declaration.category,
      periodKey,
      now.toISOString(),
    ) as SumRow[];
    const open = rows.find((row) => row.state === "open");
    return {
      category: declaration.category,
      period: declaration.period,
      capPaise: declaration.cap_paise,
      committedPaise: rows.find((row) => row.state === "captured")?.total ?? 0,
      openReservedPaise: open?.total ?? 0,
      resetsAt: periodResetsAt(declaration.period, now),
      oldestReservationExpiresAt: open?.oldest ?? null,
    };
  }

  private statement(): Statement {
    this.sums ??= this.db.prepare(SUMS_SQL);
    return this.sums;
  }
}
