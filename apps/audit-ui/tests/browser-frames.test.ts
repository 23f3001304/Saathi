// @vitest-environment node
//
// The user's complaint was "a user cannot see browser": the card showed a URL
// bar, a driver chip and an action list updating in real time, and never one
// pixel. Everything about that card is fed by `/browser/state`; the picture is
// the one thing that is not, so the card can look completely alive while the
// frame path is dead end to end.
//
// Nothing here is mocked below the transport. A real HTTP server stands in for
// agent-host and is killed and restarted under a running card, because the two
// ways this failed were both lifecycle: a tab that outlived a host restart, and
// a reel standing down while the first frame was in flight.
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

/** A 1x1 PNG. The bytes do not matter; that they arrive does. */
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
};

interface Host {
  readonly server: Server;
  /** Every key this host has minted, newest last. A restart mints a new one. */
  readonly keys: string[];
  frames: number;
}

/** One request, in the shape agent-host answers them. */
function answer(host: Host, req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? "";
  res.setHeader("content-type", "application/json");
  if (url.startsWith("/browser/handshake")) {
    res.end(JSON.stringify({ ok: true, key: host.keys.at(-1) }));
    return;
  }
  // The stale-key case, exactly as agent-host behaves: a key from before the
  // restart is refused, and only a fresh handshake gets a working one.
  if (req.headers["x-covenant-browser-key"] !== host.keys.at(-1)) {
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, reason_code: "BROWSER_KEY_REQUIRED" }));
    return;
  }
  if (url.startsWith("/browser/state")) {
    res.end(JSON.stringify({ ok: true, session: SESSION }));
    return;
  }
  if (url.startsWith("/browser/frame")) {
    host.frames += 1;
    res.end(
      JSON.stringify({
        ok: true,
        frame: {
          image: IMAGE,
          width: 1024,
          height: 720,
          redacted: 0,
          passthrough: false,
        },
      }),
    );
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ ok: false }));
}

function start(port: number, key: string): Promise<Host> {
  const host: Host = { server: null as never, keys: [key], frames: 0 };
  const server = createServer((req, res) => answer(host, req, res));
  return new Promise((done) =>
    server.listen(port, () =>
      done({ ...host, server, keys: host.keys, frames: host.frames }),
    ),
  );
}

function close(host: Host): Promise<void> {
  return new Promise((done) => {
    host.server.closeAllConnections?.();
    host.server.close(() => done());
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

interface Rig {
  readonly frames: (BrowserFrame | null)[];
  readonly stop: () => void;
}

function watch(port: number): Rig {
  const frames: (BrowserFrame | null)[] = [];
  const slot = { current: null as BrowserTransport | null };
  const stop = attach(slot, () => liveBrowser(`http://127.0.0.1:${port}`), {
    setView: () => undefined,
    setFrame: (frame) => frames.push(frame),
    setBlackout: () => undefined,
    setStatus: () => undefined,
  });
  return { frames, stop };
}

/** A frame that actually landed, as the card would read it. */
function painted(rig: Rig): BrowserFrame | undefined {
  return rig.frames.filter((frame) => frame !== null).at(-1) ?? undefined;
}

let live: Host | null = null;
let rig: Rig | null = null;

afterEach(async () => {
  rig?.stop();
  rig = null;
  if (live !== null) await close(live);
  live = null;
});

describe("a frame the transport read", () => {
  it("reaches the card on a clean attach", async () => {
    const port = 45901;
    live = await start(port, "key-one");
    rig = watch(port);

    await sleep(1500);
    expect(painted(rig)).toMatchObject({ image: IMAGE, width: 1024 });
  }, 30_000);

  /**
   * The reported failure. agent-host mints a key per boot, so a tab open across
   * a restart holds a dead one — and the card's own comment records that this
   * left it "watching a placeholder while the host was capturing frames
   * perfectly well". Reloading fixed it, which is not a fix: nobody watching a
   * demo knows to reload, and the banner promises otherwise.
   */
  it("comes back after the host restarts under an open tab", async () => {
    const port = 45902;
    live = await start(port, "key-one");
    rig = watch(port);
    await sleep(1200);
    expect(painted(rig)).toBeDefined();

    await close(live);
    await sleep(4500);
    // A new boot, a new key: the one this tab is holding is now refused.
    live = await start(port, "key-two");
    const before = rig.frames.length;

    await sleep(12_000);
    expect(rig.frames.length).toBeGreaterThan(before);
    expect(painted(rig)).toMatchObject({ image: IMAGE });
  }, 60_000);
});
