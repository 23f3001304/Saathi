// @vitest-environment node
//
// The push rungs' liveness check. A half-open websocket raises no error and
// delivers nothing — the run's closing beats sat on the host while the screen
// said "Working…" until somebody gave up. The heartbeat reads `/chat/state`
// under a stream believed live: what the stream lost is folded in anyway, and
// a stream caught behind twice running is reconnected.
import { afterEach, describe, expect, it, vi } from "vitest";

import { attach, newSession } from "../src/conversation/agentStream.ts";
import { RECONCILE_INTERVAL_MS } from "../src/conversation/beatReconcile.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";

const BASE = "http://host.invalid";

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
  beat(epoch: number, index: number, text: string): void {
    this.onmessage?.({
      data: JSON.stringify({
        type: "beat",
        epoch,
        index,
        beat: { offsetMs: 0, kind: "message", text },
      }),
    } as MessageEvent<string>);
  }
  static last(): FakeSocket {
    const socket = FakeSocket.opened.at(-1);
    if (socket === undefined) throw new Error("no socket was opened");
    return socket;
  }
}

/** The host's mutable truth: what `/chat/state` answers right now. */
const host = {
  epoch: 1,
  beats: [] as { offsetMs: number; kind: string; text: string }[],
};

function say(text: string): void {
  host.beats.push({ offsetMs: 0, kind: "message", text });
}

function stubHost(): void {
  host.epoch = 1;
  host.beats = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            beats: host.beats,
            awaiting: [],
            running: true,
            epoch: host.epoch,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

function said(signals: readonly AssistantSignal[]): string[] {
  return signals.flatMap((s) => (s.kind === "say" ? [s.text] : []));
}

async function liveSession(): Promise<AssistantSignal[]> {
  FakeSocket.opened = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  stubHost();
  const seen: AssistantSignal[] = [];
  await attach(newSession((signal) => seen.push(signal), BASE));
  FakeSocket.last().accept();
  return seen;
}

async function heartbeat(): Promise<void> {
  await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS + 50);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the reconciling heartbeat", () => {
  it("folds in the tail a silent stream never delivered", async () => {
    vi.useFakeTimers();
    const seen = await liveSession();
    say("the answer");
    say("the outcome line");
    // The socket stays silent — the half-open case. One heartbeat later the
    // closing beats are on screen anyway.
    await heartbeat();
    expect(said(seen)).toEqual(["the answer", "the outcome line"]);
    expect(FakeSocket.opened).toHaveLength(1);
  });

  it("does not repeat what the stream already delivered", async () => {
    vi.useFakeTimers();
    const seen = await liveSession();
    say("spoken");
    FakeSocket.last().beat(1, 1, "spoken");
    await heartbeat();
    await heartbeat();
    expect(said(seen)).toEqual(["spoken"]);
    // Clean heartbeats reconnect nothing.
    expect(FakeSocket.opened).toHaveLength(1);
  });

});

describe("what two misses mean", () => {
  it("reconnects a stream caught behind twice running", async () => {
    vi.useFakeTimers();
    const seen = await liveSession();
    say("one");
    await heartbeat();
    say("two");
    await heartbeat();
    // Both beats reached the screen through the heartbeat, and the second
    // miss declared the socket dead: a fresh connection was attempted.
    expect(said(seen)).toEqual(["one", "two"]);
    expect(FakeSocket.opened).toHaveLength(2);
  });

  it("folds a rebase the stream never announced", async () => {
    vi.useFakeTimers();
    const seen = await liveSession();
    say("old run");
    FakeSocket.last().beat(1, 1, "old run");
    // The host restarted into a new run underneath the silent socket.
    host.epoch = 2;
    host.beats = [{ offsetMs: 0, kind: "message", text: "new run" }];
    await heartbeat();
    expect(said(seen)).toEqual(["old run", "new run"]);
  });
});
