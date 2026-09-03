import type { Page } from "puppeteer";

import type { CartDom } from "../cart/cart-dom.js";
import type { ElementDescriptor } from "../field/element-descriptor.js";
import type { Caster, DrivenPage, FieldSnapshot } from "../ports.js";
import { MainFrameNavigations } from "./main-frame-navigations.js";
import { freshPage, haltLoading, isStalePage } from "./page-recovery.js";
import { PuppeteerCaster } from "./puppeteer-caster.js";
import type { PageDom } from "../read/page-dom.js";
import { readDeclaredListings } from "./listing-script.js";
import { mergeListings } from "../read/listing-merge.js";
import { readTileListings } from "./tile-script.js";
import { readPageDom } from "./read-script.js";
import type { ElementQuery } from "./element-script.js";
import { readElements } from "./element-script.js";
import {
  scrapeCartDom,
  selectorExists,
  textOfSelector,
  valueOfSelector,
} from "./page-script.js";

const NAV_TIMEOUT_MS = 30_000;
const TYPE_DELAY_MS = 25;
/** Relayed keystrokes arrive one at a time; a per-character delay adds lag. */
const RELAY_DELAY_MS = 0;

/**
 * The puppeteer half of `DrivenPage`, and the only file in the package that
 * knows Chrome exists. It is *unguarded* by design — `GuardedPage` is the thing
 * the agent gets, `UserInput` is the thing the relay gets; this is what both of
 * them are allowed to reach after they have decided. Nothing constructs it
 * except `PuppeteerLauncher`.
 */
export class PuppeteerPage implements DrivenPage {
  private readonly cast: PuppeteerCaster;
  private readonly navs = new MainFrameNavigations();
  /** Reassigned when Chrome retires the one we were holding; see `live`. */
  private page: Page;

  constructor(page: Page) {
    this.page = page;
    this.cast = new PuppeteerCaster(page, this.navs);
  }

  /** Opened, not merely constructed: the counter has its own CDP session. */
  static async open(page: Page): Promise<PuppeteerPage> {
    const driven = new PuppeteerPage(page);
    await driven.cast.follow(page);
    return driven;
  }

  /**
   * Chrome can retire the page object under a long session — a cross-process
   * navigation, a target swap, a tab replaced under us. Every `evaluate` then
   * throws `Attempted to use detached Frame` for the rest of the session while
   * `url()` answers from cache: measured live as 59,000 consecutive 500s
   * behind a card that looked fine. A stale handle is therefore re-resolved
   * against the browser rather than kept; the same classifier, guards and
   * state machine still decide what may be done to whatever it resolves to.
   */
  private async live<T>(run: (page: Page) => Promise<T>): Promise<T> {
    try {
      return await run(this.page);
    } catch (cause) {
      if (!isStalePage(cause)) throw cause;
      this.page = await freshPage(this.page);
      await this.cast.follow(this.page);
      return await run(this.page);
    }
  }

  caster(): Caster {
    return this.cast;
  }

  navigations(): number {
    return this.navs.current();
  }

  url(): string {
    return this.page.url();
  }

  async goto(url: string): Promise<void> {
    await this.live(async (page) => {
      await page.bringToFront().catch(() => undefined);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
    });
  }

  describe(selector: string): Promise<ElementDescriptor | null> {
    return this.first({ kind: "selector", selector });
  }

  describeAt(x: number, y: number): Promise<ElementDescriptor | null> {
    return this.first({ kind: "point", x, y });
  }

  describeFocused(): Promise<ElementDescriptor | null> {
    return this.first({ kind: "focused" });
  }

  snapshotFields(): Promise<readonly FieldSnapshot[]> {
    const query = { kind: "fields" } as ElementQuery;
    return this.live((page) => page.evaluate(readElements, query));
  }

  exists(selector: string): Promise<boolean> {
    return this.live((page) => page.evaluate(selectorExists, selector));
  }

  readText(selector: string): Promise<string | null> {
    return this.live((page) => page.evaluate(textOfSelector, selector));
  }

  readValue(selector: string): Promise<string | null> {
    return this.live((page) => page.evaluate(valueOfSelector, selector));
  }

  scrapeCart(): Promise<CartDom> {
    return this.live((page) => page.evaluate(scrapeCartDom));
  }

  stopLoading(): Promise<void> {
    return haltLoading(this.page);
  }

  /**
   * The controls a decision will be aimed at, then the listings, which are only
   * ever read: what the page declared about its products, and what its
   * structure implies where it declared nothing. See `listing-script.ts` for
   * why the listings are a separate pass from the controls.
   */
  readPage(): Promise<PageDom> {
    return this.live(async (page) => {
      const dom = await page.evaluate(readPageDom);
      const declared = await page.evaluate(readDeclaredListings);
      const implied = await page.evaluate(readTileListings);
      return { ...dom, listings: mergeListings(declared, implied) };
    });
  }

  async typeInto(selector: string, text: string): Promise<void> {
    await this.live((page) =>
      page.type(selector, text, { delay: TYPE_DELAY_MS }),
    );
  }

  async clickOn(selector: string): Promise<void> {
    await this.live((page) => page.click(selector));
  }

  async screenshot(): Promise<Uint8Array> {
    return await this.live((page) =>
      page.screenshot({
        type: "png",
        // The viewport as the user sees it — a full-page capture would show
        // pixels that are not on screen and would not match relayed coordinates.
        fullPage: false,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
      }),
    );
  }

  async bringToFront(): Promise<void> {
    await this.live((page) => page.bringToFront());
  }

  async clickAt(x: number, y: number): Promise<void> {
    await this.live((page) => page.mouse.click(x, y));
  }

  async typeText(text: string): Promise<void> {
    await this.live((page) =>
      page.keyboard.type(text, { delay: RELAY_DELAY_MS }),
    );
  }

  /** Safe by construction: `UserInput` only forwards names from
   *  `RELAY_KEYS`, every one of which is a puppeteer `KeyInput`. */
  async pressKey(name: string): Promise<void> {
    type Key = Parameters<Page["keyboard"]["press"]>[0];
    await this.live((page) => page.keyboard.press(name as Key));
  }

  async scrollBy(dy: number): Promise<void> {
    await this.live((page) => page.mouse.wheel({ deltaY: dy }));
  }

  private async first(query: ElementQuery): Promise<ElementDescriptor | null> {
    const found = await this.live((page) => page.evaluate(readElements, query));
    return found[0]?.descriptor ?? null;
  }
}
