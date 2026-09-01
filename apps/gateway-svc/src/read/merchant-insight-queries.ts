import type { Database as SqliteDatabase } from "better-sqlite3";

export interface UnmetAsk {
  readonly query: string;
  readonly asks: number;
  readonly last_at: string;
}

export interface RefusalTally {
  readonly reason_code: string;
  readonly count: number;
}

/** One SKU's week inside its declared band. */
export interface SettledRow {
  readonly sku_id: string;
  readonly carts: number;
  readonly cleared_floor: number;
  readonly saved_paise: number;
  readonly floor_paise: number;
  readonly list_paise: number;
  readonly last_at: string;
}

const LIMIT = 20;

/**
 * What buyer agents asked this shop for and were not shown. `result_count = 0`
 * is the whole definition: a search that matched nothing is the one signal a
 * merchant cannot get from their own sales, because it is the sale that did
 * not happen.
 */
const DEMAND_SQL = `SELECT json_extract(payload_json, '$.query') AS query,
    count(*) AS asks, max(ts) AS last_at
  FROM events
  WHERE tenant_id = ?
    AND kind = 'catalog.read'
    AND json_extract(payload_json, '$.merchant_id') = ?
    AND coalesce(json_extract(payload_json, '$.result_count'), 0) = 0
    AND json_extract(payload_json, '$.query') IS NOT NULL
  GROUP BY query
  ORDER BY asks DESC, last_at DESC
  LIMIT ${LIMIT.toString()}`;

/**
 * Every reason a verdict named while deciding a cart at this merchant. This is
 * the bleed: `CART_QUOTE_MISMATCH` is drip pricing caught, `QUOTE_EXPIRED` is a
 * quote the shop let go stale, `REFUNDABILITY_REQUIRED` is a covenant term the
 * listing did not meet.
 */
const REFUSAL_SQL = `SELECT json_extract(payload_json, '$.reason_code') AS reason_code,
    count(*) AS count
  FROM events
  WHERE tenant_id = ?
    AND kind = 'verdict.emitted'
    AND json_extract(payload_json, '$.merchant_id') = ?
    AND json_extract(payload_json, '$.reason_code') IS NOT NULL
  GROUP BY reason_code
  ORDER BY count DESC
  LIMIT ${LIMIT.toString()}`;

/**
 * What the merchant's floor actually won: carts that settled below the listed
 * price because a band was standing, and whether every one of them cleared it.
 *
 * `cleared_floor` is summed rather than assumed. A merchant should be able to
 * read "four settled below list, all four cleared your floor" off the same row
 * that would say "three of four" if the gateway had ever let one through — and
 * it has not, because `QuoteMatchCheck` refuses the fourth.
 */
const SETTLED_SQL = `SELECT json_extract(payload_json, '$.sku_id') AS sku_id,
    count(*) AS carts,
    sum(CASE WHEN json_extract(payload_json, '$.cleared_floor') THEN 1 ELSE 0 END) AS cleared_floor,
    sum(coalesce(json_extract(payload_json, '$.saved_paise'), 0)) AS saved_paise,
    max(coalesce(json_extract(payload_json, '$.floor_paise'), 0)) AS floor_paise,
    max(coalesce(json_extract(payload_json, '$.list_paise'), 0)) AS list_paise,
    max(ts) AS last_at
  FROM events
  WHERE tenant_id = ?
    AND kind = 'negotiation.settled'
    AND json_extract(payload_json, '$.merchant_id') = ?
    AND ts_ms >= ?
  GROUP BY sku_id
  ORDER BY carts DESC, last_at DESC
  LIMIT ${LIMIT.toString()}`;

/**
 * Three projections over the raw log, on the read-only handle.
 *
 * Deliberately queried from `events` rather than from a fold: neither of these
 * is a counter the merchant trust fold keeps, and adding columns to a fold to
 * serve a dashboard would put display concerns inside the thing that decides
 * whether a merchant is believed.
 */
export class MerchantInsightQueries {
  constructor(private readonly db: SqliteDatabase) {}

  unmetDemand(tenantId: string, merchantId: string): readonly UnmetAsk[] {
    return this.db.prepare(DEMAND_SQL).all(tenantId, merchantId) as UnmetAsk[];
  }

  refusals(tenantId: string, merchantId: string): readonly RefusalTally[] {
    return this.db
      .prepare(REFUSAL_SQL)
      .all(tenantId, merchantId) as RefusalTally[];
  }

  settledBelowList(
    tenantId: string,
    merchantId: string,
    sinceMs: number,
  ): readonly SettledRow[] {
    return this.db
      .prepare(SETTLED_SQL)
      .all(tenantId, merchantId, sinceMs) as SettledRow[];
  }
}
