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
 * a card with a made-up number is worse than no card.
 *
 * DECISION: and a tile that matches nothing in the query is dropped too, even
 * when the window really was shown it. `requestOverlap` is the same word
 * overlap the shelf is matched with, so an open-web card is chosen the way a
 * catalog card is. Live, an errand that searched a storefront for an SSD and
 * then bounced back to its front page offered "Starting ₹99" and "Wireless" —
 * real tiles, really read, and not one of them what anybody asked for. Nothing
 * matching means no cards: the errand's own sentence still stands, and an
 * empty grid is better than four confident wrong ones.
 */
/**
 * Exactly the findings that will become cards, as findings.
 *
 * DECISION: the summary is grounded on this rather than on every tile the
 * window was shown, because the prose and the cards have to be about the same
 * things. A live run recommended a SanDisk at ₹17,999 above a grid of Ustick,
 * HIKVISION, Crucial and EVM: every one of them real, none of them the one it
 * was talking about. The filter that decides what is on screen now also
 * decides what may be spoken about.
 */
export function cardedListings(
  listings: readonly WebListingView[],
  query: string,
  ceilingPaise: number | null = null,
): readonly WebListingView[] {
  // The model chose these: every row here is a URL it picked from its own
  // search and this host then verified on the page. The shell filters that
  // used to re-judge them (accessory words, capacity tokens, query overlap,
  // the ceiling) second-guessed a choice the model had already made with
  // more context than a token comparison has. A card still needs a price
  // the host itself parsed - that is provenance, not judgment - and the
  // ceiling rides on the card as data for the shopper to see.
  void query;
  void ceilingPaise;
  return listings
    .filter((listing) => listing.price_paise !== null)
    .slice(0, SHOWN);
}

export function webOptionRows(
  listings: readonly WebListingView[],
  query: string,
  ceilingPaise: number | null = null,
): readonly OptionRowData[] {
  return cardedListings(listings, query, ceilingPaise).map(rowOf);
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
