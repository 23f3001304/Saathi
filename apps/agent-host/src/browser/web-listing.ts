import type { PageListing } from "@covenant/browser-drive";
import { parsePaise } from "@covenant/browser-drive";

import { identityOf } from "./listing-identity.js";

/**
 * One listing the sandbox actually read, carrying the ref that names it.
 *
 * `price_paise` is `null` wherever the page's characters could not be read as
 * this covenant's currency — a `$` tile, a "20% off" badge, a bare number. That
 * is not a gap to be filled in: a listing whose price nobody could parse is a
 * listing that cannot be put on a card with a number under it, and inventing
 * one is the failure the whole provenance chain exists to make impossible.
 * `price_text` stays beside it, because what the page printed is the evidence.
 */
export interface WebListingView {
  readonly ref: string;
  readonly title: string;
  readonly price_text: string;
  readonly price_paise: number | null;
  readonly url: string;
  readonly image_url: string | null;
}

/**
 * `https:` only, checked here as well as in the page reader and again at the
 * render site (`primitives/ProductImage.tsx`). The same rule the merchant's own
 * picture passes through in `packages/agents/src/merchant/item-sku.ts`: a URL
 * that becomes an `img src` in somebody's browser is checked wherever it
 * crosses a boundary, because a boundary that trusts its caller ships whatever
 * its caller was given.
 */
function pictureOf(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Same allow-list, applied to the link the card would send the run to. */
function targetOf(raw: string): string | null {
  try {
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * What the shopper would call the same thing: its name and its price.
 *
 * DECISION: not the URL. Large shops rewrite tracking parameters on every read,
 * so one product looked at twice arrives as two links and was two identical
 * cards side by side, each eating one of the four places on offer — and the
 * same shops route several tiles through one redirect path, so cutting the
 * query instead would have collapsed different products into one. A title and
 * a price are what a person compares; two rows carrying both are one offer.
 */
/**
 * Every product tile the window has been shown, in the order it was read.
 *
 * DECISION: refs are minted here and never by the model, for the same reason
 * `PageRefs` mints control refs — an option the shopper clicks resolves to a
 * listing this host read off a page, or it resolves to nothing at all. There is
 * no path from a ref to a URL somebody else chose.
 *
 * Unlike `PageRefs` this does not clear on navigation: the cards stay on screen
 * after the errand has moved on, and a pick has to still mean something when it
 * arrives a minute later.
 */
export class WebFindings {
  private readonly pages: (readonly WebListingView[])[] = [];
  private minted = 0;

  /** How many pages had been read before an errand began. */
  get length(): number {
    return this.pages.length;
  }

  record(found: readonly PageListing[]): readonly WebListingView[] {
    const listings = found
      .map((listing) => this.viewOf(listing))
      .filter((listing): listing is WebListingView => listing !== null);
    this.pages.push(listings);
    return listings;
  }

  /**
   * Everything the window was shown since `from`, oldest first, one entry per
   * page it links to.
   *
   * One entry per product: a listing read on the results page and again on the
   * page after it is one thing the shopper can be offered, not two.
   *
   * DECISION: every tile, not the best page. Choosing a page was the wrong
   * question and got the wrong answer live: an errand that ran a search and
   * then bounced back to the storefront offered its promo rail — "Starting
   * ₹99", "Wireless" — because that read happened to carry the most tiles.
   * Which page a tile was on says nothing about whether it is what the shopper
   * asked for; `webOptionRows` asks that question directly, against the
   * errand's own query.
   */
  since(from: number): readonly WebListingView[] {
    const seen = new Set<string>();
    return this.pages.slice(Math.max(from, 0)).flatMap((page) =>
      page.filter((listing) => {
        const identity = identityOf(listing);
        const fresh = !seen.has(identity);
        seen.add(identity);
        return fresh;
      }),
    );
  }

  find(ref: string): WebListingView | null {
    for (const page of this.pages) {
      const found = page.find((listing) => listing.ref === ref);
      if (found !== undefined) return found;
    }
    return null;
  }

  private viewOf(listing: PageListing): WebListingView | null {
    const url = targetOf(listing.href);
    if (url === null || listing.title === "") return null;
    const paise = parsePaise(listing.priceText);
    // Nothing a shopper can buy costs nothing. A ₹0.00 row is page chrome
    // that reached the shelf — a signed-out cart widget, a sign-in bar —
    // and the live run that carded "Cart 0 item(s) - ₹0.00" is why this is
    // here rather than in whichever caller happened to notice. Unparseable
    // is still allowed and still `null`: that is a price nobody could read,
    // which is a different thing from a price of nothing.
    if (paise !== null && paise <= 0) return null;
    this.minted += 1;
    return {
      ref: `w${this.minted}`,
      title: listing.title,
      price_text: listing.priceText,
      price_paise: paise,
      url,
      image_url: pictureOf(listing.imageUrl),
    };
  }
}
