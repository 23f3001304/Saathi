// Everything the web-tool harness stands in for: a launcher with no browser
// behind it, a sandbox that is a path and nothing else, and two sinks that
// record instead of persisting. The guards themselves are never faked.
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
  JournalEvent,
  JournalSink,
  LaunchedBrowser,
  Sandbox,
  SandboxFactory,
} from "@covenant/browser-drive";
import type {
  Clock,
  EventDraft,
  Span,
  StoredEvent,
  Tracer,
} from "@covenant/domain";

import type { FakeShopPage } from "./fake-shop.js";

/**
 * One session on the fake shop, wired exactly as the composition root wires a
 * real one: the real classifier, the real navigation policy, the real journal.
 * Only Chrome and its sandbox directory are stood in for, so every refusal a
 * test asserts is a refusal the shipped guards produced.
 */
export function webSessionOf(
  page: FakeShopPage,
  clock: Clock,
  sink: JournalSink,
  sessionId: string,
): BrowserSession {
  return new BrowserSession({
    launcher: new FakeLauncher(page),
    sandboxes: new FakeSandboxes(),
    classifier: new FieldClassifier(),
    policy: new NavigationPolicy({
      fileRoots: [],
      allowHosts: [],
      denyHosts: [],
    }),
    inspector: new CartInspector(),
    // Deliberately unusable: `web_cart` must hold the ceiling the run bound,
    // never the number the session happened to be built with.
    covenant: new CartCovenant({ capPaise: 1, currency: "INR" }),
    journal: new Journal(sink, clock, sessionId),
    waiter: new TimerWaiter(),
    clock,
    config: {
      sessionId,
      surface: "native-window",
      windowWidth: 320,
      windowHeight: 200,
      handoff: DEFAULT_HANDOFF_CONFIG,
    },
  });
}

export class FakeLauncher implements BrowserLauncher {
  constructor(private readonly page: FakeShopPage) {}
  launch(): Promise<LaunchedBrowser> {
    return Promise.resolve({
      page: () => this.page,
      surface: "native-window",
      sandboxId: "in-process",
      close: () => Promise.resolve(),
    });
  }
}

export class FakeSandboxes implements SandboxFactory {
  create(): Sandbox {
    return {
      path: "/tmp/web",
      downloadDir: "/tmp/web/dl",
      dispose: () => undefined,
    };
  }
}

export class CollectingSink implements JournalSink {
  readonly events: JournalEvent[] = [];
  write(line: string): void {
    this.events.push(JSON.parse(line) as JournalEvent);
  }
}

export class CountingSink {
  readonly kinds: string[] = [];
  append(draft: EventDraft): StoredEvent {
    this.kinds.push(draft.kind);
    const seq = this.kinds.length;
    return {
      ...draft,
      id: `evt_${seq}`,
      ts: new Date(seq).toISOString(),
      seq,
      ts_ms: seq,
      prev_hash: "0".repeat(64),
      this_hash: "0".repeat(64),
    };
  }
}

export class SilentTracer implements Tracer {
  startSpan(): Span {
    const noop = (): undefined => undefined;
    return {
      setAttribute: noop,
      setStatus: noop,
      recordException: noop,
      end: noop,
    };
  }
}
