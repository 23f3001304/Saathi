import type { Database as SqliteDatabase } from "better-sqlite3";

interface CountRow {
  readonly n: number;
}

interface FoldRow {
  readonly fold_name: string;
  readonly last_seq: number;
  readonly state_hash: string;
  readonly updated_at: string;
}

export interface MerchantTrustRow {
  readonly merchant_id: string;
  readonly trust_score: number;
  readonly quotes_total: number;
  readonly quote_mismatches: number;
  readonly manipulation_attempts: number;
  readonly refunds_honored: number;
}

export interface PricePoint {
  readonly t_valid_from: string;
  readonly t_valid_to: string | null;
  readonly price_paise: number;
  readonly tier: number;
  readonly attestation_jti: string | null;
}

const COUNTS = {
  events: "SELECT count(*) AS n FROM events",
  memories: "SELECT count(*) AS n FROM memory WHERE t_expired IS NULL",
  mandates: "SELECT count(*) AS n FROM mandates",
  txns: "SELECT count(*) AS n FROM transactions",
} as const;

const FOLDS_SQL = "SELECT * FROM fold_state ORDER BY fold_name";

const MERCHANTS_SQL = `SELECT merchant_id, trust_score, quotes_total, quote_mismatches,
    manipulation_attempts, refunds_honored
  FROM merchant_trust WHERE tenant_id = ? ORDER BY merchant_id`;

const PRICES_SQL = `SELECT t_valid_from, t_valid_to, price_paise, tier, attestation_jti
  FROM sku_price_history WHERE tenant_id = ? AND sku_id = ?
  ORDER BY t_valid_from DESC LIMIT 200`;

export interface FoldsSummary {
  readonly events: number;
  readonly memories: number;
  readonly mandates: number;
  readonly txns: number;
  readonly folds: readonly {
    readonly name: string;
    readonly last_seq: number;
    readonly state_hash: string;
  }[];
  readonly last_materialized_at: string | null;
}

/** `/folds/*` (§4.10), read-only on the WAL snapshot. */
export class FoldQueries {
  constructor(private readonly db: SqliteDatabase) {}

  summary(): FoldsSummary {
    const folds = this.db.prepare(FOLDS_SQL).all() as FoldRow[];
    return {
      events: this.count(COUNTS.events),
      memories: this.count(COUNTS.memories),
      mandates: this.count(COUNTS.mandates),
      txns: this.count(COUNTS.txns),
      folds: folds.map((row) => ({
        name: row.fold_name,
        last_seq: row.last_seq,
        state_hash: row.state_hash,
      })),
      last_materialized_at: latestOf(folds),
    };
  }

  merchants(tenantId: string): readonly MerchantTrustRow[] {
    return this.db.prepare(MERCHANTS_SQL).all(tenantId) as MerchantTrustRow[];
  }

  prices(tenantId: string, skuId: string): readonly PricePoint[] {
    return this.db.prepare(PRICES_SQL).all(tenantId, skuId) as PricePoint[];
  }

  private count(sql: string): number {
    return (this.db.prepare(sql).get() as CountRow | undefined)?.n ?? 0;
  }
}

function latestOf(folds: readonly FoldRow[]): string | null {
  return folds.reduce<string | null>(
    (latest, row) =>
      latest === null || row.updated_at > latest ? row.updated_at : latest,
    null,
  );
}
