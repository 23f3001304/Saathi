import {
  BrowserSession,
  CartCovenant,
  CartInspector,
  DEFAULT_HANDOFF_CONFIG,
  FieldClassifier,
  Journal,
  NavigationPolicy,
  TimerWaiter,
} from "@covenant/browser-drive";
import type {
  BrowserLauncher,
  DrivenPage,
  JournalSink,
  LaunchedBrowser,
  Sandbox,
  SandboxFactory,
  SessionSurface,
} from "@covenant/browser-drive";
import type { Clock } from "@covenant/domain";

// The session a fake page is wired into: a launcher that hands the page back,
// a profile directory that is a string, and a journal nobody reads. Split from
// `fake-sandbox.ts` so that file is the page and this one is the wiring.
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
