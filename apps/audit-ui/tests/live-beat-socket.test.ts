// @vitest-environment node
//
// The beat socket's wire, asserted against a real agent-host rather than a
// mock: one purchase streamed live over `GET /chat/ws`, then the replay,
// resume and rebase behaviours a reconnecting client depends on. The SSE route
// beside it is pinned separately by `live-sse-wire.test.ts`; what this file
// adds is the rung above it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { boot, runPurchase, waitFor, type LiveHarness } from "./support/liveHarness.ts";
import { parseBeat } from "../src/api/agentBeat.ts";

interface Frame {
  type: string;
  epoch?: number;
  index?: number;
  beat?: unknown;
  seq?: number;
}

interface Wire {
  frames: Frame[];
  socket: WebSocket;
}

const OPEN = 1;

function socketUrl(harness: LiveHarness, query: string): string {
  return `${harness.hostUrl.replace(/^http/, "ws")}/chat/ws${query}`;
}

/** Answers the host's heartbeat, so the connection is not reaped mid-read. */
function listen(url: string): Wire {
  const frames: Frame[] = [];
  const socket = new WebSocket(url);
  socket.onmessage = (event: MessageEvent<string>) => {
    const frame = JSON.parse(event.data) as Frame;
    frames.push(frame);
    if (frame.type === "ping")
      socket.send(JSON.stringify({ type: "pong", seq: frame.seq }));
  };
  return { frames, socket };
}

async function opened(wire: Wire): Promise<Wire> {
  await waitFor("the beat socket to open", () => wire.socket.readyState === OPEN);
  return wire;
}

/** Reads the replay until the hub goes quiet, then hangs up like a closed tab. */
async function readOnce(url: string): Promise<Frame[]> {
  const wire = await opened(listen(url));
  let counted = -1;
  while (counted !== wire.frames.length) {
    counted = wire.frames.length;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  wire.socket.close();
  return wire.frames;
}

function beatsOf(frames: readonly Frame[]): Frame[] {
  return frames.filter((frame) => frame.type === "beat");
}

let harness: LiveHarness;
let live: Wire;
let epoch = 0;
let replay: Frame[] = [];
let resumed: Frame[] = [];
let stale: Frame[] = [];

beforeAll(async () => {
  harness = await boot();
  live = await opened(listen(socketUrl(harness, "?after=0")));
  await runPurchase(harness, "A navy kurta under 2000 rupees, refundable.");
  await waitFor("the outcome beat on the socket", () =>
    beatsOf(live.frames).some(
      (frame) => (frame.beat as { kind?: string }).kind === "outcome",
    ),
  );
  epoch = beatsOf(live.frames)[0]?.epoch ?? 0;
  live.socket.close();
  replay = await readOnce(socketUrl(harness, `?after=0&epoch=${epoch}`));
  resumed = await readOnce(socketUrl(harness, `?after=5&epoch=${epoch}`));
  stale = await readOnce(socketUrl(harness, `?after=5&epoch=${epoch + 99}`));
}, 240_000);

afterAll(async () => {
  await harness?.shutdown();
});

describe("agent-host /chat/ws", () => {
  it("streams a whole run as `beat` frames, indices ascending from 1", () => {
    const beats = beatsOf(live.frames);
    expect(beats.length).toBeGreaterThan(5);
    expect(beats.map((frame) => frame.index)).toEqual(
      beats.map((_, i) => i + 1),
    );
    expect(new Set(beats.map((frame) => frame.epoch)).size).toBe(1);
  });

  it("carries payloads the shipped client's parser accepts", () => {
    const parsed = beatsOf(live.frames).map((frame) => parseBeat(frame.beat));
    expect(parsed.filter((beat) => beat === null)).toEqual([]);
    expect(parsed.map((beat) => beat?.kind)).toContain("outcome");
  });

  it("rebases a socket that was attached when the run began", () => {
    // `runPurchase` starts the run, which rebases the hub to a fresh epoch.
    expect(live.frames.some((frame) => frame.type === "rebase")).toBe(true);
  });

  it("answers a client ping with the same seq, so a dead link is detectable", async () => {
    const wire = await opened(listen(socketUrl(harness, `?after=0&epoch=${epoch}`)));
    wire.socket.send(JSON.stringify({ type: "ping", seq: 4242 }));
    await waitFor("the pong", () =>
      wire.frames.some((frame) => frame.type === "pong" && frame.seq === 4242),
    );
    wire.socket.close();
  });
});

describe("resuming a beat socket", () => {
  it("replays the whole run for a cursor at zero", () => {
    expect(beatsOf(replay).length).toBe(beatsOf(live.frames).length);
    expect(replay.some((frame) => frame.type === "rebase")).toBe(false);
  });

  it("honours `?after=` so a reconnect resumes rather than repeats", () => {
    const beats = beatsOf(resumed);
    expect(beats.length).toBe(beatsOf(replay).length - 5);
    expect(beats[0]?.index).toBe(6);
  });

  it("rebases a cursor from a run the host no longer holds", () => {
    // The half a restarted process leaves behind: indices that mean nothing.
    expect(stale[0]?.type).toBe("rebase");
    expect(beatsOf(stale).length).toBe(beatsOf(replay).length);
    expect(beatsOf(stale)[0]?.index).toBe(1);
  });
});
