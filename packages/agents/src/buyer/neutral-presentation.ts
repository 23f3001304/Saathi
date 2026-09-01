/**
 * ARCHITECTURE §5.7, neutral presentation. Default effects steer choices, so
 * the order the human sees is declared out loud and derived from their own
 * stated preferences — never from what a merchant paid for. There is no
 * "sponsored" sort key here, and the type makes adding one a visible edit.
 */
export const SORT_KEYS = [
  "price_asc",
  "trust_desc",
  "preference_match",
  "anchor_gap_desc",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_KEY_REASON: Record<SortKey, string> = {
  price_asc: "Sorted by verified price, lowest first.",
  trust_desc:
    "Sorted by merchant trust score, computed from quote-mismatch and refund-honour history.",
  preference_match:
    "Sorted by how closely each option matches the preferences you have confirmed.",
  anchor_gap_desc:
    "Sorted by how far today's price sits below the 30-day verified median.",
};

export interface PresentableOption {
  readonly sku: string;
  readonly label: string;
  readonly pricePaise: number;
  readonly merchantId: string;
  readonly trustScore: number;
  readonly preferenceScore: number;
  /** `null` when the SKU has no verified price history yet. */
  readonly anchorMedianPaise: number | null;
  /** P0 text found on the listing: shown as a flag, never used to order. */
  readonly manipulationCues: readonly string[];
  /** The merchant's own picture, where they gave one. Carried, never ranked. */
  readonly imageUrl: string | null;
}

export interface Presentation {
  readonly sortKey: SortKey;
  readonly sortKeyReason: string;
  readonly options: readonly PresentableOption[];
}

function anchorGap(option: PresentableOption): number {
  return option.anchorMedianPaise === null
    ? 0
    : option.anchorMedianPaise - option.pricePaise;
}

const COMPARATORS: Record<
  SortKey,
  (left: PresentableOption, right: PresentableOption) => number
> = {
  price_asc: (left, right) => left.pricePaise - right.pricePaise,
  trust_desc: (left, right) => right.trustScore - left.trustScore,
  preference_match: (left, right) =>
    right.preferenceScore - left.preferenceScore,
  anchor_gap_desc: (left, right) => anchorGap(right) - anchorGap(left),
};

/**
 * Ties break on SKU rather than on input order: input order is whatever the
 * merchant's catalog tool happened to return, which is precisely the channel a
 * paid placement would arrive through.
 */
export function presentNeutrally(
  options: readonly PresentableOption[],
  sortKey: SortKey,
): Presentation {
  const compare = COMPARATORS[sortKey];
  const sorted = [...options].sort(
    (left, right) => compare(left, right) || left.sku.localeCompare(right.sku),
  );
  return {
    sortKey,
    sortKeyReason: SORT_KEY_REASON[sortKey],
    options: sorted,
  };
}
