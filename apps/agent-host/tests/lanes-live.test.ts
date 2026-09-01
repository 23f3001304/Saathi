// Two conversations against one real host. Each gets its own lane, its own
// epoch and its own scoped wire; what must never happen is one chat's run
// showing up on the other's stream, however the two interleave.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ChatBeat } from "../src/http/chat-beat.js";
import type { Harness } from "./support/harness.js";
import { boot, teardown } from "./support/harness.js";

const KURTA = "cnv_lane_kurta";
const SHOES = "cnv_lane_shoes";

interface ScopedState {
  readonly result: { status: string; request: string } | null;
  readonly beats: readonly ChatBeat[];
  readonly conversation: string | null;
  readonly running: boolean;
  readonly epoch: number;
}

let harness: Harness;
let kurta: ScopedState;
let shoes: ScopedState;

async function state(chat: string): Promise<ScopedState> {
  const res = await fetch(
    `${harness.host.url}/chat/state?conversation=${chat}`,
  );
  return (await res.json()) as ScopedState;
}

async function begin(chat: string, message: string): Promise<void> {
  const res = await fetch(`${harness.host.url}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, conversation_id: chat }),
  });
  expect(res.status).toBe(202);
}

/** Polls the scoped state until that lane's run has settled. */
async function settled(chat: string): Promise<ScopedState> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const current = await state(chat);
    if (current.result !== null && current.result.status !== "running") {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`the ${chat} run never settled`);
}

/** One SSE replay, read until the stream goes quiet. */
async function replay(chat: string): Promise<readonly ChatBeat[]> {
  const res = await fetch(
    `${harness.host.url}/chat/stream?after=0&conversation=${chat}`,
  );
  const reader = res.body?.getReader();
  if (reader === undefined) return [];
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const idle = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 700),
    );
    const chunk = await Promise.race([reader.read(), idle]);
    if (chunk === null || chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text
    .split("\n\n")
    .filter((block) => block.trim().startsWith("id:"))
    .map((block) => block.split("\n")[1]?.replace(/^data:\s*/, "") ?? "")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as ChatBeat);
}

beforeAll(async () => {
  harness = await boot();
  // Both sentences before either answer: two lanes, however the cap on this
  // machine interleaves them, and the second must not wait to be accepted.
  await begin(KURTA, "A navy kurta under 2000 rupees, refundable.");
  await begin(SHOES, "A pair of road running shoes under 2500, refundable, from Kolam Run.");
  kurta = await settled(KURTA);
  shoes = await settled(SHOES);
}, 180_000);

afterAll(async () => {
  await teardown(harness);
});

describe("two conversations on one host", () => {
  it("finishes both runs, each under its own conversation", () => {
    expect(kurta.conversation).toBe(KURTA);
    expect(shoes.conversation).toBe(SHOES);
    expect(kurta.result?.request).toContain("kurta");
    expect(shoes.result?.request).toContain("running shoes");
  });

  it("gives the two lanes two different epochs", () => {
    expect(kurta.epoch).not.toBe(shoes.epoch);
  });

  it("serves each scoped stream exactly its own lane's beats", async () => {
    const kurtaBeats = await replay(KURTA);
    const shoesBeats = await replay(SHOES);
    expect(kurtaBeats.length).toBeGreaterThan(0);
    expect(shoesBeats.length).toBeGreaterThan(0);
    // The stream is the lane's own list, byte for byte, and nothing else's.
    expect(kurtaBeats).toEqual(kurta.beats);
    expect(shoesBeats).toEqual(shoes.beats);
    // Neither stream carries the other conversation's distinctive ask.
    expect(JSON.stringify(kurtaBeats)).not.toContain("running shoes");
    expect(JSON.stringify(shoesBeats)).not.toContain("kurta");
  });

});

describe("what the wire says about the lanes", () => {
  it("lists both lanes on GET /chat/lanes", async () => {
    const res = await fetch(`${harness.host.url}/chat/lanes`);
    const body = (await res.json()) as {
      ok: boolean;
      cap: number;
      lanes: readonly { conversation: string | null }[];
    };
    expect(body.ok).toBe(true);
    expect(body.cap).toBeGreaterThanOrEqual(1);
    const listed = body.lanes.map((row) => row.conversation);
    expect(listed).toContain(KURTA);
    expect(listed).toContain(SHOES);
  });

  it("keeps the unscoped wire answering, for the CLI and older clients", async () => {
    const res = await fetch(`${harness.host.url}/chat/state`);
    const body = (await res.json()) as ScopedState;
    expect([KURTA, SHOES]).toContain(body.conversation);
  });
});
