import type { Database as SqliteDatabase } from "better-sqlite3";

import type { TrustExplanation } from "@covenant/recs";
import { explainScore } from "@covenant/recs";

interface CounterRow {
  readonly quotes_total: number;
  readonly quote_mismatches: number;
  readonly catalog_reads: number;
  readonly manipulation_attempts: number;
  readonly refunds_requested: number;
  readonly refunds_honored: number;
  readonly cooloff_cancellations: number;
  readonly carts_total: number;
  readonly stock_conflicts: number;
}

export interface MerchantStanding extends TrustExplanation {
  readonly merchant_id: string;
  readonly counters: CounterRow;
  /** Tracked, and deliberately not scored: losing a fair last-unit race is not
   *  misbehaviour, so it is shown beside the score rather than inside it. */
  readonly stock_conflicts: number;
}

const STANDING_SQL = `SELECT merchant_id, quotes_total, quote_mismatches, catalog_reads,
    manipulation_attempts, refunds_requested, refunds_honored, cooloff_cancellations,
    carts_total, stock_conflicts
  FROM merchant_trust WHERE tenant_id = ? ORDER BY merchant_id`;

const ZERO: CounterRow = {
  quotes_total: 0,
  quote_mismatches: 0,
  catalog_reads: 0,
  manipulation_attempts: 0,
  refunds_requested: 0,
  refunds_honored: 0,
  cooloff_cancellations: 0,
  carts_total: 0,
  stock_conflicts: 0,
};

/**
 * The merchant's own view of the fold that decides whether a buyer agent
 * offers them first. Read-only, on the WAL snapshot, like every other read.
 *
 * It is a read in the strong sense: `packages/gateway` cannot import
 * `packages/recs` at all (depcruise forbids it), so nothing on this page can
 * reach a verdict. Trust changes who is offered first; it never changes what
 * is permitted.
 */
export class MerchantQueries {
  constructor(private readonly db: SqliteDatabase) {}

  standings(tenantId: string): readonly MerchantStanding[] {
    const rows = this.db.prepare(STANDING_SQL).all(tenantId) as CounterRow[];
    return rows.map((row) =>
      standingOf(row as CounterRow & { merchant_id: string }),
    );
  }

  /** A merchant with no history yet is a real answer, not a 404: it is the prior. */
  standing(tenantId: string, merchantId: string): MerchantStanding {
    const found = this.standings(tenantId).find(
      (row) => row.merchant_id === merchantId,
    );
    return found ?? standingOf({ ...ZERO, merchant_id: merchantId });
  }
}

function standingOf(
  row: CounterRow & { merchant_id: string },
): MerchantStanding {
  return {
    merchant_id: row.merchant_id,
    counters: row,
    stock_conflicts: row.stock_conflicts,
    ...explainScore({
      quotesTotal: row.quotes_total,
      quoteMismatches: row.quote_mismatches,
      catalogReads: row.catalog_reads,
      manipulationAttempts: row.manipulation_attempts,
      refundsRequested: row.refunds_requested,
      refundsHonored: row.refunds_honored,
    }),
  };
}
