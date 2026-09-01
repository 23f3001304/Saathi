import type { PageListing } from "./page-dom.js";

/** Enough to choose from; past this it is a page dump, not a set of options. */
const MAX_LISTINGS = 12;

/**
 * What the page declared first, what its structure implied second.
 *
 * The order is the preference: a `schema.org/Product` the shop published is a
 * better account of what it sells than anything inferred from where a picture
 * sits, so a tile whose link a declared listing already claimed is dropped
 * rather than shown twice. Neither reader knows about the other — this is the
 * only place the two passes meet.
 */
export function mergeListings(
  declared: readonly PageListing[],
  implied: readonly PageListing[],
): readonly PageListing[] {
  const seen = new Set<string>();
  return [...declared, ...implied]
    .filter((listing) => {
      const fresh = listing.href !== "" && !seen.has(listing.href);
      seen.add(listing.href);
      return fresh;
    })
    .slice(0, MAX_LISTINGS);
}
