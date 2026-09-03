// What the Windows screen's own bookkeeping costs the watch.
//
// `browser-stream-remount.test.tsx` measures the price of a teardown: one
// changed lane id, or one unmount of the pane, is a full close and reopen —
// "the subscriber went away" in agent-host's log, a screencast stopped and
// started, a card repainting from nothing. This measures the two ways the
// screen used to spend that price over nothing at all:
//
//   - the lane list is unordered and arrives fresh every three seconds, so
//     `lanes[0]` named a different chat from one poll to the next;
//   - `fetchLanes` turns an unreachable host, a 500, or a hiccup into an
//     empty list (lanes.ts), and one such poll unmounted the pane.
//
// Neither is news about the window, so neither may cost a subscription.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LaneRow } from "../src/api/lanes.ts";
import { Windows } from "../src/screens/Windows.tsx";

const BASE = "http://127.0.0.1:45911";

const SESSION = {
  id: "web_one",
  merchant: "amazon.in",
  url: "https://www.amazon.in/s?k=ssd",
  title: "amazon.in/s",
  state: "agent-drive",
  handoff: null,
  actions: [],
  conversation: "chat_one",
};

const lane = (conversation: string): LaneRow => ({
  conversation,
  running: true,
  queued: null,
  attention: null,
  window: true,
});

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

const answer = (body: unknown, status = 200): Response =>
  ({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

/** The lane list each poll gets, in order; the last one repeats. */
let polls: readonly LaneRow[][] = [];
let polled = 0;

function serve(url: string): Response {
  if (url.includes("/chat/lanes")) {
    const rows = polls[Math.min(polled, polls.length - 1)] ?? [];
    polled += 1;
    return answer({ lanes: rows });
  }
  if (url.includes("/browser/handshake")) return answer({ ok: true, key: "k" });
  if (url.includes("/browser/state")) {
    return answer({ ok: true, session: SESSION });
  }
  return answer({ ok: false }, 404);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms));

afterEach(() => {
  FakeSource.opened.length = 0;
  Reflect.deleteProperty(globalThis, "EventSource");
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  polls = [];
  polled = 0;
});

describe("the lane the Windows screen is showing", () => {
  it("survives an empty poll and a list that came back reordered", async () => {
    Reflect.set(globalThis, "EventSource", FakeSource);
    vi.stubEnv("VITE_AGENT_URL", BASE);
    vi.stubGlobal("fetch", (input: unknown) =>
      Promise.resolve(serve(String(input))),
    );
    // Poll 1: two lanes. Poll 2: the host hiccups and answers with nothing.
    // Poll 3: the same two lanes, in the other order.
    polls = [
      [lane("chat_one"), lane("chat_two")],
      [],
      [lane("chat_two"), lane("chat_one")],
    ];

    const view = render(<Windows />);
    await sleep(500);
    expect(FakeSource.opened.length).toBe(1);
    const socket = FakeSource.opened[0];
    expect(socket?.url).toContain("conversation=chat_one");

    // The empty poll, then the reordered one. Nothing here is news about the
    // window this pane is watching, so the socket opened for it stays open.
    await sleep(3_400);
    expect(polled).toBeGreaterThan(1);
    expect(socket?.closed).toBe(0);
    expect(FakeSource.opened.length).toBe(1);

    await sleep(3_400);
    expect(polled).toBeGreaterThan(2);
    expect(socket?.closed).toBe(0);
    expect(FakeSource.opened.length).toBe(1);

    view.unmount();
    await sleep(100);
    expect(socket?.closed).toBe(1);
  }, 60_000);
});
