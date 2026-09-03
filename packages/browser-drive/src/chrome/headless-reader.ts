import type { Browser, Page } from "puppeteer";

import type { NavigationPolicy } from "../drive/navigation-policy.js";
import { NativeReaderBrowser, type ReaderBrowser } from "./reader-browser.js";
import type { PageDom, PageListing } from "../read/page-dom.js";
import { mergeListings } from "../read/listing-merge.js";
import { readPageDom } from "./read-script.js";
import { readDeclaredListings } from "./listing-script.js";
import { readTileListings } from "./tile-script.js";
import type { PriceCandidate, ScannedPrice } from "./price-probe.js";
import { rankPrices, scanPrices } from "./price-probe.js";

/** One page of a batch, as this host read it. `dom: null` names a page that
 *  refused to load, timed out, or was refused by the navigation policy. */
export interface BatchRead {
  readonly requested: string;
  readonly url: string;
  readonly dom: PageDom | null;
  /** What the page published about itself in the web's own vocabulary -
   *  `schema.org/Product`, microdata, OpenGraph. Kept apart from `dom.listings`,
   *  which merges these with the tiles the reader inferred: a tile is this
   *  host's reading of a layout, and calling one a declaration would let an
   *  upsell speak in the shop's own voice. Empty where nothing was declared. */
  readonly declared: readonly PageListing[];
  /** Every money string the page printed, most prominent first, each with
   *  the words around it. Empty where none was found. Nothing here says
   *  which one is a price: that is a reading, and it is not this host's. */
  readonly prices: readonly PriceCandidate[];
  /** What the page shows a person, whitespace collapsed - long enough to
   *  read a listing out of, short enough to hand to a model. */
  readonly text: string;
  /** The page's own words said the thing cannot be bought right now. */
  readonly soldOut: boolean;
  readonly failure: string | null;
}

const PER_PAGE_MS = 15_000;
const PARALLEL = 5;
const MAX_TEXT = 8_000;

/** The stock probe is a text scan of the page this host itself loaded: data
 *  capture off a real document, not a judgment about anybody's sentence. */
const SOLD_OUT = /out of stock|currently unavailable|sold out|अभी उपलब्ध नहीं/i;

/**
 * A read-only browser for research: headless, parallel, and structurally
 * unable to act. No input method exists on this class - not a click, not a
 * keystroke, not a form fill - so nothing read here can become an action,
 * and every purchase still happens in the visible window the shopper
 * watches. The launcher's "no headless" decision is about purchase
 * sessions; this reads, which is what a search engine does.
 *
 * Images, media and fonts are blocked per request: the reader wants the DOM,
 * and a product page is megabytes of pictures it will never look at. That
 * block is most of why a batch of five reads lands in a few seconds.
 */
export class HeadlessReader {
  constructor(
    private readonly policy: NavigationPolicy,
    private readonly surface: ReaderBrowser = new NativeReaderBrowser(),
  ) {}

  /**
   * DECISION: a browser per batch, opened and closed here however the batch
   * ends. The container surface must not outlive the read it was started for -
   * a throwaway profile is only throwaway if it goes - and one lifetime rule
   * beats one rule per surface. A browser that will not start is this batch's
   * answer rather than this process's: the errand hears that the read did not
   * happen and carries on.
   */
  async readMany(urls: readonly string[]): Promise<readonly BatchRead[]> {
    let held: Browser;
    try {
      held = await this.surface.open();
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : "unknown";
      return urls.map((url) => refused(url, why));
    }
    try {
      return await this.drain(held, urls);
    } finally {
      await this.surface.close();
    }
  }

  async close(): Promise<void> {
    await this.surface.close();
  }

  private async drain(
    held: Browser,
    urls: readonly string[],
  ): Promise<readonly BatchRead[]> {
    const queue = [...urls];
    const out: BatchRead[] = [];
    const workers = Array.from(
      { length: Math.min(PARALLEL, queue.length) },
      async () => {
        for (;;) {
          const url = queue.shift();
          if (url === undefined) return;
          out.push(await this.readOne(held, url));
        }
      },
    );
    await Promise.all(workers);
    const order = new Map(urls.map((url, at) => [url, at]));
    return out.sort(
      (a, b) => (order.get(a.requested) ?? 0) - (order.get(b.requested) ?? 0),
    );
  }

  private async readOne(browser: Browser, url: string): Promise<BatchRead> {
    const decision = this.policy.check(url);
    if (!decision.allowed) {
      return refused(url, decision.rule);
    }
    let page: Page | null = null;
    try {
      page = await browser.newPage();
      await quieten(page);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: PER_PAGE_MS,
      });
      // One settle beat for late-rendered prices; cheap next to a full load.
      await new Promise((resolve) => setTimeout(resolve, 600));
      const read = await readAll(page);
      const scanned = await page
        .evaluate(scanPrices)
        .catch((): ScannedPrice[] => []);
      const text = await page
        .evaluate(() => document.body.innerText.slice(0, 20_000))
        .catch(() => "");
      return {
        requested: url,
        url: page.url(),
        dom: read.dom,
        declared: read.declared,
        prices: rankPrices(scanned),
        text: flatten(text),
        soldOut: SOLD_OUT.test(text),
        failure: null,
      };
    } catch (cause) {
      return refused(url, cause instanceof Error ? cause.message : "unknown");
    } finally {
      await page?.close().catch(() => undefined);
    }
  }
}

interface FullRead {
  readonly dom: PageDom;
  readonly declared: readonly PageListing[];
}

async function readAll(page: Page): Promise<FullRead> {
  const dom = await page.evaluate(readPageDom);
  const declared = await page.evaluate(readDeclaredListings);
  const implied = await page.evaluate(readTileListings);
  return {
    dom: { ...dom, listings: mergeListings(declared, implied) },
    declared,
  };
}

async function quieten(page: Page): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const kind = request.resourceType();
    // Stylesheets load on purpose: the price probe reads prominence off
    // computed font sizes, and with CSS blocked every candidate collapses
    // to the default and an upsell outranked the buy box.
    if (kind === "image" || kind === "media" || kind === "font") {
      void request.abort();
    } else {
      void request.continue();
    }
  });
}

function refused(url: string, failure: string): BatchRead {
  return {
    requested: url,
    url,
    dom: null,
    declared: [],
    prices: [],
    text: "",
    soldOut: false,
    failure,
  };
}

/** The page's own words, without its line breaks and its indentation. */
function flatten(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}
