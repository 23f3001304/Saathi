import type { IsoTimestamp } from "./iso-timestamp.js";
import type { Tier } from "./memory-type.js";

/** The quote reference the merchant signs into the Cart Mandate (§6.3). */
export interface CartQuoteRef {
  readonly quote_jti: string;
  readonly quote_total_paise: number;
  readonly quote_expiry: IsoTimestamp;
  readonly reservation_id: string;
  readonly reservation_expires_at: IsoTimestamp;
}

/**
 * The merchant-signed quote as `QuoteMatchCheck` sees it — resolved from a P2
 * memory entry by `quote_jti`, never from the cart body it is checking (§8.4).
 */
export interface SignedQuote {
  readonly quote_jti: string;
  readonly sku_id: string;
  readonly total_paise: number;
  /** The buyer's single ask, echoed into what the merchant signed; `null` when
   *  the buyer asked for nothing and the quote is simply the listed price. */
  readonly asked_unit_paise: number | null;
  readonly quote_expiry: IsoTimestamp;
  readonly reservation_id: string;
  /** kid of the merchant key that attested it. */
  readonly signed_by: string;
  /** Must be P2: an unsigned scrape can never satisfy the quote check. */
  readonly tier: Tier;
}

export const STOCK_RESERVATION_STATES = [
  "claimed",
  "confirmed",
  "released",
] as const;

export type StockReservationStatus = (typeof STOCK_RESERVATION_STATES)[number];

/**
 * The last-unit race resolver (§5.2 d): the merchant mints one reservation id
 * per unit and the first cart to claim it wins; the loser gets
 * `STOCK_CONFLICT`, which is deliberately not a merchant-trust penalty.
 */
export interface StockReservationState {
  readonly reservation_id: string;
  readonly merchant_id: string;
  readonly sku_id: string;
  readonly qty: number;
  readonly quote_jti: string;
  readonly cart_mandate_id: string;
  readonly state: StockReservationStatus;
  readonly expires_at: IsoTimestamp;
}
