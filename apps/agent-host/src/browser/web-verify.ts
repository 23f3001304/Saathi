import type { BatchRead, PriceCandidate } from "@covenant/browser-drive";

import type { StepSink } from "../purchase/web-steps.js";
import type { WebResult } from "./web-result.js";
import type { WebTrail } from "./web-trail.js";
import { webOk } from "./web-result.js";

/** The one thing verifying needs a browser for. Named as a port rather than
 *  taken as the class, so a test can hand it a page it wrote itself. */
export interface BatchReader {
  readMany(urls: readonly string[]): Promise<readonly BatchRead[]>;
}

/** A product the page published about itself, in the web's own vocabulary
 *  (`schema.org/Product`, OpenGraph) or, failing that, the first tile the
 *  reader recognised. Still the page's claim, still untrusted. */
export interface DeclaredProduct {
  readonly name: string;
  readonly price_text: string;
  readonly image_url: string | null;
}

/** One page as this host read it, handed over whole. There is no `ref` here
 *  and no listing: a read is evidence, and naming the product out of it is
 *  `web_card`'s job. */
export interface VerifiedPage {
  readonly url: string;
  readonly ok: boolean;
  readonly sold_out: boolean;
  readonly title: string | null;
  readonly heading: string | null;
  readonly declared: DeclaredProduct | null;
  readonly prices: readonly PriceCandidate[];
  readonly text: string;
  readonly failure: string | null;
}

/**
 * The pages this errand has actually opened, keyed by the URL each one
 * settled on. It is the whole of what `web_card` may card against: a row
 * naming a URL that is not in here was never read by this host, and no
 * amount of confidence in the model's memory of it changes that.
 */
export class VerifiedReads {
  private readonly byUrl = new Map<string, VerifiedPage>();

  remember(pages: readonly VerifiedPage[]): void {
    for (const page of pages) {
      this.byUrl.set(page.url, page);
    }
  }

  find(url: string): VerifiedPage | null {
    return this.byUrl.get(url) ?? null;
  }
}

/**
 * Batched verification for research: the model names up to six product URLs
 * it found by search, and this host reads them all at once, headless and
 * read-only, off the pages themselves.
 *
 * DECISION: it records nothing. This used to mint a card per page out of the
 * document title and the biggest money string, which on a signed-out Amazon
 * page are "Hello, Sign In" and a cart widget's ₹0.00 — the host guessing at
 * a listing and being wrong in the shopper's face. What it hands back now is
 * what the page printed, in the shape a person reads it in, and the model
 * says which of it is a product by calling `web_card`.
 */
export class VerifyVerbs {
  constructor(
    private readonly reader: BatchReader,
    /** Where the batch is kept for `CardVerbs` to check rows against. */
    private readonly reads: VerifiedReads,
    private readonly trail: WebTrail,
    /** One pill per page read: research off the window still shows its
     *  work, or a seventy-second search reads as a hang. */
    private readonly steps: StepSink | null = null,
  ) {}

  async verify(urls: readonly string[]): Promise<WebResult> {
    this.steps?.step(
      urls.length === 1 ? "Checking 1 page" : `Checking ${urls.length} pages`,
    );
    const read = await this.reader.readMany(urls);
    const pages = read.map((one) => pageOf(one));
    for (const page of pages) {
      if (page.ok) this.trail.record(page.url);
      this.steps?.step(pillFor(page));
    }
    this.reads.remember(pages);
    return webOk({ pages });
  }
}

/** One read, turned into the shape the model reads it in. Every field is the
 *  page's own characters; nothing here chooses between them. */
function pageOf(read: BatchRead): VerifiedPage {
  const tile = read.dom?.listings[0] ?? null;
  return {
    url: read.url,
    ok: read.dom !== null,
    sold_out: read.soldOut,
    title: read.dom?.title.trim() ?? null,
    heading: read.dom?.heading ?? null,
    declared:
      tile === null
        ? null
        : {
            name: tile.title,
            price_text: tile.priceText,
            image_url: tile.imageUrl,
          },
    prices: read.prices,
    text: read.text,
    failure: read.failure,
  };
}

/** What one read says on its pill: the shop, and what stopped it if
 *  anything did. Never the title (a pill is a glance, the card is the read). */
function pillFor(page: VerifiedPage): string {
  const shop = hostOf(page.url);
  if (page.failure !== null) return `${shop} · did not load`;
  if (page.sold_out) return `${shop} · out of stock`;
  return `Read ${shop}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
