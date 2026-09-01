import type { CartDom } from "../src/cart/cart-dom.js";
import type { ElementDescriptor } from "../src/field/element-descriptor.js";
import type { Caster, DrivenPage, FieldSnapshot } from "../src/ports.js";
import { FakeCaster } from "./fake-caster.js";
import type { PageDom } from "../src/read/page-dom.js";
import { EMPTY_PAGE } from "../src/read/page-dom.js";

export const EMPTY_CART: CartDom = { rows: [], totalCandidates: [], url: "" };

export interface FakePageOptions {
  readonly url: string;
  readonly elements?: Readonly<Record<string, ElementDescriptor>>;
  readonly texts?: Readonly<Record<string, string>>;
  readonly cart?: CartDom;
  readonly page?: PageDom;
  readonly present?: readonly string[];
  /** What `describeAt` finds, keyed `"x,y"`. */
  readonly points?: Readonly<Record<string, ElementDescriptor>>;
  readonly focused?: ElementDescriptor | null;
  readonly fields?: readonly FieldSnapshot[];
  /** The PNG `screenshot()` hands back, so redaction can be checked on pixels. */
  readonly png?: Uint8Array;
  /** `true` stands in for a surface that cannot screencast at all. */
  readonly noCaster?: boolean;
}

/** A `DrivenPage` that records instead of driving. No browser, no timing. */
export class FakePage implements DrivenPage {
  readonly cast = new FakeCaster();
  readonly typed: { selector: string; text: string }[] = [];
  readonly clicked: string[] = [];
  readonly visited: string[] = [];
  readonly relayed: { action: string; detail: string }[] = [];
  fronted = 0;
  /** How many times the shutter actually opened. A blackout must leave it at 0. */
  screenshots = 0;
  /** Per-frame proof that the guard ran, on the fast path as well as the slow. */
  focusReads = 0;
  fieldReads = 0;
  private current: string;
  private present: readonly string[];
  private focus: ElementDescriptor | null;
  private fields: readonly FieldSnapshot[];

  constructor(private readonly options: FakePageOptions) {
    this.current = options.url;
    this.present = options.present ?? [];
    this.focus = options.focused ?? null;
    this.fields = options.fields ?? [];
  }

  setFocus(descriptor: ElementDescriptor | null): void {
    this.focus = descriptor;
  }

  caster(): Caster | null {
    return this.options.noCaster === true ? null : this.cast;
  }

  describeAt(x: number, y: number): Promise<ElementDescriptor | null> {
    return Promise.resolve(this.options.points?.[`${x},${y}`] ?? null);
  }

  describeFocused(): Promise<ElementDescriptor | null> {
    this.focusReads += 1;
    return Promise.resolve(this.focus);
  }

  snapshotFields(): Promise<readonly FieldSnapshot[]> {
    this.fieldReads += 1;
    return Promise.resolve(this.fields);
  }

  /** Stands in for the DOM moving under the guard between two frames. */
  setFields(fields: readonly FieldSnapshot[]): void {
    this.fields = fields;
  }

  screenshot(): Promise<Uint8Array> {
    this.screenshots += 1;
    return Promise.resolve(this.options.png ?? new Uint8Array(0));
  }

  bringToFront(): Promise<void> {
    this.fronted += 1;
    return Promise.resolve();
  }

  clickAt(x: number, y: number): Promise<void> {
    this.relayed.push({ action: "click", detail: `${x},${y}` });
    return Promise.resolve();
  }

  typeText(text: string): Promise<void> {
    this.relayed.push({ action: "type", detail: text });
    return Promise.resolve();
  }

  pressKey(name: string): Promise<void> {
    this.relayed.push({ action: "key", detail: name });
    return Promise.resolve();
  }

  scrollBy(dy: number): Promise<void> {
    this.relayed.push({ action: "scroll", detail: String(dy) });
    return Promise.resolve();
  }

  url(): string {
    return this.current;
  }

  /** Stands in for the user navigating in the window the agent cannot touch. */
  setUrl(url: string): void {
    this.current = url;
  }

  setPresent(selectors: readonly string[]): void {
    this.present = selectors;
  }

  goto(url: string): Promise<void> {
    this.current = url;
    this.visited.push(url);
    return Promise.resolve();
  }

  describe(selector: string): Promise<ElementDescriptor | null> {
    return Promise.resolve(this.options.elements?.[selector] ?? null);
  }

  exists(selector: string): Promise<boolean> {
    return Promise.resolve(this.present.includes(selector));
  }

  readText(selector: string): Promise<string | null> {
    return Promise.resolve(this.options.texts?.[selector] ?? null);
  }

  readValue(selector: string): Promise<string | null> {
    const typed = this.typed.filter((entry) => entry.selector === selector);
    return Promise.resolve(typed.map((entry) => entry.text).join(""));
  }

  scrapeCart(): Promise<CartDom> {
    return Promise.resolve(this.options.cart ?? EMPTY_CART);
  }

  readPage(): Promise<PageDom> {
    return Promise.resolve(
      this.options.page ?? { ...EMPTY_PAGE, url: this.current },
    );
  }

  typeInto(selector: string, text: string): Promise<void> {
    this.typed.push({ selector, text });
    return Promise.resolve();
  }

  clickOn(selector: string): Promise<void> {
    this.clicked.push(selector);
    return Promise.resolve();
  }
}
