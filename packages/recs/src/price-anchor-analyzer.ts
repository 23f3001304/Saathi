import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Clock, IsoTimestamp } from "@covenant/domain";

export interface PricePoint {
  readonly t_valid_from: IsoTimestamp;
  readonly t_valid_to: IsoTimestamp | null;
  readonly price_paise: number;
  readonly tier: number;
  readonly attestation_jti: string | null;
}

export const ANCHOR_VERDICTS = ["consistent", "volatile", "insufficient_data"] as const;
export type AnchorVerdict = (typeof ANCHOR_VERDICTS)[number];

export interface PriceAnchor {
  readonly median_paise: number;
  readonly days_at_or_below: number;
  readonly window_days: number;
  readonly verdict: AnchorVerdict;
}

/** The `/folds/prices/:sku` response body, verbatim (backend-architecture.md section 4.10). */
export interface PriceHistoryResponse {
  readonly sku_id: string;
  readonly points: readonly PricePoint[];
  readonly anchor: PriceAnchor;
}

interface PriceRow {
  readonly t_valid_from: string;
  readonly t_valid_to: string | null;
  readonly price_paise: number;
  readonly tier: number;
  readonly attestation_jti: string | null;
}

const POINTS_SQL = `SELECT t_valid_from, t_valid_to, price_paise, tier, attestation_jti
  FROM sku_price_history WHERE tenant_id = ? AND sku_id = ? ORDER BY t_valid_from ASC`;

/** Bi-temporal "what did we know on day N" (§9.6, ARCHITECTURE A.6): filters
 * on `t_created`, the system-time column, never on `t_valid_from` alone —
 * otherwise a backtest could see a price the system had not learned yet. */
const AS_OF_SQL = `SELECT t_valid_from, t_valid_to, price_paise, tier, attestation_jti
  FROM sku_price_history WHERE tenant_id = ? AND sku_id = ? AND t_created <= ?
  ORDER BY t_created DESC LIMIT 1`;

const DEFAULT_WINDOW_DAYS = 30;
const CONSISTENT_RATIO = 0.8;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Answers "what was this SKU's price on N of the last M days" for the
 * anchoring defence (backend-architecture.md section 2.6; ARCHITECTURE
 * section 5.7 / A.6). Powers the `/folds/prices/:sku` sparkline and the
 * signing-sheet caption ("₹X for N of the last 30 days").
 *
 * DECISION: section 4.10's row lists only the response shape, not how
 * `median_paise` / `days_at_or_below` / `verdict` are derived. The claim
 * this class checks is the merchant's own current asking price (the most
 * recent point) against its *own* history, not an externally supplied "was"
 * figure — so `days_at_or_below` counts, over the window, how many days the
 * effective price was already at or below today's asking price. A price
 * that only just dropped (most of the window sat *above* it) reports
 * `"volatile"`; one that has held there is `"consistent"`; an empty window
 * is `"insufficient_data"`. `median_paise` is reported alongside as a
 * summary of the window, independent of that comparison.
 */
export class PriceAnchorAnalyzer {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly clock: Clock,
  ) {}

  priceHistoryFor(
    tenantId: string,
    skuId: string,
    windowDays: number = DEFAULT_WINDOW_DAYS,
  ): PriceHistoryResponse {
    const points = this.pointsFor(tenantId, skuId);
    return { sku_id: skuId, points, anchor: this.anchorFor(points, windowDays) };
  }

  /** No look-ahead: only price points this system had observed by `instant`. */
  asOf(tenantId: string, skuId: string, instant: IsoTimestamp): PricePoint | null {
    const row = this.db
      .prepare(AS_OF_SQL)
      .get(tenantId, skuId, instant) as PriceRow | undefined;
    return row === undefined ? null : toPoint(row);
  }

  private pointsFor(tenantId: string, skuId: string): readonly PricePoint[] {
    const rows = this.db.prepare(POINTS_SQL).all(tenantId, skuId) as PriceRow[];
    return rows.map(toPoint);
  }

  private anchorFor(
    points: readonly PricePoint[],
    windowDays: number,
  ): PriceAnchor {
    const dailyPrices = this.dailyPricesOver(points, windowDays);
    const currentPrice = points.at(-1)?.price_paise ?? null;
    if (dailyPrices.length === 0 || currentPrice === null) {
      return {
        median_paise: 0,
        days_at_or_below: 0,
        window_days: windowDays,
        verdict: "insufficient_data",
      };
    }
    const daysAtOrBelow = dailyPrices.filter((price) => price <= currentPrice).length;
    const ratio = daysAtOrBelow / dailyPrices.length;
    return {
      median_paise: medianOf(dailyPrices),
      days_at_or_below: daysAtOrBelow,
      window_days: windowDays,
      verdict: ratio >= CONSISTENT_RATIO ? "consistent" : "volatile",
    };
  }

  private dailyPricesOver(
    points: readonly PricePoint[],
    windowDays: number,
  ): readonly number[] {
    const now = this.clock.now().getTime();
    const prices: number[] = [];
    for (let offset = 0; offset < windowDays; offset += 1) {
      const price = priceAt(points, new Date(now - offset * DAY_MS).toISOString());
      if (price !== null) {
        prices.push(price);
      }
    }
    return prices;
  }
}

function priceAt(points: readonly PricePoint[], instant: string): number | null {
  const hit = points.find(
    (point) =>
      point.t_valid_from <= instant &&
      (point.t_valid_to === null || instant < point.t_valid_to),
  );
  return hit?.price_paise ?? null;
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  }
  return sorted[mid] ?? 0;
}

function toPoint(row: PriceRow): PricePoint {
  return {
    t_valid_from: row.t_valid_from,
    t_valid_to: row.t_valid_to,
    price_paise: row.price_paise,
    tier: row.tier,
    attestation_jti: row.attestation_jti,
  };
}
