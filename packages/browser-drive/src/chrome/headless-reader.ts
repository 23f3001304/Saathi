import type { Browser, Page } from "puppeteer";
import { launch } from "puppeteer";

import type { NavigationPolicy } from "../drive/navigation-policy.js";
import type { PageDom } from "../read/page-dom.js";
import { mergeListings } from "../read/listing-merge.js";
import { readPageDom } from "./read-script.js";
import { readDeclaredListings } from "./listing-script.js";
import { readTileListings } from "./tile-script.js";

/** One page of a batch, as this host read it. `dom: null` names a page that
 *  refused to load, timed out, or was refused by the navigation policy. */
export interface BatchRead {
  readonly requested: string;
  readonly url: string;
  readonly dom: PageDom | null;
  /** The currency string the page renders biggest - the price a product
   *  page is showing. Empty where none was found (a storefront, a search
   *  page). Site-agnostic: prominence is every shop's own signal. */
  readonly priceText: string;
  /** The page's own words said the thing cannot be bought right now. */
  readonly soldOut: boolean;
  readonly failure: string | null;
}

const PER_PAGE_MS = 15_000;
const PARALLEL = 5;

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
 * Images, media, fonts and stylesheets are blocked per request: the reader
 * wants the DOM, and a product page is megabytes of pictures it will never
 * look at. That block is most of why a batch of five reads lands in a few
 * seconds.
 */
export class HeadlessReader {
  private browser: Browser | null = null;

  constructor(private readonly policy: NavigationPolicy) {}

  async readMany(urls: readonly string[]): Promise<readonly BatchRead[]> {
    const held = await this.open();
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

  async close(): Promise<void> {
    const held = this.browser;
    this.browser = null;
    await held?.close().catch(() => undefined);
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
      const dom = await readAll(page);
      const price = await page.evaluate(priceProbe).catch(() => "");
      const text = await page
        .evaluate(() => document.body.innerText.slice(0, 20_000))
        .catch(() => "");
      return {
        requested: url,
        url: page.url(),
        dom,
        priceText: price,
        soldOut: SOLD_OUT.test(text),
        failure: null,
      };
    } catch (cause) {
      return refused(url, cause instanceof Error ? cause.message : "unknown");
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  private async open(): Promise<Browser> {
    if (this.browser !== null && this.browser.connected) {
      return this.browser;
    }
    this.browser = await launch({
      headless: true,
      args: ["--disable-gpu", "--blink-settings=imagesEnabled=false"],
    });
    return this.browser;
  }
}

async function readAll(page: Page): Promise<PageDom> {
  const dom = await page.evaluate(readPageDom);
  const declared = await page.evaluate(readDeclaredListings);
  const implied = await page.evaluate(readTileListings);
  return { ...dom, listings: mergeListings(declared, implied) };
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
    priceText: "",
    soldOut: false,
    failure,
  };
}

/** Runs inside the page, serialized over CDP, so it is one flat function.
 *  A candidate is an element whose own text IS a money string, whole and
 *  alone - "₹9,390.00", never "Under Rs. 700/month" - with anything struck
 *  through excluded. Prominence scores it: a visible candidate by its own
 *  font size, a hidden one (the accessibility span split-digit prices ship
 *  their readable copy in) by the visible container it sits inside. The
 *  biggest wins, which is the shop's own way of saying which number is the
 *  price. */
function priceProbe(): string {
  const WHOLE = /^(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d+)?$/;
  const owns = (el: Element): string =>
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
  const sizeOf = (el: Element): number => {
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      return Number.parseFloat(getComputedStyle(el).fontSize) || 0;
    }
    const parent = el.parentElement;
    if (parent === null) return 0;
    const held = parent.getBoundingClientRect();
    return held.width > 0 && held.height > 0
      ? Number.parseFloat(getComputedStyle(parent).fontSize) || 0
      : 0;
  };
  const best = Array.from(document.querySelectorAll("span,div,p,ins,b,strong"))
    .filter((el) => el.closest("del,s,strike") === null)
    .map((el) => ({ text: owns(el), el }))
    .filter((held) => WHOLE.test(held.text))
    .map((held) => ({ text: held.text, size: sizeOf(held.el) }))
    .sort((a, b) => b.size - a.size)[0];
  return best?.text ?? "";
}
