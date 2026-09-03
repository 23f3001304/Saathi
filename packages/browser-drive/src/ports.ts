import type { CartDom } from "./cart/cart-dom.js";
import type { ElementDescriptor } from "./field/element-descriptor.js";
import type { PageDom } from "./read/page-dom.js";
import type { SessionSurface } from "./surface.js";

/** Viewport-relative CSS pixels — the frame a screenshot is actually taken in. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One element, described and located in a single DOM pass. */
export interface FieldSnapshot {
  readonly descriptor: ElementDescriptor;
  readonly rect: Rect;
}

/** One frame as the browser encoded it, before anything here has looked. */
export interface CastFrame {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/jpeg" | "image/png";
  /** Chrome's frame number. Acknowledging it is what unblocks the next one. */
  readonly ack: number;
  /** `ObservablePage.navigations()` as it stood when these pixels were taken.
   *  Below the count that is current now, they are of a page we have left. */
  readonly navigation: number;
  /** The viewport these pixels are of, so a relayed click still maps back. */
  readonly width: number;
  readonly height: number;
}

export interface CastSettings {
  readonly format: "jpeg" | "png";
  readonly quality: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
  /** Chrome's own rate cap: frames not produced cost nothing to drop. */
  readonly everyNthFrame: number;
}

/**
 * The push half of watching: frames when the page changes, rather than a
 * shutter asked twice a second whether it has.
 *
 * DECISION: a capability a surface may not have, rather than a method on
 * `ObservablePage` that some implementation has to fake. Falling back to the
 * polled shutter is a first-class path — a container whose Chrome will not
 * screencast must still be watchable — so "there is no caster here" is an
 * ordinary answer with an ordinary consequence, not an error.
 */
export interface Caster {
  start(
    settings: CastSettings,
    onFrame: (frame: CastFrame) => void,
  ): Promise<void>;
  /**
   * Releases the frame Chrome is holding. Called only once this process has
   * finished with the frame, which is the whole backpressure policy: Chrome
   * stops producing while we are behind, rather than us queueing what it sent.
   */
  ack(frame: number): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Looking at the window, and nothing else. Separated from the driving surface
 * because watching is not acting: no state gate applies to any method here, so
 * the type says so rather than a comment.
 */
export interface ObservablePage {
  /** The push half, where this surface has one. `null` means poll instead. */
  caster(): Caster | null;
  /**
   * How many documents this window's main frame has committed. Monotonic, and
   * the only thing that can tell a picture of *this* page from a picture of
   * the one before it: the URL has already changed by the time the old page's
   * last frames arrive, and the two clocks involved are too close to separate.
   */
  navigations(): number;
  /** PNG bytes of the current viewport, unredacted. `FrameCapture` redacts. */
  screenshot(): Promise<Uint8Array>;
  /** Every candidate field with its on-screen box, for frame redaction. */
  snapshotFields(): Promise<readonly FieldSnapshot[]>;
  /**
   * What holds focus. Reading it is looking, not acting, which is why it sits
   * here as well as on `InputPage`: `FrameCapture` consults it before every
   * shutter so a protected field can stop the capture happening at all.
   */
  describeFocused(): Promise<ElementDescriptor | null>;
  /** Raises the real Chrome window so the user can type into it directly. */
  bringToFront(): Promise<void>;
}

/**
 * Raw pointer and keyboard input at viewport coordinates: the only reach the
 * relayed-from-the-browser path has. It carries no selector and no text
 * targeting, so a caller cannot aim at an element it has not first described.
 */
export interface InputPage {
  url(): string;
  /** The element under a viewport point — the target of a relayed click. */
  describeAt(x: number, y: number): Promise<ElementDescriptor | null>;
  /** The element a relayed keystroke would reach. */
  describeFocused(): Promise<ElementDescriptor | null>;
  clickAt(x: number, y: number): Promise<void>;
  typeText(text: string): Promise<void>;
  pressKey(name: string): Promise<void>;
  scrollBy(dy: number): Promise<void>;
}

/**
 * The narrow page surface this package drives. Puppeteer lives behind it, so
 * every guard and every test runs against the same interface — a fake page in
 * unit tests, real Chrome in the fixture suite, and no `if (test)` anywhere.
 */
export interface DrivenPage extends ObservablePage, InputPage {
  url(): string;
  goto(url: string): Promise<void>;
  describe(selector: string): Promise<ElementDescriptor | null>;
  exists(selector: string): Promise<boolean>;
  readText(selector: string): Promise<string | null>;
  /** The live input value — how the agent verifies what it did and did not type. */
  readValue(selector: string): Promise<string | null>;
  scrapeCart(): Promise<CartDom>;
  /** Text, links and controls, in one pass. Untrusted by construction. */
  readPage(): Promise<PageDom>;
  /** Cancels whatever the page is still loading. A read that timed out is
   *  usually a load that will never finish, and the next read fights the
   *  same stuck load unless somebody stops it. Bounded and best-effort. */
  stopLoading(): Promise<void>;
  typeInto(selector: string, text: string): Promise<void>;
  clickOn(selector: string): Promise<void>;
}

export interface LaunchedBrowser {
  page(): DrivenPage;
  readonly surface: SessionSurface;
  /** The container this window lives in, or `"in-process"` when it is native. */
  readonly sandboxId: string;
  close(): Promise<void>;
}

export interface LaunchRequest {
  /** Fresh per session, never the user's Chrome profile. */
  readonly userDataDir: string;
  /** Inside the sandbox, so anything that lands there dies with the session. */
  readonly downloadDir: string;
  /**
   * Which kind of window to open. Not a headless flag: the invariant is that
   * the user can always watch, and both surfaces honour it — one with a window
   * on their desktop, the other with a redacted frame stream out of a
   * container. A launcher that could open a window nobody sees is the failure
   * this package exists to prevent, and neither value expresses one.
   */
  readonly surface: SessionSurface;
  readonly windowWidth: number;
  readonly windowHeight: number;
}

export interface BrowserLauncher {
  launch(request: LaunchRequest): Promise<LaunchedBrowser>;
}

export interface Sandbox {
  readonly path: string;
  readonly downloadDir: string;
  dispose(): void;
}

/** Makes the throwaway profile directory; the OS temp dir is its only home. */
export interface SandboxFactory {
  create(sessionId: string): Sandbox;
}

/** Injected so `waitForUserCompletion` polls instantly under test. */
export interface Waiter {
  sleep(ms: number): Promise<void>;
}
