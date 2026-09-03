import type { Browser, Page } from "puppeteer";

type CdpHandler = (event: unknown) => void;

/** What Chrome puts on the wire, minus the pixels: the caster forwards the
 *  bytes without looking at them, so an empty payload proves as much. */
function screencastEvent(ack: number): unknown {
  return {
    data: "",
    sessionId: ack,
    metadata: { deviceWidth: 8, deviceHeight: 6, timestamp: 0 },
  };
}

/**
 * One CDP session: the pipe the cast's pixels come down and the pipe the
 * navigation counter listens on. Both are real sessions in the real thing, and
 * keeping them separate here is the point — the counter must go on counting
 * while the cast is being torn down and rebuilt.
 */
export class FakeCdpSession {
  readonly sent: string[] = [];
  detached = false;
  private frames: CdpHandler | null = null;
  private committed: CdpHandler | null = null;

  constructor(private readonly name: string) {}

  id(): string {
    return this.name;
  }

  on(event: string, handler: CdpHandler): this {
    if (event === "Page.screencastFrame") this.frames = handler;
    if (event === "Page.frameNavigated") this.committed = handler;
    return this;
  }

  send(method: string): Promise<void> {
    this.sent.push(method);
    return Promise.resolve();
  }

  detach(): Promise<void> {
    this.detached = true;
    return Promise.resolve();
  }

  /** Whether this is one of the cast's sessions rather than the counter's. */
  get casting(): boolean {
    return this.frames !== null;
  }

  pushFrame(ack: number): void {
    this.frames?.(screencastEvent(ack));
  }

  /** A document committed. A detached session hears nothing, exactly as a
   *  real one does not. */
  pushCommit(loaderId: string, parentId?: string): void {
    if (this.detached) return;
    this.committed?.({ frame: { loaderId, parentId } });
  }
}

/**
 * A puppeteer `Page` reduced to what the cast path touches: it commits
 * documents on command, hands out CDP sessions the test can push frames on,
 * and can be retired in favour of a peer the way Chrome retires one under a
 * long session. Everything else about a real page is absent on purpose.
 */
export class FakeCastPage {
  readonly sessions: FakeCdpSession[] = [];
  readonly peers: FakeCastPage[] = [];
  closed = false;
  /** Thrown by the next `evaluate`, to force `live()` down the swap path. */
  failNext: Error | null = null;
  private readonly navigated: ((frame: unknown) => void)[] = [];
  private readonly main = { name: "main-frame" };
  private loaders = 0;

  constructor(private readonly name = "page") {}

  mainFrame(): unknown {
    return this.main;
  }

  url(): string {
    return `file:///shop/${this.name}.html`;
  }

  isClosed(): boolean {
    return this.closed;
  }

  browser(): Browser {
    return {
      pages: () => Promise.resolve([this, ...this.peers]),
      newPage: () => Promise.resolve(new FakeCastPage("born")),
    } as unknown as Browser;
  }

  bringToFront(): Promise<void> {
    return Promise.resolve();
  }

  goto(): Promise<null> {
    return Promise.resolve(null);
  }

  evaluate(): Promise<unknown> {
    const failure = this.failNext;
    this.failNext = null;
    return failure === null ? Promise.resolve([]) : Promise.reject(failure);
  }

  on(event: string, handler: (frame: unknown) => void): this {
    if (event === "framenavigated") this.navigated.push(handler);
    return this;
  }

  off(event: string, handler: (frame: unknown) => void): this {
    const at = this.navigated.indexOf(handler);
    if (event === "framenavigated" && at >= 0) this.navigated.splice(at, 1);
    return this;
  }

  createCDPSession(): Promise<FakeCdpSession> {
    const session = new FakeCdpSession(
      `${this.name}-cdp-${this.sessions.length}`,
    );
    this.sessions.push(session);
    return Promise.resolve(session);
  }

  /** The cast's sessions, in the order the caster opened them. */
  casts(): FakeCdpSession[] {
    return this.sessions.filter((session) => session.casting);
  }

  /** A new document commits: both the wire event and the page-level one. */
  navigate(): void {
    this.loaders += 1;
    for (const session of this.sessions) {
      session.pushCommit(`loader-${this.loaders}`);
    }
    this.tellPage(this.main);
  }

  /**
   * `history.pushState`. Chrome reports it on `Page.navigatedWithinDocument`
   * and never on `Page.frameNavigated`, while puppeteer's page-level
   * `framenavigated` fires for it exactly as it does for a real commit — which
   * is the whole reason the counter listens on the wire instead.
   */
  navigateWithinDocument(): void {
    this.tellPage(this.main);
  }

  /** An iframe commits a document, which is not this window going anywhere. */
  navigateSubFrame(): void {
    this.loaders += 1;
    for (const session of this.sessions) {
      session.pushCommit(`loader-${this.loaders}`, "the-main-frame");
    }
    this.tellPage({ name: "an-ad" });
  }

  private tellPage(frame: unknown): void {
    for (const handler of [...this.navigated]) handler(frame);
  }

  /** The same object, typed as puppeteer sees it. */
  get page(): Page {
    return this as unknown as Page;
  }
}

/** Long enough for the coalesced restart to fire and finish. */
export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300));
}
