import {
  BrowserSession,
  CartCovenant,
  CartInspector,
  DEFAULT_HANDOFF_CONFIG,
  EMPTY_PAGE,
  encodePng,
  FieldClassifier,
  Journal,
  NavigationPolicy,
  TimerWaiter,
} from "@covenant/browser-drive";
import type {
  BrowserLauncher,
  CartDom,
  DrivenPage,
  ElementDescriptor,
  FieldSnapshot,
  JournalSink,
  LaunchedBrowser,
  PageDom,
  Sandbox,
  SandboxFactory,
  SessionSurface,
} from "@covenant/browser-drive";
import type { Caster } from "@covenant/browser-drive";
import type { Clock } from "@covenant/domain";

import { FakeCaster } from "./fake-caster.js";

import {
  LOGIN,
  PASSWORD,
  PASSWORD_BOX,
  SEARCH,
} from "./fake-sandbox-fields.js";

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
  private at = LOGIN;

  caster(): Caster | null {
    return this.castable;
  }

  url(): string {
    return this.at;
  }
  goto(url: string): Promise<void> {
    this.at = url;
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

class FakeLauncher implements BrowserLauncher {
  constructor(
    private readonly page: DrivenPage,
    private readonly surface: SessionSurface,
  ) {}
  launch(): Promise<LaunchedBrowser> {
    return Promise.resolve({
      page: () => this.page,
      surface: this.surface,
      sandboxId:
        this.surface === "container" ? "covenant-browse-fake" : "in-process",
      close: () => Promise.resolve(),
    });
  }
}

const SANDBOX: Sandbox = {
  path: "/tmp/fake",
  downloadDir: "/tmp/fake/downloads",
  dispose: () => undefined,
};

class FakeSandboxes implements SandboxFactory {
  create(): Sandbox {
    return SANDBOX;
  }
}

class SilentSink implements JournalSink {
  write(): void {
    return;
  }
}

export function fakeSession(
  page: DrivenPage,
  clock: Clock,
  surface: SessionSurface = "native-window",
): BrowserSession {
  return new BrowserSession({
    launcher: new FakeLauncher(page, surface),
    sandboxes: new FakeSandboxes(),
    classifier: new FieldClassifier(),
    policy: new NavigationPolicy({
      fileRoots: [],
      allowHosts: [],
      denyHosts: [],
    }),
    inspector: new CartInspector(),
    covenant: new CartCovenant({ capPaise: 200_000, currency: "INR" }),
    journal: new Journal(new SilentSink(), clock, "sess_fake"),
    waiter: new TimerWaiter(),
    clock,
    config: {
      sessionId: "fake",
      surface,
      windowWidth: 320,
      windowHeight: 200,
      handoff: DEFAULT_HANDOFF_CONFIG,
    },
  });
}
