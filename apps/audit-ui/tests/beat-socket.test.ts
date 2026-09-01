// @vitest-environment node
//
// The socket rung on its own, on a fake `WebSocket` so the liveness clock can
// be wound by hand. The point being pinned: a connection that has died without
// either end being told — a suspended laptop, a proxy that reaped an idle
// socket — is *detected*, not waited on.
import { afterEach, describe, expect, it, vi } from "vitest";

import { openBeatSocket, type SocketHandlers } from "../src/conversation/beatSocket.ts";
import type { AgentBeat } from "../src/api/agentBeat.ts";

const SAID = { offsetMs: 0, kind: "message", text: "Looking at the catalog." };

class FakeSocket {
  static open: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: string[] = [];
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.open.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  accept(): void {
    this.onopen?.();
  }

  deliver(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent<string>);
  }

  static last(): FakeSocket {
    const socket = FakeSocket.open.at(-1);
    if (socket === undefined) throw new Error("no socket was opened");
    return socket;
  }

  static frames(socket: FakeSocket): { type: string; seq?: number }[] {
    return socket.sent.map((raw) => JSON.parse(raw) as { type: string });
  }
}

interface Seen {
  opens: number;
  beats: { epoch: number; index: number; beat: AgentBeat }[];
  rebases: number[];
  dead: string[];
}

function spy(): { seen: Seen; handlers: SocketHandlers } {
  const seen: Seen = { opens: 0, beats: [], rebases: [], dead: [] };
  return {
    seen,
    handlers: {
      onOpen: () => {
        seen.opens += 1;
      },
      onBeat: (epoch, index, beat) => seen.beats.push({ epoch, index, beat }),
      onRebase: (epoch) => seen.rebases.push(epoch),
      onDead: (detail) => seen.dead.push(detail),
    },
  };
}

function arrange(): { seen: Seen; socket: FakeSocket } {
  FakeSocket.open = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  const { seen, handlers } = spy();
  openBeatSocket("ws://host.invalid/chat/ws?after=0", handlers);
  return { seen, socket: FakeSocket.last() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the beat socket's frames", () => {
  it("reports beats with the epoch they belong to", () => {
    const { seen, socket } = arrange();
    socket.accept();
    socket.deliver({ type: "beat", epoch: 2, index: 1, beat: SAID });
    expect(seen.opens).toBe(1);
    expect(seen.beats).toEqual([{ epoch: 2, index: 1, beat: SAID }]);
  });

  it("passes a rebase through and drops anything unreadable", () => {
    const { seen, socket } = arrange();
    socket.accept();
    socket.deliver({ type: "rebase", epoch: 3 });
    socket.onmessage?.({ data: "}{ not json" } as MessageEvent<string>);
    socket.deliver({ type: "beat", epoch: 3, index: 1, beat: { kind: "who?" } });
    expect(seen.rebases).toEqual([3]);
    expect(seen.beats).toEqual([]);
    expect(seen.dead).toEqual([]);
  });

  it("answers the host's ping, so the host does not reap it", () => {
    const { socket } = arrange();
    socket.accept();
    socket.deliver({ type: "ping", seq: 7 });
    expect(FakeSocket.frames(socket)).toEqual([{ type: "pong", seq: 7 }]);
  });
});

describe("the beat socket's liveness clock", () => {
  it("pings when idle and calls the link dead when no pong comes back", () => {
    vi.useFakeTimers();
    const { seen, socket } = arrange();
    socket.accept();
    vi.advanceTimersByTime(22_500);
    expect(FakeSocket.frames(socket).map((f) => f.type)).toEqual(["ping"]);
    expect(seen.dead).toEqual([]);
    vi.advanceTimersByTime(6_000);
    expect(seen.dead).toEqual(["the connection stopped answering"]);
    expect(socket.closed).toBe(true);
  });

  it("takes any frame as proof of life and rearms", () => {
    vi.useFakeTimers();
    const { seen, socket } = arrange();
    socket.accept();
    vi.advanceTimersByTime(22_500);
    socket.deliver({ type: "pong", seq: 1 });
    vi.advanceTimersByTime(6_000);
    expect(seen.dead).toEqual([]);
  });

  it("gives up on a socket that never opens at all", () => {
    vi.useFakeTimers();
    const { seen } = arrange();
    vi.advanceTimersByTime(4_500);
    expect(seen.dead).toEqual(["the connection never opened"]);
  });
});
