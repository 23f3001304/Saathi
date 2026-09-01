/** Raw text harvested from a page. No parsing has happened yet, on purpose. */
export interface CartRowDom {
  readonly text: string;
  /** The row's own price cell when the markup offered one. */
  readonly priceText: string | null;
  readonly qtyText: string | null;
}

export interface CartDom {
  readonly rows: readonly CartRowDom[];
  /** Text of any node that looked like a total line, most specific first. */
  readonly totalCandidates: readonly string[];
  readonly url: string;
}

export interface CartItem {
  readonly label: string;
  readonly qty: number;
  readonly unitPaise: number | null;
  readonly linePaise: number | null;
}

/**
 * How much the reading should be trusted. `none` and `low` are not decorative:
 * `CartCovenant` refuses to assist on either, because a cap compared against a
 * number we guessed is a cap that is not enforced.
 */
export type CartConfidence = "none" | "low" | "medium" | "high";

export interface CartReading {
  readonly totalPaise: number | null;
  readonly currency: string;
  readonly items: readonly CartItem[];
  readonly confidence: CartConfidence;
  /** Which heuristic produced the total, for the journal. */
  readonly basis: string;
}

export const UNREADABLE_CART: CartReading = {
  totalPaise: null,
  currency: "INR",
  items: [],
  confidence: "none",
  basis: "no_price_text_found",
};
