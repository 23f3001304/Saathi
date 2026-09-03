import { EMPTY_PAGE, encodePng } from "@covenant/browser-drive";
import type {
  CartDom,
  Caster,
  DrivenPage,
  ElementDescriptor,
  FieldSnapshot,
  PageDom,
} from "@covenant/browser-drive";

import { FakeCaster } from "./fake-caster.js";
import {
  LOGIN,
  PASSWORD,
  PASSWORD_BOX,
  SEARCH,
} from "./fake-sandbox-fields.js";

export { fakeSession } from "./fake-sandbox-session.js";
export {
  LOGIN,
  PASSWORD,
  PASSWORD_BOX,
  SEARCH,
} from "./fake-sandbox-fields.js";

/** A page with one secret on it, no Chrome, and a real PNG to redact. */
export class FakeSandboxPage implements DrivenPage {
  readonly relayed: string[] = [];
  readonly cast = new FakeCaster();
  focused: ElementDescriptor | null = null;
  /** Set empty to stand in for a page with nothing the redactor must paint. */
  fields: readonly FieldSnapshot[] = [
    { descriptor: PASSWORD, rect: PASSWORD_BOX },
  ];
  /** `null` stands in for a surface whose Chrome will not screencast at all. */
  castable: Caster | null = this.cast;
  /**
   * Documents this window has committed. Public because the interesting case
   * is a test bumping it from `underTheShutter` — a navigation that lands
   * between the stamp `FrameCapture` takes and the pixels it comes back with,
   * which is the only way a polled frame of the wrong page is ever served.
   */
  navigated = 0;
  underTheShutter: () => void = () => undefined;
  private at = LOGIN;

  caster(): Caster | null {
    return this.castable;
  }

  navigations(): number {
    return this.navigated;
  }

  url(): string {
    return this.at;
  }
  goto(url: string): Promise<void> {
    this.at = url;
    this.navigated += 1;
    return Promise.resolve();
  }
  describe(selector: string): Promise<ElementDescriptor | null> {
    return Promise.resolve(selector === "#password" ? PASSWORD : SEARCH);
  }
  describeAt(x: number): Promise<ElementDescriptor | null> {
    return Promise.resolve(x < 200 ? PASSWORD : SEARCH);
  }
  describeFocused(): Promise<ElementDescriptor | null> {
    return Promise.resolve(this.focused);
  }
  snapshotFields(): Promise<readonly FieldSnapshot[]> {
    return Promise.resolve(this.fields);
  }
  exists(): Promise<boolean> {
    return Promise.resolve(false);
  }
  readText(): Promise<string | null> {
    return Promise.resolve(null);
  }
  readValue(): Promise<string | null> {
    return Promise.resolve("");
  }
  scrapeCart(): Promise<CartDom> {
    return Promise.resolve({ rows: [], totalCandidates: [], url: this.at });
  }
  stopLoading(): Promise<void> {
    return Promise.resolve();
  }

  readPage(): Promise<PageDom> {
    return Promise.resolve({ ...EMPTY_PAGE, url: this.at });
  }
  typeInto(): Promise<void> {
    return Promise.resolve();
  }
  clickOn(): Promise<void> {
    return Promise.resolve();
  }
  screenshot(): Promise<Uint8Array> {
    this.underTheShutter();
    return Promise.resolve(
      encodePng({
        width: 320,
        height: 200,
        pixels: new Uint8Array(320 * 200 * 4).fill(200),
      }),
    );
  }
  bringToFront(): Promise<void> {
    this.relayed.push("front");
    return Promise.resolve();
  }
  clickAt(x: number, y: number): Promise<void> {
    this.relayed.push(`click ${x},${y}`);
    return Promise.resolve();
  }
  typeText(text: string): Promise<void> {
    this.relayed.push(`type ${text}`);
    return Promise.resolve();
  }
  pressKey(name: string): Promise<void> {
    this.relayed.push(`key ${name}`);
    return Promise.resolve();
  }
  scrollBy(dy: number): Promise<void> {
    this.relayed.push(`scroll ${dy}`);
    return Promise.resolve();
  }
}
