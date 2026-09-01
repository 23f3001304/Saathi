// `GET /v1/folds/*` in the gateway's own shape, turned into the tiles and rows
// the Ledger screen reads. Every number here is folded from the log; nothing
// is derived that the fold does not actually record.
import type { FoldSummary, MerchantTrustEntry, PricePoint } from "./types.ts";

export interface RawFoldSummary {
  readonly events: number;
  readonly memories: number;
  readonly mandates: number;
  readonly txns: number;
  readonly folds: readonly {
    name: string;
    last_seq: number;
    state_hash: string;
  }[];
  readonly last_materialized_at: string | null;
}

export interface RawMerchantTrust {
  readonly merchant_id: string;
  readonly trust_score: number;
  readonly quotes_total: number;
  readonly quote_mismatches: number;
  readonly manipulation_attempts: number;
  readonly refunds_honored: number;
}

export interface RawPricePoint {
  readonly t_valid_from: string;
  readonly price_paise: number;
}

const TILE_TITLES: Record<string, string> = {
  memory: "Memory",
  merchant_trust: "Merchant trust",
  sku_price_history: "Price history",
  user_prefs: "Preferences",
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function headlineFor(name: string, raw: RawFoldSummary): string {
  if (name === "memory") return plural(raw.memories, "memory", "memories");
  if (name === "merchant_trust") return plural(raw.mandates, "mandate");
  if (name === "sku_price_history") return plural(raw.txns, "transaction");
  return plural(raw.events, "event");
}

export function mapFoldSummary(raw: RawFoldSummary): FoldSummary {
  return raw.folds.map((fold) => ({
    fold: TILE_TITLES[fold.name] ?? fold.name,
    headline: headlineFor(fold.name, raw),
    detail: `current to event ${fold.last_seq}`,
  }));
}

function fraction(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

/**
 * `unknownFraction` is zero by construction: the fold counts a quote as
 * matched or mismatched and keeps no third bucket, so there is no unknown
 * share to report. It stays in the view type because the ledger frame has one.
 */
export function mapMerchantTrust(
  rows: readonly RawMerchantTrust[],
): MerchantTrustEntry[] {
  return rows.map((row) => ({
    merchant: row.merchant_id,
    score: row.trust_score,
    honouredFraction: fraction(
      row.quotes_total - row.quote_mismatches,
      row.quotes_total,
    ),
    unknownFraction: 0,
    mismatchFraction: fraction(row.quote_mismatches, row.quotes_total),
    quoteMismatch: `${row.quote_mismatches} of ${row.quotes_total}`,
    manipulation: row.manipulation_attempts,
    // The row itself says "refunds honoured"; the count is all that goes here.
    refunds: row.refunds_honored.toString(),
    flagged: row.manipulation_attempts > 0,
  }));
}

export function mapPricePoints(points: readonly RawPricePoint[]): PricePoint[] {
  return points.map((point) => ({
    ts: point.t_valid_from,
    pricePaise: point.price_paise,
  }));
}
