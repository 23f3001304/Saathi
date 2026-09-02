import type { WebListingView } from "../browser/web-listing.js";
import { merchantOf } from "../browser/browser-view.js";
import type { OptionRowData } from "../http/chat-beat.js";

/** Enough to choose between; more than this is a search results dump. */
const SHOWN = 4;

/**
 * An open-web finding as an option card, in the same shape the catalog path
 * emits — `OptionRowData`, the `options` beat, `OptionSet`.
 *
 * DECISION: the same beat, not a parallel one. A web finding used to end the
 * turn as a paragraph — "PNY CS900 250GB … ₹4,756.10 … [link]" — beside a
 * platform path that has rendered picture cards since the first demo. Two
 * presentations for one act made the open web look like the lesser half of the
 * product, when it is the half that goes and looks.
 *
 * DECISION: `quoteSigned: false`, on the field the platform card already uses
 * to say "signed quote". It is the honest value: nobody signed a price on that
 * shop. A parallel provenance field would have let a card be built that carried
 * neither, and the entire point of the card is that it cannot.
 *
 * DECISION: a listing whose price would not parse into this covenant's currency
 * is dropped rather than shown at zero. A card states a number under a picture;
 * a card with a made-up number is worse than no card. That is the only rule
 * left here: the word-overlap, accessory, capacity and ceiling filters that
 * re-judged the model's own reported rows are gone, because every row here is
 * a URL the model picked with the conversation in front of it and this host
 * then read the price off the page itself.
 */
export function cardedListings(
  listings: readonly WebListingView[],
): readonly WebListingView[] {
  return listings
    .filter((listing) => listing.price_paise !== null)
    .slice(0, SHOWN);
}

export function webOptionRows(
  listings: readonly WebListingView[],
): readonly OptionRowData[] {
  return cardedListings(listings).map(rowOf);
}

function rowOf(listing: WebListingView): OptionRowData {
  return {
    id: listing.ref,
    sku: listing.ref,
    title: listing.title,
    pricePaise: listing.price_paise ?? 0,
    // The shop published neither, and inventing a rating for a thing nobody
    // rated is the confident fiction this system exists to make impossible.
    rating: 0,
    deliveryDays: 0,
    merchant: merchantOf(listing.url),
    quoteSigned: false,
    sourceUrl: listing.url,
    ...(listing.image_url === null ? {} : { imageUrl: listing.image_url }),
  };
}
