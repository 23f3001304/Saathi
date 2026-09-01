// The claim worth being able to make: the conversation is an API, not this
// app's internal state. A run happens, the host is restarted so the in-memory
// hub is empty, and `GET /chat/history` still hands any client the whole run —
// the option cards, the pills, the cart, the verdict — addressed as it was.
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { startAgentHost } from "../src/server-runtime.js";
import type { Harness } from "./support/harness.js";
import { CAP_PAISE, TENANT, boot, teardown } from "./support/harness.js";

const CHAT = "cnv_durable_run";

const REQUEST = "A pair of road running shoes under 2500, from Kolam Run.";

interface HistoryBody {
  readonly lines?: readonly { speaker: string; text: string }[];
  readonly beats?: readonly {
    epoch: number;
    index: number;
    beat: { kind: string };
  }[];
  readonly cursor?: { epoch: number; index: number } | null;
}

interface StateBody {
  readonly epoch: number;
  readonly beats: readonly { kind: string }[];
  readonly result: { status: string } | null;
  readonly conversation?: string | null;
}

let harness: Harness;
let before: HistoryBody;
let after: HistoryBody;
let published: readonly { kind: string }[] = [];
let restartedEpoch = 0;
let liveConversation: string | null | undefined;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

async function stateOf(): Promise<StateBody> {
  const res = await fetch(`${harness.host.url}/chat/state`);
  return (await res.json()) as StateBody;
}

async function historyOf(): Promise<HistoryBody> {
  const query = `conversation_id=${encodeURIComponent(CHAT)}`;
  const res = await fetch(`${harness.host.url}/chat/history?${query}`);
  return (await res.json()) as HistoryBody;
}

async function runOnce(): Promise<void> {
  const started = await fetch(`${harness.host.url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: REQUEST, conversation_id: CHAT }),
  });
  if (started.status !== 202) throw new Error(`POST /chat → ${started.status}`);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const current = await stateOf();
    if (current.result !== null && current.result.status !== "running") return;
    await sleep(50);
  }
  throw new Error("the purchase never left `running`");
}

/** The restart the proof turns on: same database, same keys, empty hub. */
async function restart(): Promise<void> {
  await harness.host.shutdown("SIGTERM");
  harness = {
    ...harness,
    host: startAgentHost(
      loadConfig({
        PORT: "0",
        COVENANT_GATEWAY_URL: harness.gateway.url,
        COVENANT_DB: join(harness.dir, "covenant.db"),
        COVENANT_KEY_DIR: join(harness.dir, "keys"),
        COVENANT_TENANT: TENANT,
        COVENANT_AGENT_MODE: "scripted",
        COVENANT_AGENT_CAP_PAISE: String(CAP_PAISE),
        COVENANT_AGENT_AUTOSIGN: "true",
        LOG_LEVEL: "fatal",
      }),
    ),
  };
}

beforeAll(async () => {
  harness = await boot();
  await runOnce();
  liveConversation = (await stateOf()).conversation;
  published = (await stateOf()).beats;
  before = await historyOf();
  await restart();
  restartedEpoch = (await stateOf()).epoch;
  after = await historyOf();
}, 180_000);

afterAll(async () => {
  await teardown(harness);
});

describe("what a finished run leaves behind", () => {
  it("keeps answering `lines`, so a caller that only knows lines still reads", () => {
    expect((before.lines ?? []).length).toBeGreaterThan(0);
    expect((before.lines ?? [])[0]?.speaker).toBe("user");
  });

  it("files the shopper's own sentence ahead of the run it started", () => {
    const first = (before.beats ?? [])[0];
    expect(first?.beat.kind).toBe("buyer");
    expect(first?.epoch).toBe(0);
  });

  // Deliberately compared against the hub rather than against a list of kinds
  // this test names: what has to be true is that *nothing the run published*
  // was lost, whatever this particular run happened to publish.
  it("holds every beat the hub published, in order and addressed the same", () => {
    const streamed = (before.beats ?? []).filter((entry) => entry.epoch !== 0);
    expect(streamed.map((entry) => entry.beat.kind)).toEqual(
      published.map((beat) => beat.kind),
    );
    expect(streamed.map((entry) => entry.index)).toEqual(
      published.map((_, offset) => offset + 1),
    );
    expect(before.cursor).toEqual({
      epoch: streamed.at(-1)?.epoch,
      index: published.length,
    });
  });
});

describe("after the host has been restarted", () => {
  it("reports an empty hub, which is the whole problem", async () => {
    expect((await stateOf()).beats).toHaveLength(0);
  });

  it("hands the same run back, beat for beat and address for address", () => {
    expect(after.beats).toEqual(before.beats);
    expect(after.cursor).toEqual(before.cursor);
  });

  it("never reuses an address the log already holds", () => {
    expect(restartedEpoch).toBeGreaterThan(before.cursor?.epoch ?? 0);
  });

  it("named the conversation while its beats were live, and disowns them after", async () => {
    // The hub is one fan-out for the whole host; this field is what lets a
    // client showing another chat refuse a run that is not its own. After the
    // restart the hub is empty, so `null` is the truthful answer there.
    expect(liveConversation).toBe(CHAT);
    const current = await stateOf();
    expect(current.conversation).toBeNull();
    expect(current.beats).toHaveLength(0);
  });
});
