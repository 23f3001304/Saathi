// The read half of the conversation. A reloaded chat has nowhere else to get
// its transcript from — the words are not the browser's to keep — so it asks
// the host, and the host answers from the same PTLM rows the run wrote.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Harness } from "./support/harness.js";
import { boot, teardown } from "./support/harness.js";

const CHAT = "cnv_route_read";

const OTHER = "cnv_route_other";

const ASKED = "Running shoes under 4000 rupees";

const REPLIED = "I found four that fit. Shall I show them?";

interface HistoryBody {
  readonly ok: boolean;
  readonly conversation_id?: string;
  readonly lines?: readonly { speaker: string; text: string; at: string }[];
  readonly reason_code?: string;
}

let harness: Harness;

async function history(query: string): Promise<Response> {
  return await fetch(`${harness.host.url}/chat/history?${query}`);
}

async function linesOf(chat: string): Promise<readonly string[]> {
  const res = await history(`conversation_id=${encodeURIComponent(chat)}`);
  const body = (await res.json()) as HistoryBody;
  return (body.lines ?? []).map((line) => `[${line.speaker}] ${line.text}`);
}

beforeAll(async () => {
  harness = await boot();
  const memory = harness.host.root.buyer.conversation;
  await memory.remember(ASKED, CHAT);
  await memory.rememberAgent(REPLIED, CHAT);
  await memory.remember("yes", CHAT);
  await memory.remember("A navy kurta, refundable", OTHER);
}, 120_000);

afterAll(async () => {
  await teardown(harness);
});

describe("reading one conversation back", () => {
  it("returns both halves, oldest first, with the speaker kept", async () => {
    expect(await linesOf(CHAT)).toEqual([
      `[user] ${ASKED}`,
      `[agent] ${REPLIED}`,
      "[user] yes",
    ]);
  });

  it("answers for the conversation asked for and no other", async () => {
    const lines = await linesOf(CHAT);
    expect(lines.join(" ")).not.toContain("navy kurta");
    expect(await linesOf(OTHER)).toEqual(["[user] A navy kurta, refundable"]);
  });

  it("reads back identically twice, because reading writes nothing", async () => {
    const first = await linesOf(CHAT);
    const second = await linesOf(CHAT);
    expect(second).toEqual(first);
  });

  it("has nothing to say about a conversation that never happened", async () => {
    expect(await linesOf("cnv_never_spoken")).toEqual([]);
  });

  it("refuses a request that names no conversation", async () => {
    const res = await history("");
    expect(res.status).toBe(400);
    expect(((await res.json()) as HistoryBody).reason_code).toBe(
      "SCHEMA_VIOLATION",
    );
  });
});
