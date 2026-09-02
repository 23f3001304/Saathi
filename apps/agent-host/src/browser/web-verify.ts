import type { BatchRead, HeadlessReader } from "@covenant/browser-drive";

import type { WebFindings } from "./web-listing.js";
import type { WebResult } from "./web-result.js";
import type { WebTrail } from "./web-trail.js";
import { webFailure, webOk } from "./web-result.js";

/**
 * Batched verification for research: the model names up to six product URLs
 * it found by search, and this host reads them all at once, headless and
 * read-only, off the pages themselves. Every card the shopper sees is built
 * from these reads - the price this host parsed, the stock line this host
 * saw - never from a search snippet's memory of the page. A row the page
 * says is out of stock is reported back and never carded.
 */
export class VerifyVerbs {
  constructor(
    private readonly reader: HeadlessReader,
    private readonly findings: WebFindings,
    private readonly trail: WebTrail,
  ) {}

  async verify(urls: readonly string[]): Promise<WebResult> {
    const reads = await this.reader.readMany(urls);
    const rows = reads.map((read) => this.rowOf(read));
    const carded = rows.filter((row) => row.ref !== null);
    if (carded.length === 0) {
      return webFailure(
        "nothing_verified",
        "None of those pages yielded a listing this host could read in " +
          "stock. Search again with different words or different shops; do " +
          "not recommend anything from these URLs.",
        { pages: rows },
      );
    }
    return webOk({ pages: rows, carded: carded.length });
  }

  /** One page, one row: recorded (and carded) only when the page loaded,
   *  presented a product, and did not say it cannot be bought right now.
   *  The page's own h1 and its biggest printed price name the product; the
   *  first listing tile is only a fallback, because on a product page the
   *  tiles are the upsells - a warranty, an enclosure - not the product. */
  private rowOf(read: BatchRead): VerifiedRow {
    const listing = productOf(read);
    const base = baseRow(read, listing);
    if (listing === null || read.soldOut) {
      return { ...base, ref: null };
    }
    this.trail.record(read.url);
    // The href is the page this host verified, never the tile's own link:
    // a pick must open exactly what was read.
    const recorded = this.findings.record([{ ...listing, href: read.url }]);
    return { ...base, ref: recorded[0]?.ref ?? null };
  }
}

interface VerifiedRow {
  readonly url: string;
  readonly ok: boolean;
  readonly sold_out: boolean;
  readonly title: string | null;
  readonly price_text: string | null;
  readonly ref: string | null;
  readonly failure: string | null;
}

function productOf(read: BatchRead): {
  title: string;
  priceText: string;
  href: string;
  imageUrl: string | null;
} | null {
  // The page's own <title> names the product; the probe's price is the one
  // the page renders biggest. The first listing tile is only a fallback,
  // because on a product page the tiles are upsells: a warranty, a case.
  const title = read.dom?.title.trim() ?? "";
  if (title !== "" && read.priceText !== "") {
    return { title, priceText: read.priceText, href: read.url, imageUrl: null };
  }
  const tile = read.dom?.listings[0] ?? null;
  return tile === null
    ? null
    : {
        title: tile.title,
        priceText: tile.priceText,
        href: read.url,
        imageUrl: tile.imageUrl,
      };
}

function baseRow(
  read: BatchRead,
  listing: { title: string; priceText: string } | null,
): Omit<VerifiedRow, "ref"> {
  return {
    url: read.url,
    ok: read.dom !== null,
    sold_out: read.soldOut,
    title: listing === null ? null : listing.title,
    price_text: listing === null ? null : listing.priceText,
    failure: read.failure,
  };
}
