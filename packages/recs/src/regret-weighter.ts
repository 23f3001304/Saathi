import type { Database as SqliteDatabase } from "better-sqlite3";

export interface WeightableCandidate {
  readonly skuId: string;
  readonly merchantId: string | null;
  readonly score: number;
}

/** Centred on 1.0 (neutral): every multiplier below defaults there when a
 * signal has no data, so the combined weight is a no-op absent history. */
const NEUTRAL = 1;
const REGRET_SPAN = 0.5;
const TRUST_PRIOR = 0.5;

const REGRET_SQL = `SELECT
    SUM(CASE WHEN json_extract(r.payload_json, '$.verdict') = 'keep' THEN 1 ELSE 0 END) AS keeps,
    SUM(CASE WHEN json_extract(r.payload_json, '$.verdict') = 'regret' THEN 1 ELSE 0 END) AS regrets
  FROM events r
  JOIN events c ON c.txn_id = r.txn_id AND c.kind = 'cart.assembled'
  WHERE r.kind = 'regret.recorded' AND r.tenant_id = @tenant_id
    AND EXISTS (
      SELECT 1 FROM json_each(json_extract(c.payload_json, '$.lines')) line
      WHERE json_extract(line.value, '$.sku_id') = @sku_id
         OR json_extract(line.value, '$.sku') = @sku_id
    )`;

const TRUST_SQL = `SELECT trust_score FROM merchant_trust
  WHERE tenant_id = ? AND merchant_id = ?`;

const PERSONAL_SQL = `SELECT weight FROM user_prefs
  WHERE tenant_id = ? AND user_id = ? AND pref_key = ?`;

const CONTRIBUTORS_SQL = `SELECT COUNT(DISTINCT txn_id) AS n FROM events
  WHERE tenant_id = ? AND kind = 'regret.recorded' AND txn_id IS NOT NULL`;

/**
 * Reweights candidates by regret/return/refund outcome labels and merchant
 * trust (backend-architecture.md section 2.6) — "the recommender that
 * optimises for what you kept, not what you clicked" (ARCHITECTURE section
 * 5.8). Every query is a plain read against the ledger's own `events`,
 * `merchant_trust` and `user_prefs` tables, which is why this class takes a
 * raw read-only `Database` rather than a port: `regret.recorded` carries no
 * SKU (section 10.3), so correlating it to one is a join across the raw
 * event log, not something `UserPrefsFold` can do inside `apply()` (section
 * 3.10 rule 1 — see `UserPrefsFold`'s doc comment).
 */
export class RegretWeighter {
  constructor(private readonly db: SqliteDatabase) {}

  reweight<T extends WeightableCandidate>(
    tenantId: string,
    userId: string,
    candidates: readonly T[],
  ): readonly T[] {
    return candidates.map((candidate) => ({
      ...candidate,
      score: candidate.score * this.multiplierFor(tenantId, userId, candidate),
    }));
  }

  /** A rough k-anonymity proxy (ARCHITECTURE section 5.8 consent model):
   * distinct transactions behind the regret signal for this tenant. */
  distinctContributors(tenantId: string): number {
    const row = this.db.prepare(CONTRIBUTORS_SQL).get(tenantId) as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  }

  private multiplierFor(
    tenantId: string,
    userId: string,
    candidate: WeightableCandidate,
  ): number {
    return (
      this.regretMultiplier(tenantId, candidate.skuId) *
      this.trustMultiplier(tenantId, candidate.merchantId) *
      this.personalMultiplier(tenantId, userId, candidate.skuId)
    );
  }

  private regretMultiplier(tenantId: string, skuId: string): number {
    const row = this.db.prepare(REGRET_SQL).get({
      tenant_id: tenantId,
      sku_id: skuId,
    }) as { keeps: number | null; regrets: number | null } | undefined;
    const keeps = row?.keeps ?? 0;
    const regrets = row?.regrets ?? 0;
    const total = keeps + regrets;
    return total === 0 ? NEUTRAL : NEUTRAL - REGRET_SPAN + keeps / total;
  }

  private trustMultiplier(tenantId: string, merchantId: string | null): number {
    if (merchantId === null) {
      return NEUTRAL;
    }
    const row = this.db.prepare(TRUST_SQL).get(tenantId, merchantId) as
      | { trust_score: number }
      | undefined;
    const trustScore = row?.trust_score ?? TRUST_PRIOR;
    return NEUTRAL - REGRET_SPAN + trustScore;
  }

  private personalMultiplier(
    tenantId: string,
    userId: string,
    skuId: string,
  ): number {
    const row = this.db
      .prepare(PERSONAL_SQL)
      .get(tenantId, userId, `sku:${skuId}`) as { weight: number } | undefined;
    return row?.weight ?? NEUTRAL;
  }
}
