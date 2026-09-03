// What one teardown costs, and what it takes to cause one.
//
// `browser-stream-life.test.ts` shows the transport does not close a stream
// that is delivering. The other way agent-host can log "the subscriber went
// away" is React: `useBrowserSession` holds the watch in an effect
// (useBrowserSession.ts), and the effect's cleanup is the whole teardown —
// `attach`'s returned function (browserFallback.ts) through `startWatch`'s
// (liveBrowser.ts) to `stop(wire)` (browserPoll.ts), which closes the socket.
//
// So a re-render that changes what the effect depends on, or an unmount of the
// pane that holds it, is one full subscription cycle: one line in the host's
// log, one screencast started and stopped, and a card that has to paint itself
// again from nothing. This measures that, and pins that a re-render which
// changes nothing costs none of it.
import { render } from "@testing-library/react";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { useEffect, type JSX } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBrowserSession } from "../src/browser/useBrowserSession.ts";

const SESSION = {
  id: "web_primary",
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=ssd",
  title: "amazon.in/s",
  state: "agent-drive",
  handoff: null,
  actions: [],
  conversation: null,
};

/** A socket that records its own life, so a teardown is countable. */
class FakeSource {
  static readonly opened: FakeSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = 0;

  constructor(readonly url: string) {
    FakeSource.opened.push(this);
  }

  close(): void {
    this.closed += 1;
  }
}

function answer(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "";
  res.setHeader("content-type", "application/json");
  if (url.startsWith("/browser/handshake")) {
    res.end(JSON.stringify({ ok: true, key: "k" }));
    return;
  }
  if (url.startsWith("/browser/state")) {
    res.end(JSON.stringify({ ok: true, session: SESSION }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false }));
}

function start(port: number): Promise<Server> {
  const server = createServer(answer);
  return new Promise((done) => server.listen(port, () => done(server)));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

/** Renders the watch and reports how many times the effect has run, so a
 *  re-render that quietly re-subscribes cannot hide. */
function Card({
  lane,
  runs,
}: {
  lane: string | null;
  runs: { count: number };
}): JSX.Element {
  useBrowserSession(true, lane);
  useEffect(() => {
    runs.count += 1;
  });
  return <div>watching</div>;
}

let host: Server | null = null;

afterEach(async () => {
  FakeSource.opened.length = 0;
  Reflect.deleteProperty(globalThis, "EventSource");
  vi.unstubAllEnvs();
  if (host !== null) {
    host.closeAllConnections?.();
    await new Promise((done) => host?.close(() => done(null)));
  }
  host = null;
});

describe("the watch and the render that holds it", () => {
  it("survives a re-render and dies with a change of lane", async () => {
    Reflect.set(globalThis, "EventSource", FakeSource);
    // `agentBaseUrl()` reads this on every call, so the card talks to the
    // server this test started and never to a host on the machine.
    vi.stubEnv("VITE_AGENT_URL", "http://127.0.0.1:45908");
    host = await start(45908);
    const runs = { count: 0 };

    const view = render(<Card lane="chat_one" runs={runs} />);
    await sleep(400);
    expect(FakeSource.opened.length).toBe(1);

    // Ten renders with the same lane: the state poll pushes a new view into
    // the card several times a second, and none of it may cost a subscription.
    for (let again = 0; again < 10; again += 1) {
      view.rerender(<Card lane="chat_one" runs={runs} />);
    }
    await sleep(200);
    expect(runs.count).toBeGreaterThan(10);
    expect(FakeSource.opened.length).toBe(1);
    expect(FakeSource.opened[0]?.closed).toBe(0);

    // One changed lane, and the whole subscription goes: this is the teardown
    // agent-host logs as "the subscriber went away", and every derived lane id
    // that is not stable across a poll spends one.
    view.rerender(<Card lane="chat_two" runs={runs} />);
    await sleep(400);
    expect(FakeSource.opened[0]?.closed).toBe(1);
    expect(FakeSource.opened.length).toBe(2);

    view.unmount();
    await sleep(100);
    expect(FakeSource.opened[1]?.closed).toBe(1);
  }, 30_000);
});
