// Everything the web-tool harness stands in for: a launcher with no browser
// behind it, a sandbox that is a path and nothing else, and two sinks that
// record instead of persisting. The guards themselves are never faked.
import type {
  BrowserLauncher,
  JournalEvent,
  JournalSink,
  LaunchedBrowser,
  Sandbox,
  SandboxFactory,
} from "@covenant/browser-drive";
import type { EventDraft, Span, StoredEvent, Tracer } from "@covenant/domain";

import type { FakeShopPage } from "./fake-shop.js";

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
