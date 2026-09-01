// @vitest-environment node
//
// The ladder's policy, with both push rungs faked so the backoffs can be wound
// by hand. What is pinned here is the thing the old transport could not do:
// having fallen, it climbs back — and the cursor it carries up and down means
// no beat is shown twice or skipped on the way.
import { afterEach, describe, expect, it, vi } from "vitest";

import { attach, newSession } from "../src/conversation/agentStream.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";

const BASE = "http://host.invalid";

const BEATS = [
  { offsetMs: 0, kind: "message", text: "one" },
  { offsetMs: 1, kind: "message", text: "two" },
  { offsetMs: 2, kind: "message", text: "three" },
];

class FakeSocket {
  static opened: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  send(): void {}
  close(): void {}
  accept(): void {
    this.onopen?.();
  }
  drop(): void {
    this.onerror?.();
  }
  deliver(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent<string>);
  }
  beat(epoch: number, index: number, text: string): void {
    this.deliver({
      type: "beat",
      epoch,
      index,
      beat: { offsetMs: 0, kind: "message", text },
    });
  }
  static last(): FakeSocket {
    const socket = FakeSocket.opened.at(-1);
    if (socket === undefined) throw new Error("no socket was opened");
    return socket;
  }
}

function said(signals: readonly AssistantSignal[]): string[] {
  return signals.flatMap((s) => (s.kind === "say" ? [s.text] : []));
}

/** Long enough for a `/chat/state` round trip against the stubbed fetch. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 2));
}

function statuses(signals: readonly AssistantSignal[]): string[] {
  return signals.flatMap((s) => (s.kind === "status" ? [s.status] : []));
}

function notice(signals: readonly AssistantSignal[]): string | null {
  const last = [...signals].reverse().find((s) => s.kind === "status");
  return last?.kind === "status" ? last.detail : null;
}

/** Which run the host says its indices belong to. Mutable, because a rebase
 *  frame and the state route have to agree about it. */
let hubEpoch = 1;

/** `/chat/state` is the only route the polling rung needs. */
function stubHost(running: boolean): void {
  hubEpoch = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            beats: BEATS,
            awaiting: [],
            running,
            epoch: hubEpoch,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

async function attached(running = true): Promise<AssistantSignal[]> {
  FakeSocket.opened = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  stubHost(running);
  const seen: AssistantSignal[] = [];
  await attach(newSession((signal) => seen.push(signal), BASE));
  return seen;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the beat ladder", () => {
  it("claims live only once the socket has actually opened", async () => {
    const seen = await attached();
    expect(statuses(seen)).toEqual([]);
    FakeSocket.last().accept();
    expect(statuses(seen)).toEqual(["live"]);
    expect(notice(seen)).toBe("websocket");
  });

  it("falls straight past a socket that has never worked", async () => {
    vi.useFakeTimers();
    const seen = await attached();
    FakeSocket.last().drop();
    await vi.advanceTimersByTimeAsync(50);
    // No `connecting`, no backoff: first paint waits for no dead transport.
    expect(statuses(seen)).toEqual(["degraded"]);
    expect(said(seen)).toEqual(["one", "two", "three"]);
  });

  it("reconnects a socket that had worked, resuming at the high-water mark", async () => {
    vi.useFakeTimers();
    const seen = await attached();
    const first = FakeSocket.last();
    first.accept();
    first.beat(1, 1, "one");
    first.beat(1, 2, "two");
    first.drop();
    await vi.advanceTimersByTimeAsync(300);
    const second = FakeSocket.last();
    expect(second).not.toBe(first);
    expect(second.url).toContain("after=2");
    expect(second.url).toContain("epoch=1");
    second.accept();
    // The hub replays from 1 on every connect; the cursor drops the echo.
    second.beat(1, 1, "one");
    second.beat(1, 2, "two");
    second.beat(1, 3, "three");
    expect(said(seen)).toEqual(["one", "two", "three"]);
  });
});

describe("a beat ladder that has fallen", () => {
  it("climbs back out of polling and takes the socket the moment it opens", async () => {
    vi.useFakeTimers();
    const seen = await attached();
    FakeSocket.last().drop();
    await vi.advanceTimersByTimeAsync(50);
    expect(statuses(seen).at(-1)).toBe("degraded");
    const before = FakeSocket.opened.length;
    await vi.advanceTimersByTimeAsync(1_100);
    expect(FakeSocket.opened.length).toBe(before + 1);
    FakeSocket.last().accept();
    expect(statuses(seen).at(-1)).toBe("live");
    expect(notice(seen)).toBe("websocket");
  });

  /**
   * A rebase moves the cursor *and* forfeits the ladder's claim to know whose
   * run it is now watching: the frames carry an epoch and no conversation, so
   * the beats after one wait on a fresh `/chat/state` rather than being folded
   * on the strength of an answer about the previous run.
   */
  it("lets a second run through once the probe says whose it is", async () => {
    const seen = await attached();
    const socket = FakeSocket.last();
    socket.accept();
    socket.beat(1, 1, "one");
    socket.beat(1, 2, "two");
    hubEpoch = 2;
    socket.deliver({ type: "rebase", epoch: 2 });
    socket.beat(2, 1, "a new run");
    expect(said(seen)).toEqual(["one", "two"]);

    await settle();
    expect(said(seen)).toEqual(["one", "two", "a new run"]);
  });
});
