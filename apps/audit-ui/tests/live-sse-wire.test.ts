// @vitest-environment node
//
// Node keeps `EventSource` behind `--experimental-eventsource`, which the repo
// gate does not pass, so the live suites above exercise the polling half of
// both transports. This one covers the other half honestly: it asserts the
// exact wire the shipped `EventSource` clients consume — the `id:`/`data:`
// framing, the `?after=` resume both hubs read, and that every payload parses
// into the type the client casts it to.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { boot, runPurchase, type LiveHarness } from "./support/liveHarness.ts";
import { parseBeat } from "../src/api/agentBeat.ts";
import type { LedgerFrame } from "../src/ledger/types.ts";

interface WireEvent {
  id: string;
  data: string;
}

const READ_BUDGET_MS = 8000;

/** No further chunk for this long means the replay is done. */
const IDLE_MS = 700;

function eventsOf(text: string): WireEvent[] {
  return text
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.startsWith("id:"))
    .map((block) => {
      const [idLine = "", dataLine = ""] = block.split("\n");
      return {
        id: idLine.replace(/^id:\s*/, ""),
        data: dataLine.replace(/^data:\s*/, ""),
      };
    });
}

async function drain(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<string> {
  const decoder = new TextDecoder();
  const deadline = Date.now() + READ_BUDGET_MS;
  let text = "";
  for (;;) {
    const idle = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), IDLE_MS),
    );
    const chunk = await Promise.race([reader.read(), idle]);
    if (chunk === null || chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    if (Date.now() > deadline) break;
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

/** Reads the replay until the hub goes quiet, then hangs up like a closed tab. */
async function readStream(url: string): Promise<WireEvent[]> {
  const res = await fetch(url);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  if (res.body === null) return [];
  return eventsOf(await drain(res.body.getReader()));
}

let harness: LiveHarness;
let beatEvents: WireEvent[] = [];
let frameEvents: WireEvent[] = [];

beforeAll(async () => {
  harness = await boot();
  await runPurchase(harness, "A navy kurta under 2000 rupees, refundable.");
  beatEvents = await readStream(`${harness.hostUrl}/chat/stream?after=0`);
  frameEvents = await readStream(`${harness.gatewayUrl}/v1/ledger/stream?after=0`);
}, 180_000);

afterAll(async () => {
  await harness?.shutdown();
});

describe("agent-host /chat/stream", () => {
  it("frames beats as `id: <n>` + one JSON `data:` line", () => {
    expect(beatEvents.length).toBeGreaterThan(5);
    expect(beatEvents.map((e) => Number(e.id))).toEqual(
      beatEvents.map((_, i) => i + 1),
    );
  });

  it("emits payloads the shipped client's parser accepts", () => {
    const parsed = beatEvents.map((e) => parseBeat(JSON.parse(e.data)));
    expect(parsed.filter((beat) => beat === null)).toEqual([]);
    expect(parsed.map((beat) => beat?.kind)).toContain("outcome");
  });
});

describe("gateway-svc /v1/ledger/stream", () => {
  it("replays `seq > after` as §4.2 frames, ids ascending", () => {
    expect(frameEvents.length).toBeGreaterThan(10);
    const frames = frameEvents.map((e) => JSON.parse(e.data) as LedgerFrame);
    expect(frames.map((f) => String(f.id))).toEqual(
      frameEvents.map((e) => e.id),
    );
    const ids = frames.map((f) => f.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(frames.every((f) => /^[0-9a-f]{64}$/.test(f.this_hash))).toBe(true);
  });

  it("honours `?after=` so a reconnect resumes rather than replays", async () => {
    const cursor = Number(frameEvents[4]?.id ?? 0);
    const resumed = await readStream(
      `${harness.gatewayUrl}/v1/ledger/stream?after=${cursor}`,
    );
    expect(resumed.length).toBe(frameEvents.length - 5);
    expect(Number(resumed[0]?.id)).toBe(cursor + 1);
  });
});
