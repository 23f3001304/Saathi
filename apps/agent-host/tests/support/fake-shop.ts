import { encodePng } from "@covenant/browser-drive";
import type {
  CartDom,
  DrivenPage,
  ElementDescriptor,
  FieldSnapshot,
  PageDom,
} from "@covenant/browser-drive";

import { descriptorOf, HOME, pageAt } from "./fake-shop-site.js";
import type { ShopPage } from "./fake-shop-site.js";

export {
  CART,
  CART_PAISE,
  CHECKOUT,
  CHECKOUT_PAISE,
  CHECKPOINT,
  DELIVERY,
  HOME,
  LOGIN,
  PRODUCT,
  PRODUCT_BLUE,
  PRODUCT_TRAIL,
  REVIEW,
  SIGNIN,
  RESULTS,
  RESULTS_AGAIN,
} from "./fake-shop-site.js";

/** A small site, no browser, and the real guards in front of it. */
export class FakeShopPage implements DrivenPage {
  /** This shop is driven, never watched, so there is nothing to screencast. */
  caster(): null {
    return null;
  }

  readonly typed: { selector: string; text: string }[] = [];
  readonly clicked: string[] = [];
  fronted = 0;
  private at = HOME;
  private navigated = 0;
  private failReads = 0;
  private readFailure = "";

  /** Stands in for a page that redirects under the read, as Amazon's does. */
  failNextRead(message: string, times = 1): void {
    this.readFailure = message;
    this.failReads = times;
  }

  url(): string {
    return this.at;
  }
  navigations(): number {
    return this.navigated;
  }
  goto(url: string): Promise<void> {
    this.at = url;
    this.navigated += 1;
    return Promise.resolve();
  }
  private here(): ShopPage {
    return pageAt(this.at);
  }
  stopLoading(): Promise<void> {
    return Promise.resolve();
  }

  readPage(): Promise<PageDom> {
    if (this.failReads > 0) {
      this.failReads -= 1;
      return Promise.reject(new Error(this.readFailure));
    }
    return Promise.resolve(this.here().dom);
  }
  scrapeCart(): Promise<CartDom> {
    return Promise.resolve(this.here().cart);
  }
  describe(selector: string): Promise<ElementDescriptor | null> {
    const control = this.here().dom.controls.find(
      (candidate) => candidate.selector === selector,
    );
    return Promise.resolve(
      control === undefined ? null : descriptorOf(control, this.at),
    );
  }
  describeAt(): Promise<ElementDescriptor | null> {
    return Promise.resolve(null);
  }
  describeFocused(): Promise<ElementDescriptor | null> {
    return Promise.resolve(null);
  }
  snapshotFields(): Promise<readonly FieldSnapshot[]> {
    return Promise.resolve([]);
  }
  exists(): Promise<boolean> {
    return Promise.resolve(false);
  }
  readText(): Promise<string | null> {
    return Promise.resolve(null);
  }
  readValue(selector: string): Promise<string | null> {
    const typed = this.typed.filter((entry) => entry.selector === selector);
    return Promise.resolve(typed.map((entry) => entry.text).join(""));
  }
  typeInto(selector: string, text: string): Promise<void> {
    this.typed.push({ selector, text });
    return Promise.resolve();
  }
  clickOn(selector: string): Promise<void> {
    this.clicked.push(selector);
    return Promise.resolve();
  }
  screenshot(): Promise<Uint8Array> {
    return Promise.resolve(
      encodePng({ width: 4, height: 4, pixels: new Uint8Array(64) }),
    );
  }
  bringToFront(): Promise<void> {
    this.fronted += 1;
    return Promise.resolve();
  }
  clickAt(): Promise<void> {
    return Promise.resolve();
  }
  typeText(): Promise<void> {
    return Promise.resolve();
  }
  pressKey(): Promise<void> {
    return Promise.resolve();
  }
  scrollBy(): Promise<void> {
    return Promise.resolve();
  }
}
