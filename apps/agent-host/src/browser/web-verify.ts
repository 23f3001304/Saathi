import type { BatchRead, HeadlessReader } from "@covenant/browser-drive";

import type { WebFindings } from "./web-listing.js";
import type { StepSink } from "../purchase/web-steps.js";
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
    /** One pill per page read: research off the window still shows its
     *  work, or a seventy-second search reads as a hang. */
    private readonly steps: StepSink | null = null,
  ) {}

  async verify(urls: readonly string[]): Promise<WebResult> {
    this.steps?.step(
      urls.length === 1 ? "Checking 1 page" : `Checking ${urls.length} pages`,
    );
    const reads = await this.reader.readMany(urls);
    const rows = reads.map((read) => this.rowOf(read));
    for (const row of rows) {
      this.steps?.step(pillFor(row));
    }
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

/** What one read says on its pill: the shop, and what stopped it if
 *  anything did. Never the title (a pill is a glance, the card is the read). */
function pillFor(row: VerifiedRow): string {
  const shop = hostOf(row.url);
  if (row.failure !== null) return `${shop} · did not load`;
  if (row.sold_out) return `${shop} · out of stock`;
  if (row.ref === null) return `${shop} · no listing readable`;
  return `Read ${shop} · ${row.price_text ?? ""}`.trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
