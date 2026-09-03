import type { Page } from "puppeteer";

import type { CastFrame, CastSettings, Caster } from "../src/ports.js";

/** A caster the test drives by hand: `push` delivers exactly one frame. */
export class FakeCaster implements Caster {
  started: CastSettings | null = null;
  stopped = 0;
  readonly acked: number[] = [];
  private sink: ((frame: CastFrame) => void) | null = null;

  start(
    settings: CastSettings,
    onFrame: (frame: CastFrame) => void,
  ): Promise<void> {
    this.started = settings;
    this.sink = onFrame;
    return Promise.resolve();
  }

  ack(frame: number): Promise<void> {
    this.acked.push(frame);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopped += 1;
    this.sink = null;
    return Promise.resolve();
  }

  push(frame: CastFrame): void {
    this.sink?.(frame);
  }

  get casting(): boolean {
    return this.sink !== null;
  }
}

/** What Chrome puts on the wire, minus the pixels: the caster forwards the
 *  bytes without looking at them, so an empty payload proves as much. */
function screencastEvent(ack: number): unknown {
  return {
    data: "",
    sessionId: ack,
    metadata: { deviceWidth: 8, deviceHeight: 6, timestamp: 0 },
  };
}

/** One CDP session, which the caster may attach to, send on, and detach. */
class FakeCdpSession {
  readonly sent: string[] = [];
  detached = false;
  private frames: ((event: unknown) => void) | null = null;

  constructor(private readonly name: string) {}

  id(): string {
    return this.name;
  }

  on(event: string, handler: (event: unknown) => void): this {
    if (event === "Page.screencastFrame") this.frames = handler;
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

  push(ack: number): void {
    this.frames?.(screencastEvent(ack));
  }
}

/**
 * A puppeteer `Page` reduced to what the cast path touches: it navigates its
 * main frame on command, and it hands out CDP sessions the test can push
 * frames on and watch being detached. Everything else about a real page is
 * absent on purpose — this double exists to answer "which session did that
 * frame come from, and had the page moved on by then?".
 */
class FakeCastPage {
  readonly sessions: FakeCdpSession[] = [];
  private readonly navigated: ((frame: unknown) => void)[] = [];
  private readonly main = { name: "main-frame" };

  mainFrame(): unknown {
    return this.main;
  }

  url(): string {
    return "file:///shop/index.html";
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
    const session = new FakeCdpSession(`cdp-${this.sessions.length}`);
    this.sessions.push(session);
    return Promise.resolve(session);
  }

  navigate(frame: unknown = this.main): void {
    for (const handler of [...this.navigated]) handler(frame);
  }
}

/** The page under a cast, with the two verbs a navigation test needs. */
export interface FakeCastRig {
  /** The same object, typed as puppeteer sees it. */
  readonly page: Page;
  readonly sessions: readonly FakeCdpSession[];
  /** The main frame commits another document. */
  navigate(): void;
  /** An iframe commits one, which is not a navigation of the window. */
  navigateSubFrame(): void;
  /** A frame arrives on the nth session the caster has opened. */
  emitFrame(session: number, ack?: number): void;
  /** Long enough for the coalesced restart to fire and finish. */
  settle(): Promise<void>;
}

export function fakePage(): FakeCastRig {
  const fake = new FakeCastPage();
  return {
    page: fake as unknown as Page,
    sessions: fake.sessions,
    navigate: () => fake.navigate(),
    navigateSubFrame: () => fake.navigate({ name: "an-ad" }),
    emitFrame: (session, ack = 1) => fake.sessions[session]?.push(ack),
    settle: () => new Promise((resolve) => setTimeout(resolve, 300)),
  };
}
