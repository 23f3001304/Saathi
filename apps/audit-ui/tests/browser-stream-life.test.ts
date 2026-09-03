// @vitest-environment node
//
// Does the card kill a stream that is working?
//
// The founder's log showed `browser.frames.served seconds: 1, fast: 1, slow: 1`
// over and over beside "the subscriber went away" — a subscription opening and
// being torn down about once a second, all errand long. agent-host emits that
// line from one place (`frame-feed.ts`, the feed's own `stop()`), and the only
// thing that calls it is the subscriber going away, so the answer is on this
// side of the wire. One candidate was this file's own subject: `browserFrames`
// closes the socket itself inside `onerror`, and an `EventSource` raises
// `onerror` for reasons that have nothing to do with the stream being broken.
//
// DECISION: a fake `EventSource`, which vitest.config.ts deliberately does not
// polyfill. The reasoning there — "rather than by shipping a polyfill and then
// testing the polyfill" — is about proving the *wire*, which live-sse-wire.ts
// still does. Nothing here is asserted about SSE framing. What is asserted is
// what this app does to a socket that is behaving, and for that the socket has
// to be a double the test controls: a real one could not be made to behave on
// demand, which is the whole question.
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { attach } from "../src/browser/browserFallback.ts";
import { liveBrowser } from "../src/browser/liveBrowser.ts";
import type {
  BrowserFrame,
  BrowserTransport,
} from "../src/browser/browserTransport.ts";

const IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const SESSION = {
  id: "web_primary",
  sandbox: { surface: "container", id: "cnt_1" },
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=ssd",
  title: "amazon.in/s",
  state: "agent-drive",
  handoff: null,
  actions: [],
  conversation: null,
};

/** A socket that only ever does what it is told, so "did we close it?" has an
 *  answer that is about this app and not about a network. */
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

  deliver(seq: number): void {
    this.onmessage?.({
      data: JSON.stringify({
        seq,
        url: SESSION.url,
        state: SESSION.state,
        width: 1024,
        height: 720,
        redacted: 0,
        passthrough: true,
        image: IMAGE,
      }),
    });
  }
}

interface Host {
  server: Server;
  /** Every `/browser/frame` this host answered: the shutter fallback, which a
   *  healthy stream must not need. */
  polls: number;
}

function answer(host: Host, req: IncomingMessage, res: ServerResponse): void {
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
  if (url.startsWith("/browser/frame")) {
    host.polls += 1;
    res.end(JSON.stringify({ ok: true, frame: { image: IMAGE } }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false }));
}

/**
 * One object, handed back rather than copied. `polls` is a number: a spread
 * would give the handler one counter to raise and the test another to read,
 * and the assertion about the shutter would be a sentence that cannot be
 * false — the worst kind of test, because it reads like evidence.
 */
function start(port: number): Promise<Host> {
  const host: Host = { server: null as never, polls: 0 };
  host.server = createServer((req, res) => answer(host, req, res));
  return new Promise((done) => host.server.listen(port, () => done(host)));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

let live: Host | null = null;
let stop: (() => void) | null = null;

afterEach(async () => {
  stop?.();
  stop = null;
  FakeSource.opened.length = 0;
  Reflect.deleteProperty(globalThis, "EventSource");
  if (live !== null) {
    live.server.closeAllConnections?.();
    await new Promise((done) => live?.server.close(() => done(null)));
  }
  live = null;
});

describe("a stream that is delivering", () => {
  it("is not torn down and re-opened while it works", async () => {
    Reflect.set(globalThis, "EventSource", FakeSource);
    live = await start(45907);
    const frames: (BrowserFrame | null)[] = [];
    const slot = { current: null as BrowserTransport | null };
    stop = attach(slot, () => liveBrowser(`http://127.0.0.1:${45907}`), {
      setView: () => undefined,
      setFrame: (frame) => frames.push(frame),
      setBlackout: () => undefined,
      setStatus: () => undefined,
    });

    // Long enough for four of the card's 900ms state reads, which is the only
    // thing on this side that runs anywhere near once a second.
    for (let tick = 0; tick < 20; tick += 1) {
      await sleep(200);
      FakeSource.opened.at(-1)?.deliver(tick);
    }

    expect(frames.filter((frame) => frame !== null).length).toBeGreaterThan(10);
    expect(FakeSource.opened.length).toBe(1);
    expect(FakeSource.opened[0]?.closed).toBe(0);
    // The shutter is the fallback for a stream that has gone quiet. This one
    // has not, so it must not have been asked for a single frame.
    expect(live.polls).toBe(0);
  }, 30_000);
});
