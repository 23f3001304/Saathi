// @vitest-environment node
//
// Reloading lost every word. The shelf survived — ids, titles, groups — so you
// came back to a named chat containing nothing. The transcript is not the
// browser's to keep, so a reloaded chat asks the host and seeds itself from
// PTLM before the first beat can land.
import { afterEach, describe, expect, it, vi } from "vitest";

import { reduceSignals } from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";
import { liveTransport } from "../src/conversation/liveTransport.ts";

const BASE = "http://host.invalid";

const CHAT = "cnv_reload";
const JSON_HEADERS = { "content-type": "application/json" };
const ASKED = "Running shoes under 4000 rupees";
const REPLIED = "I found four that fit. Shall I show them?";

interface Host {
  readonly lines: readonly { speaker: string; text: string }[];
  readonly beats: readonly { offsetMs: number; kind: string; text: string }[];
  readonly running: boolean;
}

const seenUrls: string[] = [];

const sentBodies: Record<string, unknown>[] = [];

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

function stubHost(host: Host): void {
  seenUrls.length = 0;
  sentBodies.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      seenUrls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") {
        sentBodies.push(
          JSON.parse(String(init.body)) as Record<string, unknown>,
        );
        return Promise.resolve(reply({ ok: true, run_id: "r", status: "ok" }));
      }
      if (url.startsWith(`${BASE}/chat/history`)) {
        return Promise.resolve(reply({ ok: true, lines: host.lines }));
      }
      if (url.includes("/chat/state")) {
        const { beats, running } = host;
        return Promise.resolve(
          reply({ beats, running, awaiting: [], conversation: CHAT }),
        );
      }
      throw new Error(`unexpected ${url}`);
    }),
  );
}

/** Node has no `EventSource`, so the ladder lands on polling; the first drain
 *  is a tick or two behind the call that started it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

async function openChat(
  host: Host,
  chat: string | null = CHAT,
): Promise<AssistantSignal[]> {
  stubHost(host);
  const seen: AssistantSignal[] = [];
  const stop = liveTransport(BASE, chat).start((signal) => seen.push(signal));
  await settle();
  stop();
  return seen;
}

function transcript(signals: readonly AssistantSignal[]): string[] {
  return reduceSignals(signals).entries.flatMap((entry) =>
    entry.kind === "buyer" || entry.kind === "agent"
      ? [`[${entry.kind}] ${entry.text}`]
      : [],
  );
}

const DIALOGUE = [
  { speaker: "user", text: ASKED },
  { speaker: "agent", text: REPLIED },
  { speaker: "user", text: "yes" },
];

const FINISHED: Host = {
  lines: DIALOGUE,
  beats: [{ offsetMs: 0, kind: "message", text: REPLIED }],
  running: false,
};

describe("coming back to the conversation you left", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds the transcript from memory, in order, speaker kept", async () => {
    expect(transcript(await openChat(FINISHED))).toEqual([
      `[buyer] ${ASKED}`,
      `[agent] ${REPLIED}`,
      "[buyer] yes",
    ]);
  });

  it("restores before any beat, so history is never spliced in behind", async () => {
    const signals = await openChat({
      ...FINISHED,
      beats: [{ offsetMs: 0, kind: "message", text: "A later sentence." }],
      running: true,
    });
    expect(transcript(signals)).toEqual([
      `[buyer] ${ASKED}`,
      `[agent] ${REPLIED}`,
      "[buyer] yes",
      "[agent] A later sentence.",
    ]);
  });

  it("writes nothing back: a restored line is history, not a new claim", async () => {
    await openChat(FINISHED);
    expect(seenUrls.filter((call) => call.startsWith("POST "))).toEqual([]);
    expect(seenUrls.some((call) => call.includes("/chat/history"))).toBe(true);
  });

  it("asks for no history at all when the chat was shelved without an id", async () => {
    const signals = await openChat(FINISHED, null);
    expect(seenUrls.some((call) => call.includes("/chat/history"))).toBe(false);
    expect(transcript(signals)).toEqual([]);
  });
});

/** A blank id is refused by `POST /chat`'s schema: letting one through would
 *  not merely lose the history, it would turn every sentence typed into that
 *  chat into a schema violation that starts no run at all. */
describe("a chat shelved with a blank id", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a blank id as no id rather than sending it on the wire", async () => {
    stubHost(FINISHED);
    const seen: AssistantSignal[] = [];
    const transport = liveTransport(BASE, "");
    const stop = transport.start((signal) => seen.push(signal));
    await settle();
    transport.send("A cotton kurta");
    await settle();
    stop();
    expect(seenUrls.some((call) => call.includes("/chat/history"))).toBe(false);
    expect(sentBodies).toEqual([
      { message: "A cotton kurta", conversation_id: null, reply_language: null },
    ]);
  });
});

/** The two sources differ by design. Beats are what a run is doing now, and
 *  `attach` skips a finished one's backlog so a fresh chat does not open onto
 *  somebody else's purchase; the dialogue is what was said, and it outlives the
 *  run. Where they overlap, exactly one of them may reach the screen. */
describe("memory and the beat stream do not double up", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a line once when it is both remembered and replayed", async () => {
    const signals = await openChat({ ...FINISHED, running: true });
    expect(transcript(signals).filter((l) => l.endsWith(REPLIED))).toHaveLength(
      1,
    );
  });

  it("still skips a finished run's backlog rather than replaying it", async () => {
    const signals = await openChat({
      lines: [],
      beats: [{ offsetMs: 0, kind: "message", text: "Somebody else's cart." }],
      running: false,
    });
    expect(transcript(signals)).toEqual([]);
  });

  it("still adopts a run in flight, so a reload rejoins it", async () => {
    const signals = await openChat({
      lines: [],
      beats: [{ offsetMs: 0, kind: "message", text: "Your bill is ready." }],
      running: true,
    });
    expect(transcript(signals)).toEqual(["[agent] Your bill is ready."]);
  });
});
