import { parsePaise } from "@covenant/browser-drive";

import { pictureFor } from "./web-card-image.js";
import type { WebFindings } from "./web-listing.js";
import type { WebResult } from "./web-result.js";
import type { VerifiedPage, VerifiedReads } from "./web-verify.js";
import { webOk } from "./web-result.js";

/** Why a named row did not become a card: a fact about the page this host
 *  itself opened, checked here rather than argued about in a prompt - no word
 *  list, no shape rule, nothing that guesses what a listing looks like.
 *  `off_shop` is declared and not yet raised; the shop pin fills it next. */
export type CardRefusal =
  | "url_not_verified"
  | "off_shop"
  | "price_not_positive"
  | "price_not_on_page"
  | "title_not_on_page";

/** What the model names off a page it has just been handed. Untrusted text,
 *  all of it: the URL must be one this host read, and both strings must be
 *  on that page. */
export interface CardRow {
  readonly url: string;
  readonly title: string;
  readonly price_text: string;
  readonly image_url?: string | null;
}

/** Generous caps, trimmed here as `web_found` trims: a model that annotated
 *  a price has still read a real listing, and the trim is also what makes a
 *  trailing space of the model's own harmless. */
const MAX_TITLE = 200;
const MAX_PRICE = 60;

/**
 * The model naming the listings it read, and this host checking the words.
 *
 * DECISION: verbatim containment and a numeric floor, and nothing else. The
 * host cannot tell a product from page chrome — it tried, and carded "Hello,
 * Sign In" at ₹0.00 — but it *can* tell whether the words the model wrote are
 * the words the page printed and whether the price is a number above zero.
 * Which of those the shopper wants is the model's reading, made with the
 * page's own text in front of it.
 */
export class CardVerbs {
  constructor(
    private readonly findings: WebFindings,
    private readonly reads: VerifiedReads,
  ) {}

  card(rows: readonly CardRow[]): WebResult {
    const carded: CardedRow[] = [];
    const refused: { url: string; reason: CardRefusal }[] = [];
    for (const row of rows) {
      const stated = trimmed(row);
      const read = this.reads.find(row.url);
      const reason = refusalFor(stated, read);
      const view = reason === null ? this.mint(stated, read) : null;
      if (view !== null) carded.push(view);
      // The findings table has the last word and can still refuse a row all
      // four checks passed - a `file:` URL, say. It will not put that on a
      // card, so neither will this.
      else refused.push({ url: row.url, reason: reason ?? "url_not_verified" });
    }
    return webOk({ carded, refused });
  }

  /** The ref is minted by the findings table, exactly as for a tile read off
   *  a page, so a pick still resolves only to a row this host recorded; the
   *  picture is whatever survived `pictureFor`. */
  private mint(row: CardRow, read: VerifiedPage | null): CardedRow | null {
    const view = this.findings.record([
      {
        title: row.title,
        priceText: row.price_text,
        href: row.url,
        imageUrl: pictureFor(read, row.image_url),
      },
    ])[0];
    return view === undefined
      ? null
      : {
          ref: view.ref,
          url: view.url,
          title: view.title,
          price_text: view.price_text,
          image_url: view.image_url,
        };
  }
}

/** A card as the model reads it back: the host's ref, the words it accepted,
 *  and `image_url: null` where the card goes up under the woven mark. */
interface CardedRow {
  readonly ref: string;
  readonly url: string;
  readonly title: string;
  readonly price_text: string;
  readonly image_url: string | null;
}

function trimmed(row: CardRow): CardRow {
  return {
    url: row.url,
    title: row.title.slice(0, MAX_TITLE).trim(),
    price_text: row.price_text.slice(0, MAX_PRICE).trim(),
    image_url: row.image_url ?? null,
  };
}

/** The order a person would ask in: was this page read at all, is that a
 *  price, did the page print it, is that what the page calls the thing. A
 *  ₹0.00 row is refused as free before it is refused as absent, because
 *  "nothing costs nothing" is the more useful sentence to read back. */
function refusalFor(
  row: CardRow,
  read: VerifiedPage | null,
): CardRefusal | null {
  if (read === null || !read.ok) return "url_not_verified";
  const paise = parsePaise(row.price_text);
  if (paise === null || paise <= 0) return "price_not_positive";
  if (!printed(read, row.price_text)) return "price_not_on_page";
  if (!named(read, row.title)) return "title_not_on_page";
  return null;
}

/** Either the page's text carries the string, or the probe listed it as one
 *  of the money strings the page rendered. The second is not a loosening:
 *  the excerpt is capped, and a price below the cap is still printed. */
function printed(read: VerifiedPage, price: string): boolean {
  return (
    read.text.includes(price) || read.prices.some((one) => one.text === price)
  );
}

/** A page's own name for the thing is often only in its title tag or its h1 -
 *  the body text says "Add to cart" and the specs. Those are the page's own
 *  words too, so naming it by one of them is verbatim in the sense that
 *  matters. `declared` is the page's published product, never a tile. */
function named(read: VerifiedPage, title: string): boolean {
  return (
    read.text.includes(title) ||
    title === read.title ||
    title === read.heading ||
    title === read.declared?.name
  );
}
