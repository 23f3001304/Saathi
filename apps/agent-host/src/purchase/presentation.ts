import type {
  CatalogListing,
  PresentableOption,
  Presentation,
} from "@covenant/agents";
import { SORT_KEY_REASON, presentNeutrally } from "@covenant/agents";

import type { OptionRowData } from "../http/chat-beat.js";

/**
 * The dark-pattern shield's read side (§5.7). Cues are *flagged*, never obeyed
 * and never used to order — a "only 2 left" that moved an option up the list
 * would be the manipulation working through the defence built to name it.
 */
const CUE_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly cue: string;
}[] = [
  { pattern: /only\s+\d+\s+left/i, cue: "scarcity: stock countdown" },
  { pattern: /selling fast|going fast/i, cue: "scarcity: velocity claim" },
  { pattern: /today only|ends (at|by)|offer ends/i, cue: "urgency: deadline" },
  {
    pattern: /\d+\s*%\s*off|MRP/i,
    cue: "anchor: discount against an unverified list price",
  },
];

export function manipulationCues(description: string): readonly string[] {
  return CUE_PATTERNS.filter(({ pattern }) => pattern.test(description)).map(
    ({ cue }) => cue,
  );
}

function optionOf(listing: CatalogListing): PresentableOption {
  return {
    sku: listing.sku,
    label: listing.label,
    pricePaise: listing.list_price_paise,
    merchantId: listing.merchant_id,
    // No fold data reaches this process: trust and anchors are the gateway's
    // read side (§4.10 `/folds/*`), and an agent that scored its own merchants
    // would be scoring the party it negotiates against.
    trustScore: 0,
    preferenceScore: 0,
    anchorMedianPaise: null,
    manipulationCues: manipulationCues(listing.description.value),
    imageUrl: listing.image_url,
  };
}

/** Sorted by verified price, ascending, with the reason declared out loud. */
export function presentListings(
  listings: readonly CatalogListing[],
): Presentation {
  return presentNeutrally(listings.map(optionOf), "price_asc");
}

export function sortKeyReason(): string {
  return SORT_KEY_REASON["price_asc"];
}

/**
 * `rating` and `deliveryDays` are zero because the frozen demo catalog carries
 * neither, and inventing a rating for a shoe is exactly the kind of confident
 * fiction this whole system exists to make impossible. Reported upward as a
 * catalog/UI gap rather than papered over here.
 *
 * `imageUrl` is the one merchant claim that does reach the card, and it is
 * omitted rather than sent as `null` when there is none — the card falls back
 * to its woven plate on an absent field, and re-checks the scheme before it
 * ever becomes an `img` `src`.
 */
export function optionRowsOf(
  presentation: Presentation,
): readonly OptionRowData[] {
  return presentation.options.map((option) => ({
    id: option.sku,
    sku: option.sku,
    title: option.label,
    pricePaise: option.pricePaise,
    rating: 0,
    deliveryDays: 0,
    merchant: option.merchantId,
    ...(option.imageUrl === null ? {} : { imageUrl: option.imageUrl }),
  }));
}
